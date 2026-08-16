import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Memory } from "@guerrero-dev/domain";
import {
  CandidateDetectionService,
  type CandidateExtractionResult,
  DeterministicCandidateExtractor,
  DeterministicCommitAnalyzer,
  DeterministicCommitNoiseFilter,
  DeterministicMemoryCandidateValidator,
  MemoryCandidateDeduplicator,
  MemoryCandidateEvaluator,
  MemoryCandidatePromoter,
  MemoryCandidateScorer,
  NoopMemoryConflictDetector,
} from "@guerrero-dev/application";
import {
  createDrizzleClient,
  createPostgresPool,
  DrizzleMemoryCandidateRetriever,
  DrizzleMemoryEmbeddingRepository,
  DrizzleMemoryPromotionUnitOfWork,
  DrizzleMemoryRepository,
  DrizzleMemorySourceRepository,
  GitCommitCollector,
  GitHistorySource,
  loadConfig,
  OllamaEmbeddingProvider,
  pingOllama,
  runMigrations,
  type PgPool,
} from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 4.9-B): segundo escenario end-to-end del
 * Memory Engine — demuestra que un candidato real, detectado desde Git
 * real, es reconocido por el deduplicador real (Ollama + pgvector, sin
 * ningún mock) como duplicado de una `Memory` ya existente, y que
 * `MemoryCandidatePromoter` ejecuta la rama de actualización que 4.7 ya
 * define (`action: "updated"`), no una segunda `Memory`.
 *
 * **Frontera con 4.9-A**: 4.9-A ya demostró la creación de una `Memory`
 * nueva. Este escenario no repite esa prueba — parte de una `Memory` que
 * "ya existía" (sembrada directamente en Postgres, como el estado inicial
 * legítimo de producción) y se concentra exclusivamente en: detección real
 * del duplicado + rama de actualización real.
 *
 * **Por qué la Memory se siembra directamente en Postgres, en vez de
 * promoverla vía el pipeline (que sería más "real"):** `IMemoryPromotionUnitOfWork`
 * (Fase 4.7) no expone `IMemoryEmbeddingRepository` — `MemoryCandidatePromoter`
 * nunca escribe en `memory_embeddings` al crear una `Memory`. Confirmado
 * leyendo `MemoryPromotionRepositories` antes de diseñar este test, no
 * asumido. Eso significa que, tal como está implementado HOY, una `Memory`
 * recién promovida nunca sería encontrada por `DrizzleMemoryCandidateRetriever`
 * (que hace `INNER JOIN memory_embeddings`) — ni siquiera si fuera idéntica
 * a un candidato nuevo. Sembrar la `Memory` + su `MemoryEmbedding`
 * directamente representa el estado real de una memoria "ya indexada" sin
 * fingir un paso de promoción que el sistema no ejecuta todavía.
 *
 * **Gap documentado, deliberadamente NO corregido en este commit**: la
 * promoción de una `Memory` nueva no persiste su embedding. Es una
 * decisión pendiente sobre el contrato de `IMemoryPromotionUnitOfWork`
 * (Fase 4.7), no parte de 4.9-B — ver docs/fase-4-memory-engine.md.
 *
 * El único fixture controlado por este test es el estado inicial (la
 * `Memory`/`MemorySource`/`MemoryEmbedding` sembrados); todo lo que ocurre
 * después —detección, deduplicación, evaluación, promoción— corre contra
 * infraestructura real, sin ningún doble de test.
 *
 * Se salta si RUN_INTEGRATION_TESTS no está en "true", y verifica
 * disponibilidad de Ollama en runtime (mismo criterio que
 * `candidate-promotion-e2e.test.ts` / `embedding-provider.test.ts`).
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

// Mismo commit real de 4.8/4.9-A — reduce variables, ya tiene cobertura.
const BF7F9FB = "bf7f9fb6f073c11d7ca0a0d3910348a605ce558f";

// sourceReference del MemorySource sembrado por el fixture — deliberadamente
// distinto de BF7F9FB para poder distinguir inequívocamente, después de
// correr el pipeline, cuál MemorySource ya existía y cuál produjo la
// promoción real (ver JSDoc del archivo).
const FIXTURE_SOURCE_REFERENCE = "fixture:4.9-B:bf7f9fb";

// Confidence/importance del seed deliberadamente distintos del baseline
// 0.5/0.5 que produce DeterministicCandidateExtractor — así un cambio a
// 0.5/0.5 tras la promoción demuestra que el UPDATE ocurrió de verdad, no
// que el valor ya coincidía por casualidad.
const SEED_CONFIDENCE = 0.3;
const SEED_IMPORTANCE = 0.3;

describe.skipIf(!RUN)(
  "Pipeline completo: candidato real -> duplicado de Memory existente (Fase 4.9-B)",
  () => {
    let pool: PgPool;
    let ollamaAvailable = false;
    let collector: GitCommitCollector;
    let detectionService: CandidateDetectionService;
    let evaluator: MemoryCandidateEvaluator;
    let promoter: MemoryCandidatePromoter;
    let memoryRepo: DrizzleMemoryRepository;
    let memorySourceRepo: DrizzleMemorySourceRepository;
    let embeddingRepo: DrizzleMemoryEmbeddingRepository;
    let embeddingProvider: OllamaEmbeddingProvider;

    beforeAll(async () => {
      const config = loadConfig();
      ollamaAvailable = await pingOllama(config.OLLAMA_BASE_URL);

      pool = createPostgresPool(config);
      await runMigrations(pool);
      const db = createDrizzleClient(pool);

      // Limpieza acotada a las DOS sourceReference que este fixture puede
      // haber dejado en una corrida anterior (la sembrada y la real que
      // produce el pipeline) — mismo criterio que 4.9-A, nunca un reset
      // global. ON DELETE CASCADE hace que borrar la Memory sea suficiente.
      await pool.query(
        "DELETE FROM memories WHERE id IN (SELECT memory_id FROM memory_sources WHERE source_reference IN ($1, $2))",
        [FIXTURE_SOURCE_REFERENCE, BF7F9FB],
      );

      const repoRoot = process.cwd();
      collector = new GitCommitCollector(repoRoot);
      const historySource = new GitHistorySource(repoRoot);
      const analyzer = new DeterministicCommitAnalyzer(historySource);
      const noiseFilter = new DeterministicCommitNoiseFilter();
      const extractor = new DeterministicCandidateExtractor();
      detectionService = new CandidateDetectionService(analyzer, noiseFilter, extractor);

      memoryRepo = new DrizzleMemoryRepository(db);
      memorySourceRepo = new DrizzleMemorySourceRepository(db);
      embeddingRepo = new DrizzleMemoryEmbeddingRepository(db);

      embeddingProvider = new OllamaEmbeddingProvider(
        config.OLLAMA_BASE_URL,
        config.OLLAMA_EMBEDDING_MODEL,
        config.EMBEDDING_DIMENSIONS,
      );
      const candidateRetriever = new DrizzleMemoryCandidateRetriever(db);
      const deduplicator = new MemoryCandidateDeduplicator(embeddingProvider, candidateRetriever);
      const validator = new DeterministicMemoryCandidateValidator();
      const conflictDetector = new NoopMemoryConflictDetector();
      const scorer = new MemoryCandidateScorer();
      evaluator = new MemoryCandidateEvaluator(validator, deduplicator, conflictDetector, scorer);

      const unitOfWork = new DrizzleMemoryPromotionUnitOfWork(db);
      promoter = new MemoryCandidatePromoter(unitOfWork);

      if (ollamaAvailable) {
        await embeddingProvider.embed("warmup");
      }
    }, 30_000);

    afterAll(async () => {
      await pool.end();
    });

    it("bf7f9fb: candidato real -> Deduplicator real encuentra la Memory sembrada -> UPDATE, no CREATE", async () => {
      if (!ollamaAvailable) return;

      // 1-2. Cadena real hasta obtener el candidato — mismo commit y misma
      // regla (SCHEMA_PATH) que 4.9-A.
      const snapshot = await collector.collect(BF7F9FB);
      const detectionResults = await detectionService.detect(snapshot);
      const promotable = detectionResults.find(
        (
          r,
        ): r is CandidateExtractionResult & {
          candidate: NonNullable<CandidateExtractionResult["candidate"]>;
        } => r.outcome !== "rejected" && r.candidate !== null,
      );
      if (!promotable)
        throw new Error("bf7f9fb no produjo ningún candidato promocionable — fixture inválido");

      // 3-6. Fixture: Memory + MemoryEmbedding + MemorySource sembrados
      // directamente en Postgres con el content REAL del candidato (no
      // hardcodeado) — ver JSDoc del archivo para por qué se siembra en vez
      // de promoverse vía el pipeline.
      const now = new Date();
      const seedMemory: Memory = {
        id: randomUUID(),
        projectId: null,
        scope: "global",
        type: promotable.candidate.type,
        content: promotable.candidate.content,
        status: "active",
        confidence: SEED_CONFIDENCE,
        importance: SEED_IMPORTANCE,
        createdAt: now,
        updatedAt: now,
        lastVerifiedAt: now,
        expiresAt: null,
      };
      const seededMemory = await memoryRepo.create(seedMemory);

      const seedEmbedding = await embeddingProvider.embed(promotable.candidate.content);
      await embeddingRepo.create({
        id: randomUUID(),
        memoryId: seededMemory.id,
        embedding: seedEmbedding.values,
        provider: "ollama",
        model: seedEmbedding.model,
        dimensions: seedEmbedding.dimensions,
        createdAt: now,
      });

      await memorySourceRepo.add({
        id: randomUUID(),
        memoryId: seededMemory.id,
        sourceType: "commit",
        sourceReference: FIXTURE_SOURCE_REFERENCE,
        excerpt: null,
        metadata: {},
        createdAt: now,
      });

      // Estado inicial confirmado antes de correr el escenario real — no
      // confiamos ciegamente en que la limpieza + el seed dejaron lo
      // esperado.
      const sourcesBefore = await memorySourceRepo.findByMemory(seededMemory.id);
      expect(sourcesBefore).toHaveLength(1);
      expect(sourcesBefore[0]?.sourceReference).toBe(FIXTURE_SOURCE_REFERENCE);

      const beforePromotion = new Date();

      // 7-9. Pipeline real de evaluación + promoción sobre el MISMO
      // candidato ya detectado — el Deduplicator real (Ollama + pgvector,
      // DrizzleMemoryCandidateRetriever) decide si hay duplicado, nadie se
      // lo dice.
      const evaluation = await evaluator.evaluate(promotable.candidate);
      expect(evaluation.duplicateOf).toBe(seededMemory.id);
      expect(evaluation.conflictsWith).toEqual([]);

      const promotion = await promoter.promote(promotable.candidate, evaluation);
      expect(promotion.action).toBe("updated");
      expect(promotion.memoryId).toBe(seededMemory.id);

      // 10. Verificación en Postgres: la Memory sigue siendo la misma fila
      // (mismo id), no se creó una segunda.
      const persistedMemory = await memoryRepo.findById(seededMemory.id);
      expect(persistedMemory).not.toBeNull();
      expect(persistedMemory?.id).toBe(seededMemory.id);
      expect(persistedMemory?.content).toBe(promotable.candidate.content);

      // Contrato real de MemoryCandidatePromoter (Fase 4.7): confidence e
      // importance pasan a ser los del candidato evaluado (0.5/0.5,
      // baseline de DeterministicCandidateExtractor), distintos del seed
      // (0.3/0.3) — confirma que el UPDATE ocurrió, no que coincidía.
      expect(persistedMemory?.confidence).toBe(evaluation.confidence);
      expect(persistedMemory?.importance).toBe(evaluation.importance);
      expect(persistedMemory?.confidence).not.toBe(SEED_CONFIDENCE);
      expect(persistedMemory?.importance).not.toBe(SEED_IMPORTANCE);

      // Timestamps: no se asertan valores exactos (frágil) — solo que
      // avanzaron respecto al instante justo antes de promover.
      expect(persistedMemory!.lastVerifiedAt!.getTime()).toBeGreaterThanOrEqual(beforePromotion.getTime());
      expect(persistedMemory!.updatedAt.getTime()).toBeGreaterThanOrEqual(beforePromotion.getTime());

      // No aumentó el número de Memory ligadas a este fixture: sigue
      // habiendo exactamente una, identificada por sus dos sourceReference.
      const memoriesForFixture = await pool.query(
        "SELECT DISTINCT memory_id FROM memory_sources WHERE source_reference IN ($1, $2)",
        [FIXTURE_SOURCE_REFERENCE, BF7F9FB],
      );
      expect(memoriesForFixture.rowCount).toBe(1);
      expect(memoriesForFixture.rows[0]?.memory_id).toBe(seededMemory.id);

      // +1 MemorySource: la sembrada (FIXTURE_SOURCE_REFERENCE) sigue ahí,
      // y se agregó una nueva con el SHA real producido por la promoción —
      // demuestra inequívocamente que fue el pipeline el que la creó, no el
      // seed.
      const sourcesAfter = await memorySourceRepo.findByMemory(seededMemory.id);
      expect(sourcesAfter).toHaveLength(2);
      const sourceReferences = sourcesAfter.map((s) => s.sourceReference).sort();
      expect(sourceReferences).toEqual([BF7F9FB, FIXTURE_SOURCE_REFERENCE].sort());
    });
  },
);
