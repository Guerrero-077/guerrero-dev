import { beforeAll, describe, expect, it } from "vitest";
import { DeterministicCommitAnalyzer } from "@guerrero-dev/application";
import { GitHistorySource } from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 4.8.3): valida que `GitHistorySource`
 * transforma correctamente el historial real de este mismo repositorio
 * (`guerrero-dev`) al contrato `IGitHistorySource`, y que
 * `DeterministicCommitAnalyzer`, ya cableado con el adapter real, produce
 * `recentRelatedCommits` correctos sin inventar nada. Se salta si
 * RUN_INTEGRATION_TESTS no está en "true" (mismo patrón que el resto de
 * tests/integration/).
 *
 * Caso central: `bf7f9fb` -> `[96f2719, d3b5804]`. Reemplaza la hipótesis
 * original (§14g), que asumía sin verificar que `bf7f9fb` y `96f2719` no
 * compartían paths — sí los comparten (dos barrels `index.ts`), y por eso
 * `findCommitsTouchingPaths` los encuentra correctamente. Ver §14i de
 * `docs/fase-4-memory-engine.md` para la corrección completa.
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

// SHAs completas reales de este repositorio, confirmadas con `git rev-parse`.
const BF7F9FB = "bf7f9fb6f073c11d7ca0a0d3910348a605ce558f";
const F96F2719 = "96f2719d7eb3722711117ada83e32447ff444714";
const D3B5804 = "d3b58043247a4d252d2a97ac8764efb77707a543";

// Timestamp real de bf7f9fb (git show -s --format=%ci bf7f9fb): 2026-08-15 08:41:48 -05:00.
const BF7F9FB_TIMESTAMP = new Date("2026-08-15T08:41:48-05:00");

// Los dos barrels que bf7f9fb, 96f2719 y d3b5804 comparten realmente (confirmado con
// `git log -- <path>` sobre este mismo repositorio).
const SHARED_PATHS = [
  "packages/domain/src/memory/index.ts",
  "packages/application/src/common/ports/index.ts",
];

describe.skipIf(!RUN)("GitHistorySource (integration, contra este mismo repositorio)", () => {
  let source: GitHistorySource;

  beforeAll(() => {
    // vitest corre desde la raíz del monorepo — este mismo repositorio
    // (guerrero-dev) es el fixture real, sin necesitar un repo separado.
    source = new GitHistorySource(process.cwd());
  });

  describe("findCommitsTouchingPaths — contrato crudo, antes de cualquier interpretación", () => {
    it("devuelve las 3 SHAs reales que tocaron los barrels compartidos, más reciente primero", async () => {
      const result = await source.findCommitsTouchingPaths(SHARED_PATHS, BF7F9FB_TIMESTAMP, 5);

      // `before` es inclusivo por semántica de Git (documentado en §14i): bf7f9fb
      // SÍ aparece aquí, porque este método no decide autoexclusión — eso es
      // responsabilidad exclusiva de DeterministicCommitAnalyzer (ver más abajo).
      expect(result).toEqual([BF7F9FB, F96F2719, D3B5804]);
    });

    it("respeta el límite de resultados", async () => {
      const result = await source.findCommitsTouchingPaths([SHARED_PATHS[0]!], BF7F9FB_TIMESTAMP, 1);

      expect(result).toEqual([BF7F9FB]);
    });

    it("path sin historial real: devuelve lista vacía, no inventa nada", async () => {
      const result = await source.findCommitsTouchingPaths(
        ["este/path/no/existio/nunca/en/el/historial.ts"],
        BF7F9FB_TIMESTAMP,
        5,
      );

      expect(result).toEqual([]);
    });

    it("paths vacíos: devuelve vacío sin invocar Git (guard defensivo, nunca pathspec vacío)", async () => {
      const result = await source.findCommitsTouchingPaths([], BF7F9FB_TIMESTAMP, 5);

      expect(result).toEqual([]);
    });
  });

  describe("findRenameHistory", () => {
    it("archivo sin renombres reales: coincide con su historial simple (--follow no agrega nada extra)", async () => {
      const path = SHARED_PATHS[0]!;

      const [followResult, plainResult] = await Promise.all([
        source.findRenameHistory(path, BF7F9FB_TIMESTAMP, 5),
        source.findCommitsTouchingPaths([path], BF7F9FB_TIMESTAMP, 5),
      ]);

      // packages/domain/src/memory/index.ts nunca fue renombrado en este repo
      // real — nació con ese nombre en d3b5804.
      expect(followResult).toEqual(plainResult);
    });
  });

  describe("DeterministicCommitAnalyzer + GitHistorySource real (end-to-end)", () => {
    it("bf7f9fb: recentRelatedCommits encuentra 96f2719 y d3b5804 primero, y nunca se autorreferencia", async () => {
      const analyzer = new DeterministicCommitAnalyzer(source);

      // CommitSnapshot deliberadamente acotado a los dos paths compartidos
      // (no los 21 archivos reales de bf7f9fb): mantiene el resultado
      // determinista sin dejar de usar SHA/timestamp/paths reales de este
      // repositorio. Las estadísticas del commit no son lo que este test
      // valida — eso ya está cubierto por DeterministicCommitAnalyzer.test.ts.
      const signal = await analyzer.analyze({
        sha: BF7F9FB,
        message: "feat(infrastructure): Fase 4.3 - persistencia del Memory Engine",
        author: "test",
        timestamp: BF7F9FB_TIMESTAMP,
        diff: "",
        changedFiles: SHARED_PATHS,
      });

      const shas = signal.recentRelatedCommits.map((ref) => ref.sha);

      // Autoexclusión real: bf7f9fb jamás aparece en sus propios recentRelatedCommits,
      // aunque GitHistorySource sí lo devuelva (antes verificado arriba).
      expect(shas).not.toContain(BF7F9FB);

      // Los primeros dos resultados están garantizados por path overlap puro
      // (antes de cualquier ruido que agregue directory overlap): orden
      // cronológico inverso real.
      expect(shas[0]).toBe(F96F2719);
      expect(shas[1]).toBe(D3B5804);

      expect(signal.recentRelatedCommits.length).toBeLessThanOrEqual(5);
    });
  });
});
