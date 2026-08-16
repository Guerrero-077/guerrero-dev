import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
 * Test de integración (Fase 4.9-A): primer escenario end-to-end del Memory
 * Engine completo contra infraestructura real —
 *
 * Git real -> GitCommitCollector -> DeterministicCommitAnalyzer (+
 * GitHistorySource real) -> DeterministicCommitNoiseFilter ->
 * DeterministicCandidateExtractor -> CandidateDetectionService ->
 * MemoryCandidateEvaluator (Validator + Deduplicator real con
 * OllamaEmbeddingProvider + DrizzleMemoryCandidateRetriever reales +
 * NoopMemoryConflictDetector + Scorer) -> MemoryCandidatePromoter (+
 * DrizzleMemoryPromotionUnitOfWork real) -> PostgreSQL + pgvector.
 *
 * Hasta 4.8 se demostró que cada pieza funciona. Este test demuestra que
 * funcionan juntas — nada de esta cadena estaba conectado en código antes
 * de este commit.
 *
 * Se salta si RUN_INTEGRATION_TESTS no está en "true" (mismo patrón que el
 * resto de tests/integration/), y cada `it` además verifica disponibilidad
 * de Ollama en runtime (`if (!ollamaAvailable) return`) — mismo criterio
 * que `embedding-provider.test.ts`: no tiene sentido fallar la suite
 * completa porque el modelo no está corriendo localmente.
 *
 * **Repetibilidad frente al mismo Postgres real (sin reset):** `bf7f9fb` es
 * un commit real determinista — el mismo candidato con el mismo `content`
 * se produce en cada corrida. Sin limpieza, la segunda ejecución de esta
 * suite encontraría la `Memory` que la primera corrida creó como
 * "duplicado" (similitud ~1.0), y el escenario dejaría de ser un CREATE.
 * Eso no es un bug de `MemoryCandidatePromoter` — tratar un candidato
 * idéntico como duplicado es el comportamiento correcto — es un problema
 * de repetibilidad del fixture. Se resuelve con limpieza SQL acotada
 * estrictamente a `sourceReference = BF7F9FB` en `beforeAll`, nunca un
 * reset global: `memory_sources`/`memory_relations`/`memory_embeddings`
 * tienen `ON DELETE CASCADE` hacia `memories.id` (confirmado en los
 * schemas de Drizzle), así que borrar la `Memory` encontrada por esa
 * `sourceReference` es suficiente y no puede afectar datos de otro
 * escenario o de otro test.
 *
 * **Validación pendiente en el entorno real de Santiago: dos ejecuciones
 * consecutivas de `pnpm test:integration`.** La primera corrida prueba
 * el CREATE contra un Postgres que puede o no tener residuos de una
 * ejecución previa; la segunda corrida prueba que la limpieza del
 * `beforeAll` deja el mismo estado inicial y el resultado vuelve a ser
 * CREATE, no que el candidato se detecta como su propio duplicado.
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

// Mismo commit real ya usado y verificado en Fase 4.8
// (git-commit-collector.test.ts, git-history-source.test.ts,
// candidate-detection-pipeline.test.ts) — dispara SCHEMA_PATH (primera
// regla que matchea, orden de RULES en DeterministicCandidateExtractor)
// con confidence=0.5/importance=0.5/sourceType="commit", score real 0.6
// (>= DEFAULT_ACCEPTANCE_THRESHOLD 0.5) — candidato promocionable sin
// ajustar ningún umbral.
const BF7F9FB = "bf7f9fb6f073c11d7ca0a0d3910348a605ce558f";

describe.skipIf(!RUN)("Pipeline completo: Git real -> Memory persistida (Fase 4.9-A)", () => {
  let pool: PgPool;
  let ollamaAvailable = false;
  let collector: GitCommitCollector;
  let detectionService: CandidateDetectionService;
  let evaluator: MemoryCandidateEvaluator;
  let promoter: MemoryCandidatePromoter;
  let memoryRepo: DrizzleMemoryRepository;
  let memorySourceRepo: DrizzleMemorySourceRepository;

  beforeAll(async () => {
    const config = loadConfig();
    ollamaAvailable = await pingOllama(config.OLLAMA_BASE_URL);

    pool = createPostgresPool(config);
    await runMigrations(pool);
    const db = createDrizzleClient(pool);

    // Limpieza acotada por sourceReference — ver JSDoc del archivo arriba.
    // Cascada real de FKs, no un TRUNCATE ni un reset de esquema.
    await pool.query(
      "DELETE FROM memories WHERE id IN (SELECT memory_id FROM memory_sources WHERE source_reference = $1)",
      [BF7F9FB],
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

    const embeddingProvider = new OllamaEmbeddingProvider(
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

    // Warmup deliberado acá, mismo criterio que embedding-provider.test.ts:
    // absorber el cold start de Ollama en el hook, no en el primer `it`.
    if (ollamaAvailable) {
      await embeddingProvider.embed("warmup");
    }
  }, 30_000);

  afterAll(async () => {
    await pool.end();
  });

  it("bf7f9fb: Git real -> CandidateDetectionService -> Evaluator -> Promoter -> Memory + MemorySource reales en Postgres", async () => {
    if (!ollamaAvailable) return;

    // Confirma que la limpieza del beforeAll dejó el estado inicial
    // esperado antes de correr el escenario — no confiamos ciegamente en
    // que el DELETE funcionó.
    const beforeSources = await pool.query("SELECT id FROM memory_sources WHERE source_reference = $1", [
      BF7F9FB,
    ]);
    expect(beforeSources.rowCount).toBe(0);

    const snapshot = await collector.collect(BF7F9FB);
    const detectionResults = await detectionService.detect(snapshot);

    const promotable = detectionResults.find(
      (
        r,
      ): r is CandidateExtractionResult & {
        candidate: NonNullable<CandidateExtractionResult["candidate"]>;
      } => r.outcome !== "rejected" && r.candidate !== null,
    );
    if (!promotable) throw new Error("bf7f9fb no produjo ningún candidato promocionable — fixture inválido");

    // SCHEMA_PATH es la primera regla que matchea para bf7f9fb (orden de
    // RULES en DeterministicCandidateExtractor) — confirma que seguimos
    // usando el mismo caso verificado en Fase 4.8, no una regla distinta
    // por accidente de orden.
    expect(promotable.candidate.source.metadata?.["rule"]).toBe("SCHEMA_PATH");
    expect(promotable.candidate.source.sourceReference).toBe(BF7F9FB);

    const evaluation = await evaluator.evaluate(promotable.candidate);
    expect(evaluation.accepted).toBe(true);
    expect(evaluation.duplicateOf).toBeNull();
    expect(evaluation.conflictsWith).toEqual([]);

    const promotion = await promoter.promote(promotable.candidate, evaluation);
    expect(promotion.action).toBe("created");
    expect(promotion.memoryId).not.toBeNull();

    const memoryId = promotion.memoryId!;
    const persistedMemory = await memoryRepo.findById(memoryId);
    expect(persistedMemory).not.toBeNull();
    expect(persistedMemory?.content).toBe(promotable.candidate.content);
    expect(persistedMemory?.scope).toBe("global");
    expect(persistedMemory?.projectId).toBeNull();

    const persistedSources = await memorySourceRepo.findByMemory(memoryId);
    expect(persistedSources).toHaveLength(1);
    expect(persistedSources[0]?.sourceType).toBe("commit");
    expect(persistedSources[0]?.sourceReference).toBe(BF7F9FB);
    expect(persistedSources[0]?.memoryId).toBe(memoryId);

    // Sin residuos huérfanos: exactamente un MemorySource para este SHA en
    // todo Postgres, y apunta a la Memory que acabamos de crear — no a
    // ninguna otra.
    const allSourcesForSha = await pool.query(
      "SELECT memory_id FROM memory_sources WHERE source_reference = $1",
      [BF7F9FB],
    );
    expect(allSourcesForSha.rowCount).toBe(1);
    expect(allSourcesForSha.rows[0]?.memory_id).toBe(memoryId);
  });
});
