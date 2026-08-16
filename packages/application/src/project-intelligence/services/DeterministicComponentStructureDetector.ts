import type { ProjectComponent, ProjectComponentType } from "@guerrero-dev/domain";
import type { IComponentStructureDetector } from "../ports/IComponentStructureDetector.js";

const COMPONENT_ROOT_TYPES: Readonly<Record<string, ProjectComponentType>> = {
  apps: "app",
  packages: "package",
};

const MANIFEST_FILE = "package.json";

/**
 * `IComponentStructureDetector` determinista (Fase 5.5): deriva
 * `structure`/`components` únicamente por manipulación de strings sobre
 * `trackedFiles` (5.2) — sin `readdir`, sin leer `package.json`, sin
 * interpretar `pnpm-workspace.yaml`. Git ya dice qué archivos existen;
 * esta clase solo agrupa esos paths por prefijo, no añade ninguna fuente
 * de verdad nueva.
 *
 * Deliberadamente NO interpreta exclusiones de workspace: un componente
 * con `package.json` tracked pero excluido de `pnpm-workspace.yaml` (caso
 * real de este repositorio: `apps/web`) se detecta igual — esa exclusión
 * vive en un archivo YAML cuyo contenido 5.4 ya decidió no parsear.
 * Reinterpretarla aquí reabriría esa decisión por la puerta de atrás.
 * `ProjectProfile` es un snapshot derivado, no una verdad arquitectónica
 * validada (semántica congelada en 5.1) — este es exactamente ese caso.
 */
export class DeterministicComponentStructureDetector implements IComponentStructureDetector {
  detectStructure(trackedFiles: readonly string[]): readonly string[] {
    const prefixes = new Set<string>();

    for (const path of trackedFiles) {
      const segments = path.split("/");
      const [first, second] = segments;

      if (segments.length >= 2 && first !== undefined) {
        prefixes.add(first);
      }
      if (segments.length >= 3 && first !== undefined && second !== undefined) {
        prefixes.add(`${first}/${second}`);
      }
    }

    return [...prefixes].sort();
  }

  detectComponents(trackedFiles: readonly string[]): readonly ProjectComponent[] {
    const tracked = new Set(trackedFiles);
    const candidatePaths = new Set<string>();

    for (const path of trackedFiles) {
      const segments = path.split("/");
      const [root, name] = segments;

      if (segments.length >= 3 && root !== undefined && name !== undefined && root in COMPONENT_ROOT_TYPES) {
        candidatePaths.add(`${root}/${name}`);
      }
    }

    const components: ProjectComponent[] = [];
    for (const candidatePath of candidatePaths) {
      if (!tracked.has(`${candidatePath}/${MANIFEST_FILE}`)) {
        continue;
      }

      const [root, name] = candidatePath.split("/");
      if (root === undefined || name === undefined) {
        continue;
      }

      const type = COMPONENT_ROOT_TYPES[root];
      if (type === undefined) {
        continue;
      }

      components.push({ name, path: candidatePath, type });
    }

    return components.sort((a, b) => a.path.localeCompare(b.path));
  }
}
