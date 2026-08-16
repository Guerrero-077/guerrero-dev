import { DeterministicComponentStructureDetector } from "@guerrero-dev/application";
import { GitTrackedFilesSource } from "@guerrero-dev/infrastructure";
import { describe, expect, it } from "vitest";

/**
 * Test de integración (Fase 5.5): valida `DeterministicComponentStructureDetector`
 * compuesto con `GitTrackedFilesSource` (5.2) real, contra este mismo
 * repositorio — mismo patrón que `git-tracked-files-source.test.ts`. Se
 * salta si RUN_INTEGRATION_TESTS no está en "true".
 *
 * El caso `apps/web` se verifica aquí en vivo, no solo como fixture
 * unitario: Git real confirma que su `package.json` está tracked, y el
 * detector lo reporta como componente sin conocer ni consultar la
 * exclusión real de `pnpm-workspace.yaml` — la separación de fuentes que
 * 5.5 congeló como decisión de diseño, demostrada contra infraestructura
 * real, no solo declarada.
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

describe.skipIf(!RUN)("DeterministicComponentStructureDetector + GitTrackedFilesSource (integration)", () => {
  const gitSource = new GitTrackedFilesSource();
  const detector = new DeterministicComponentStructureDetector();

  it("detecta los componentes reales conocidos de este repositorio", async () => {
    const trackedFiles = await gitSource.listTrackedFiles(process.cwd());

    const components = detector.detectComponents(trackedFiles);

    expect(components).toContainEqual({ name: "api", path: "apps/api", type: "app" });
    expect(components).toContainEqual({ name: "cli", path: "apps/cli", type: "app" });
    expect(components).toContainEqual({ name: "domain", path: "packages/domain", type: "package" });
    expect(components).toContainEqual({ name: "application", path: "packages/application", type: "package" });
    expect(components).toContainEqual({
      name: "infrastructure",
      path: "packages/infrastructure",
      type: "package",
    });
  });

  it("apps/web se detecta como componente por evidencia Git real, aunque el workspace lo excluya", async () => {
    const trackedFiles = await gitSource.listTrackedFiles(process.cwd());

    const components = detector.detectComponents(trackedFiles);

    expect(components).toContainEqual({ name: "web", path: "apps/web", type: "app" });
  });

  it("detecta la estructura real de nivel 1/2 de este repositorio", async () => {
    const trackedFiles = await gitSource.listTrackedFiles(process.cwd());

    const structure = detector.detectStructure(trackedFiles);

    for (const expected of ["apps", "apps/api", "packages", "packages/domain", "docs", "docker", "scripts"]) {
      expect(structure).toContain(expected);
    }
  });
});
