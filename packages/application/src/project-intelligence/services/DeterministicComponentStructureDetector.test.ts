import { isValidComponent } from "@guerrero-dev/domain";
import { describe, expect, it } from "vitest";
import { DeterministicComponentStructureDetector } from "./DeterministicComponentStructureDetector.js";

/**
 * Subconjunto real de `git ls-files` de este mismo repositorio (verificado
 * con `git ls-files` antes de escribir este fixture) — no un árbol
 * inventado.
 */
const REAL_TRACKED_FILES: readonly string[] = [
  "package.json",
  "pnpm-workspace.yaml",
  ".github/workflows/ci.yml",
  "scripts/benchmark-embeddings.ts",
  "scripts/migrate.ts",
  "apps/api/package.json",
  "apps/api/src/index.ts",
  "apps/api/src/plugins/database.ts",
  "apps/web/package.json",
  "apps/web/README.md",
  "packages/domain/package.json",
  "packages/domain/src/project/ProjectProfile.ts",
  "packages/application/package.json",
  "docker/postgres/Dockerfile",
  "docs/fase-5-project-intelligence-map.md",
];

function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const a = copy[i];
    const b = copy[j];
    if (a !== undefined && b !== undefined) {
      copy[i] = b;
      copy[j] = a;
    }
  }
  return copy;
}

describe("DeterministicComponentStructureDetector", () => {
  const detector = new DeterministicComponentStructureDetector();

  describe("detectStructure", () => {
    it("deriva los prefijos reales de nivel 1 y 2 de este repositorio, ordenados lexicográficamente", () => {
      expect(detector.detectStructure(REAL_TRACKED_FILES)).toEqual([
        ".github",
        ".github/workflows",
        "apps",
        "apps/api",
        "apps/web",
        "docker",
        "docker/postgres",
        "docs",
        "packages",
        "packages/application",
        "packages/domain",
        "scripts",
      ]);
    });

    it("un archivo en la raíz no contribuye ningún prefijo", () => {
      expect(detector.detectStructure(["package.json"])).toEqual([]);
    });

    it("un archivo de exactamente 2 segmentos contribuye solo nivel 1, no un falso nivel 2", () => {
      expect(detector.detectStructure(["docs/README.md"])).toEqual(["docs"]);
    });

    it("múltiples archivos bajo el mismo prefijo producen una sola entrada", () => {
      const result = detector.detectStructure([
        "apps/api/src/index.ts",
        "apps/api/package.json",
        "apps/api/src/routes/health.ts",
      ]);

      expect(result).toEqual(["apps", "apps/api"]);
    });

    it("lista vacía produce lista vacía", () => {
      expect(detector.detectStructure([])).toEqual([]);
    });

    it("el resultado no depende del orden de trackedFiles", () => {
      const baseline = detector.detectStructure(REAL_TRACKED_FILES);

      for (let i = 0; i < 5; i++) {
        expect(detector.detectStructure(shuffled(REAL_TRACKED_FILES))).toEqual(baseline);
      }
    });
  });

  describe("detectComponents", () => {
    it("detecta apps/api y packages/domain con su package.json real, con name/path/type correctos", () => {
      const result = detector.detectComponents(REAL_TRACKED_FILES);

      expect(result).toEqual([
        { name: "api", path: "apps/api", type: "app" },
        { name: "web", path: "apps/web", type: "app" },
        { name: "application", path: "packages/application", type: "package" },
        { name: "domain", path: "packages/domain", type: "package" },
      ]);
    });

    it("apps/web se detecta como componente por evidencia Git, aunque el workspace real lo excluya (limitación conocida de v1, no un bug)", () => {
      const result = detector.detectComponents(REAL_TRACKED_FILES);

      expect(result).toContainEqual({ name: "web", path: "apps/web", type: "app" });
    });

    it("una carpeta bajo apps/ sin package.json propio no se detecta, aunque tenga otros archivos", () => {
      const result = detector.detectComponents(["apps/sin-manifiesto/src/index.ts"]);

      expect(result).toEqual([]);
    });

    it("un package.json fuera de apps/ o packages/ no produce un componente", () => {
      const result = detector.detectComponents(["docker/postgres/package.json"]);

      expect(result).toEqual([]);
    });

    it("cada ProjectComponent emitido cumple isValidComponent (dominio, 5.1)", () => {
      const result = detector.detectComponents(REAL_TRACKED_FILES);

      expect(result.length).toBeGreaterThan(0);
      for (const component of result) {
        expect(isValidComponent(component)).toBe(true);
      }
    });

    it("el resultado no depende del orden de trackedFiles", () => {
      const baseline = detector.detectComponents(REAL_TRACKED_FILES);

      for (let i = 0; i < 5; i++) {
        expect(detector.detectComponents(shuffled(REAL_TRACKED_FILES))).toEqual(baseline);
      }
    });
  });
});
