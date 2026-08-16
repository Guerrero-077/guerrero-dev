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
  GitCommitCollector,
  GitHistorySource,
  loadConfig,
  OllamaEmbeddingProvider,
  pingOllama,
  runMigrations,
  type PgPool,
} from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 4.9-C): tercer escenario end-to-end del Memory
 * Engine — demuestra que un candidato real, con score real por debajo de
 * una política de aceptación más estricta, es rechazado por
 * `MemoryCandidateEvaluator` (`accepted: false`) y que `MemoryCandidatePromoter`
 * respeta ese rechazo sin persistir absolutamente nada, ni siquiera
 * parcialmente.
 *
 * **No se está probando que el extractor produzca scores bajos** — eso no
 * es su comportamiento actual (`DeterministicCandidateExtractor` siempre
 * produce `confidence=0.5`/`importance=0.5`, así que con los pesos reales
 * de `MemoryCandidateScorer` el score de CUALQUIER candidato que produce es
 * siempre `0.6`, verificado leyendo ambos archivos antes de diseñar este
 * test — no hay ningún commit real que "naturalmente" produzca un score
 * bajo). Lo que 4.9-C demuestra es que el sistema de evaluación respeta una
 * política de aceptación configurada más estricta cuando un candidato real
 * queda por debajo de ella — `MemoryCandidateEvaluatorOptions.acceptanceThreshold`
 * ya es un parámetro real y existente del contrato (Fase 4.7), no un
 * mecanismo nuevo para este test. El umbral `0.65` es una opción de ESTE
 * evaluator, no se toca el default de producción (`0.5`) en ningún lugar.
 *
 * **Por qué usa la candidata `INTERFACE_IMPL_DI_PATTERN` de `bf7f9fb`, no
 * `SCHEMA_PATH`** (la que usan 4.9-A/4.9-B): `bf7f9fb` produce dos
 * candidatas reales y distintas (confirmado en 4.8/4.9-A). 4.9-A crea una
 * `Memory` con el contenido de `SCHEMA_PATH`, y 4.9-B siembra una `Memory`
 * embebida con ese mismo contenido — ninguna de las dos limpia después de
 * terminar (solo se limpian a sí mismas en su propio `beforeAll`, antes de
 * la corrida siguiente). Con `--no-file-parallelism` estos archivos corren
 * en secuencia dentro de la misma suite, así que para cuando 4.9-C corre,
 * es probable que ya exista en Postgres una `Memory` embebida con el
 * contenido `SCHEMA_PATH`. Usar la candidata `INTERFACE_IMPL_DI_PATTERN`
 * en su lugar — texto real distinto, nunca sembrado por ningún otro
 * escenario — evita que el deduplicador real encuentre un "duplicado"
 * accidental y contamine la aserción `duplicateOf === null`, sin que 4.9-C
 * necesite conocer ni limpiar los fixtures de otros archivos.
 *
 * Se salta si RUN_INTEGRATION_TESTS no está en "true", y verifica
 * disponibilidad de Ollama en runtime (mismo criterio que el resto de
 * escenarios de 4.9).
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

const BF7F9FB = "bf7f9fb6f073c11d7ca0a0d3910348a605ce558f";

// Umbral estricto de ESTE escenario únicamente — por encima del score real
// (0.6) que produce cualquier candidata de DeterministicCandidateExtractor.
// El default de producción (DEFAULT_ACCEPTANCE_THRESHOLD = 0.5) no se toca.
const STRICT_ACCEPTANCE_THRESHOLD = 0.65;

describe.skipIf(!RUN)(
  "Pipeline completo: candidato real bajo umbral estricto -> sin persistencia (Fase 4.9-C)",
  () => {
    let pool: PgPool;
    let ollamaAvailable = false;
    let collector: GitCommitCollector;
    let detectionService: CandidateDetectionService;
    let evaluator: MemoryCandidateEvaluator;
    let promoter: MemoryCandidatePromoter;

    beforeAll(async () => {
      const config = loadConfig();
      ollamaAvailable = await pingOllama(config.OLLAMA_BASE_URL);

      pool = createPostgresPool(config);
      await runMigrations(pool);
      const db = createDrizzleClient(pool);

      const repoRoot = process.cwd();
      collector = new GitCommitCollector(repoRoot);
      const historySource = new GitHistorySource(repoRoot);
      const analyzer = new DeterministicCommitAnalyzer(historySource);
      const noiseFilter = new DeterministicCommitNoiseFilter();
      const extractor = new DeterministicCandidateExtractor();
      detectionService = new CandidateDetectionService(analyzer, noiseFilter, extractor);

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
      // acceptanceThreshold es una opción de ESTE evaluator, no un cambio
      // global — ver JSDoc del archivo.
      evaluator = new MemoryCandidateEvaluator(validator, deduplicator, conflictDetector, scorer, {
        acceptanceThreshold: STRICT_ACCEPTANCE_THRESHOLD,
      });

      const unitOfWork = new DrizzleMemoryPromotionUnitOfWork(db);
      promoter = new MemoryCandidatePromoter(unitOfWork);

      if (ollamaAvailable) {
        await embeddingProvider.embed("warmup");
      }
    }, 30_000);

    afterAll(async () => {
      await pool.end();
    });

    it("bf7f9fb (INTERFACE_IMPL_DI_PATTERN): score real 0.60 < umbral 0.65 -> rejected, sin ninguna persistencia", async () => {
      if (!ollamaAvailable) return;

      const snapshot = await collector.collect(BF7F9FB);
      const detectionResults = await detectionService.detect(snapshot);
      const promotable = detectionResults.find(
        (
          r,
        ): r is CandidateExtractionResult & {
          candidate: NonNullable<CandidateExtractionResult["candidate"]>;
        } =>
          r.outcome !== "rejected" &&
          r.candidate !== null &&
          r.candidate.source.metadata?.["rule"] === "INTERFACE_IMPL_DI_PATTERN",
      );
      if (!promotable) {
        throw new Error(
          "bf7f9fb no produjo ningún candidato INTERFACE_IMPL_DI_PATTERN — fixture inválido (¿cambió el extractor o el commit?)",
        );
      }

      // Estado inicial: ninguna Memory con este contenido específico
      // (INTERFACE_IMPL_DI_PATTERN de bf7f9fb) debería existir todavía —
      // ni de una corrida anterior de este mismo test (nada que este test
      // haga debería sobrevivir, dado que siempre rechaza) ni de otro
      // escenario (contenido real distinto al de 4.9-A/4.9-B, ver JSDoc).
      const before = await pool.query(
        `SELECT COUNT(*)::int AS count FROM memory_sources ms
         JOIN memories m ON m.id = ms.memory_id
         WHERE ms.source_reference = $1 AND m.content = $2`,
        [BF7F9FB, promotable.candidate.content],
      );
      expect(before.rows[0]?.count).toBe(0);
      const memoriesBefore = await pool.query("SELECT COUNT(*)::int AS count FROM memories");

      const evaluation = await evaluator.evaluate(promotable.candidate);

      expect(evaluation.accepted).toBe(false);
      // Aislamiento explícito de la rama de rechazo por score: si
      // duplicateOf no fuera null aquí, la rama de duplicado (4.9-B) tendría
      // precedencia sobre accepted y este test no estaría probando lo que
      // dice probar — se trata como fixture contaminado, no un resultado
      // válido alternativo.
      if (evaluation.duplicateOf !== null) {
        throw new Error(
          `Fixture contaminado: duplicateOf="${evaluation.duplicateOf}" no es null. ` +
            "4.9-C necesita aislar la rama de rechazo por score de la rama de duplicado (4.9-B).",
        );
      }
      expect(evaluation.conflictsWith).toEqual([]);

      const promotion = await promoter.promote(promotable.candidate, evaluation);
      expect(promotion.action).toBe("rejected");
      expect(promotion.memoryId).toBeNull();
      expect(promotion.conflictRelationsCreated).toEqual([]);

      // Verificación en Postgres, no solo en el valor de retorno: ni una
      // Memory con este contenido específico, ni cambio en el total global
      // de Memory — la candidata rechazada no dejó ningún rastro.
      const after = await pool.query(
        `SELECT COUNT(*)::int AS count FROM memory_sources ms
         JOIN memories m ON m.id = ms.memory_id
         WHERE ms.source_reference = $1 AND m.content = $2`,
        [BF7F9FB, promotable.candidate.content],
      );
      expect(after.rows[0]?.count).toBe(0);

      const memoriesAfter = await pool.query("SELECT COUNT(*)::int AS count FROM memories");
      expect(memoriesAfter.rows[0]?.count).toBe(memoriesBefore.rows[0]?.count);
    });
  },
);
