import { beforeAll, describe, expect, it } from "vitest";
import {
  CandidateDetectionService,
  DeterministicCandidateExtractor,
  DeterministicCommitAnalyzer,
  DeterministicCommitNoiseFilter,
} from "@guerrero-dev/application";
import { GitCommitCollector, GitHistorySource } from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 4.8, Commit 2 — 4.8-C + 4.8-D): valida la
 * cadena completa contra infraestructura real, no un `CommitSnapshot`
 * hardcodeado:
 *
 * Git real -> `GitCommitCollector` -> `CommitSnapshot` ->
 * `DeterministicCommitAnalyzer` (+ `GitHistorySource` real) ->
 * `CommitSignal` -> `DeterministicCommitNoiseFilter` ->
 * `DeterministicCandidateExtractor` -> `CandidateDetectionService.detect()`
 *
 * Ningún paso usa un doble de test aquí — ese nivel ya está cubierto por
 * `CandidateDetectionService.test.ts` (orquestación en aislamiento) y por
 * los tests unitarios/de integración propios de cada pieza
 * (`GitCommitCollector`, `GitHistorySource`, `DeterministicCommitAnalyzer`,
 * `DeterministicCommitNoiseFilter`, `DeterministicCandidateExtractor`).
 * Lo que este archivo demuestra, y que ningún otro test demuestra, es que
 * las piezas reales encajan entre sí de punta a punta.
 *
 * Se salta si RUN_INTEGRATION_TESTS no está en "true" (mismo patrón que el
 * resto de tests/integration/).
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

// Mismo commit real ya usado y verificado en git-commit-collector.test.ts
// y git-history-source.test.ts — no se introduce un commit nuevo sin
// evidencia: bf7f9fb ("feat(infrastructure): Fase 4.3 - persistencia del
// Memory Engine") toca 21 archivos reales, incluyendo migraciones/schema
// de base de datos (database/migrations/, database/schema/) y varios pares
// interfaz+implementación (IMemoryRepository.ts + DrizzleMemoryRepository.ts,
// etc. — confirmados con `git show --name-only`, ver también el docstring
// de `interfaceImplDiPatternRule` en DeterministicCandidateExtractor.ts).
const BF7F9FB = "bf7f9fb6f073c11d7ca0a0d3910348a605ce558f";

describe.skipIf(!RUN)(
  "Pipeline de detección de candidatas (integration, Git real -> CandidateDetectionService)",
  () => {
    let service: CandidateDetectionService;
    let collector: GitCommitCollector;

    beforeAll(() => {
      // vitest corre desde la raíz del monorepo — este mismo repositorio
      // (guerrero-dev) es el fixture real, mismo criterio que el resto de
      // tests/integration/ (GitCommitCollector, GitHistorySource).
      const repoRoot = process.cwd();
      collector = new GitCommitCollector(repoRoot);
      const historySource = new GitHistorySource(repoRoot);
      const analyzer = new DeterministicCommitAnalyzer(historySource);
      const noiseFilter = new DeterministicCommitNoiseFilter();
      const extractor = new DeterministicCandidateExtractor();
      service = new CandidateDetectionService(analyzer, noiseFilter, extractor);
    });

    it("bf7f9fb: no es descartado por el noise filter, y produce candidatas SCHEMA_PATH + INTERFACE_IMPL_DI_PATTERN reales", async () => {
      const snapshot = await collector.collect(BF7F9FB);
      const results = await service.detect(snapshot);

      // No se descarta como ruido: si lo fuera, results sería un único
      // elemento "rejected" (ver CandidateDetectionService.ts) en vez de
      // las candidatas reales de las reglas deterministas.
      expect(results.some((r) => r.outcome === "rejected")).toBe(false);

      const rules = results.map((r) => r.candidate?.source.metadata?.["rule"]).sort();
      expect(rules).toEqual(["INTERFACE_IMPL_DI_PATTERN", "SCHEMA_PATH"]);

      const schemaResult = results.find((r) => r.candidate?.source.metadata?.["rule"] === "SCHEMA_PATH");
      expect(schemaResult?.outcome).toBe("pending_review");
      expect(schemaResult?.candidate?.type).toBe("fact");
      expect(schemaResult?.candidate?.source.sourceReference).toBe(BF7F9FB);
      // Todavía no hay ningún RiskSignal producer implementado (Fase
      // 4.8-B, deliberadamente fuera de alcance de este commit) — el
      // array debe seguir vacío, no inventado.
      expect(schemaResult?.riskSignals).toEqual([]);

      const patternResult = results.find(
        (r) => r.candidate?.source.metadata?.["rule"] === "INTERFACE_IMPL_DI_PATTERN",
      );
      expect(patternResult?.outcome).toBe("pending_review");
      expect(patternResult?.candidate?.type).toBe("pattern");
    });

    it("un commit real que SÍ es ruido (solo .gitignore/*.tsbuildinfo) se corta antes del extractor", async () => {
      // a1dc883 es el caso real documentado en
      // docs/benchmarks/candidate-detection/guerrero-dev/a1dc883.json y en
      // el docstring de DeterministicCommitNoiseFilter — no se inventa un
      // commit artificial para este caso, se reutiliza evidencia ya
      // verificada del golden dataset.
      // `git show` acepta shas abreviadas — no hace falta resolver la
      // forma completa a mano (riesgo de transcribirla mal).
      const snapshot = await collector.collect("a1dc883");
      const results = await service.detect(snapshot);

      expect(results).toHaveLength(1);
      expect(results[0]?.outcome).toBe("rejected");
      expect(results[0]?.candidate).toBeNull();
    });
  },
);
