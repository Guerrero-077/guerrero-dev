import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CandidateDetectionService,
  DeterministicCandidateExtractor,
  DeterministicCommitAnalyzer,
  DeterministicCommitNoiseFilter,
} from "@guerrero-dev/application";
import {
  createPostgresPool,
  GitCommitCollector,
  GitHistorySource,
  loadConfig,
  runMigrations,
  type PgPool,
} from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 4.9-D): cuarto y último escenario end-to-end
 * planeado del Memory Engine — demuestra una propiedad distinta a 4.9-C.
 * 4.9-C prueba "un candidato real evaluado no persiste". 4.9-D prueba algo
 * más fuerte: **un commit ruidoso nunca produce un candidato en absoluto**,
 * así que una composición correcta del pipeline no tiene nada que pasarle
 * a `MemoryCandidateEvaluator`/`MemoryCandidatePromoter`. No hace falta un
 * spy que registre si esas etapas fueron invocadas — el contrato de
 * `CandidateDetectionService.detect()` ya lo garantiza: si el resultado es
 * `rejected`, `candidate` es `null` (invariante documentado en el JSDoc de
 * `CandidateExtractionResult`), y no existe ninguna forma de construir una
 * llamada real a `evaluate()`/`promote()` sin un `MemoryCandidate`.
 *
 * Reusa `a1dc883` — mismo commit real ya verificado en 4.8
 * (`DeterministicCommitNoiseFilter` docstring, golden dataset) y en
 * `candidate-detection-pipeline.test.ts`: solo toca `.gitignore` y
 * `*.tsbuildinfo`, caso real de "ruido de build". Ningún fixture nuevo.
 *
 * Sin limpieza previa en `beforeAll`: este escenario nunca persiste nada,
 * así que no hay estado propio que dejar entre corridas — a diferencia de
 * 4.9-A/B/C, que si crean o actualizan una `Memory`.
 *
 * Se salta si RUN_INTEGRATION_TESTS no está en "true" (mismo patrón que el
 * resto de tests/integration/). No depende de Ollama — esta rama del
 * pipeline nunca llega a `MemoryCandidateDeduplicator`.
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

const A1DC883 = "a1dc883badb4eacc8b605e25eed702fa770786e3";

describe.skipIf(!RUN)(
  "Pipeline completo: commit ruidoso real -> early discard, sin candidato (Fase 4.9-D)",
  () => {
    let pool: PgPool;
    let collector: GitCommitCollector;
    let detectionService: CandidateDetectionService;

    beforeAll(async () => {
      const config = loadConfig();
      pool = createPostgresPool(config);
      await runMigrations(pool);

      const repoRoot = process.cwd();
      collector = new GitCommitCollector(repoRoot);
      const historySource = new GitHistorySource(repoRoot);
      const analyzer = new DeterministicCommitAnalyzer(historySource);
      const noiseFilter = new DeterministicCommitNoiseFilter();
      const extractor = new DeterministicCandidateExtractor();
      detectionService = new CandidateDetectionService(analyzer, noiseFilter, extractor);
    });

    afterAll(async () => {
      await pool.end();
    });

    it("a1dc883: descartado como ruido de build -> candidate null, sin ninguna Memory afectada", async () => {
      const memoriesBefore = await pool.query("SELECT COUNT(*)::int AS count FROM memories");

      const snapshot = await collector.collect(A1DC883);
      const results = await detectionService.detect(snapshot);

      // Un único resultado, rejected, sin candidato — el invariante de
      // CandidateExtractionResult ("rejected" implica candidate === null)
      // ya garantiza que no hay nada que pasarle a Evaluator/Promoter.
      expect(results).toHaveLength(1);
      expect(results[0]?.outcome).toBe("rejected");
      expect(results[0]?.candidate).toBeNull();
      expect(results[0]?.riskSignals).toEqual([]);
      expect(results[0]?.reason).toContain("tsbuildinfo");

      const memoriesAfter = await pool.query("SELECT COUNT(*)::int AS count FROM memories");
      expect(memoriesAfter.rows[0]?.count).toBe(memoriesBefore.rows[0]?.count);
    });
  },
);
