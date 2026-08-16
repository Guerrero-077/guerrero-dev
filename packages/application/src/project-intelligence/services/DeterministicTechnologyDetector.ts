import type { Technology } from "@guerrero-dev/domain";
import type { PackageManifest } from "../models/PackageManifest.js";
import type { ITechnologyDetector } from "../ports/ITechnologyDetector.js";

const PNPM_WORKSPACE_FILE = "pnpm-workspace.yaml";
const PNPM_VERSION_PREFIX = "pnpm@";

/**
 * `ITechnologyDetector` determinista (Fase 5.4): siete reglas, cada una con
 * una condición clara y única sobre una sola pieza de evidencia — mismo
 * criterio que `DeterministicCommitNoiseFilter` (Fase 4.8): cada regla
 * justificada por evidencia real de este mismo repositorio, no especulada.
 *
 * Deliberadamente NO deduplica: si la misma tecnología aparece declarada en
 * más de un campo o más de un archivo, cada aparición produce su propia
 * `Technology` con su propio `sourceFile`/`evidence` — "una tecnología
 * representa una evidencia concreta" (decisión congelada de esta subfase).
 * Por eso `dependencies` y `devDependencies` son reglas separadas para
 * TypeScript y Fastify, no una regla que busca en ambos: una condición
 * ambigua ("aparece en algún lado") ocultaría en qué campo exacto se
 * encontró la evidencia.
 *
 * `packageManager`/`engines.node` se leen literalmente, sin validar
 * semver ni resolver versiones — la existencia/prefijo del valor declarado
 * es la evidencia completa, no una interpretación de la versión.
 *
 * Solo detecta lo que tiene regla explícita — no infiere tecnologías desde
 * nombres de paquete arbitrarios (`pg`, `vitest`, etc. no tienen categoría
 * en el contrato cerrado de 5.1, y no se fuerza el significado de las que
 * ya existen para cubrirlos).
 */
export class DeterministicTechnologyDetector implements ITechnologyDetector {
  detectFromPackageManifest(sourceFile: string, manifest: PackageManifest): readonly Technology[] {
    const technologies: Technology[] = [];

    if ("typescript" in manifest.dependencies) {
      technologies.push({
        name: "TypeScript",
        category: "language",
        sourceFile,
        evidence: "dependencies.typescript",
      });
    }

    if ("typescript" in manifest.devDependencies) {
      technologies.push({
        name: "TypeScript",
        category: "language",
        sourceFile,
        evidence: "devDependencies.typescript",
      });
    }

    if (manifest.engines["node"] !== undefined) {
      technologies.push({
        name: "Node.js",
        category: "runtime",
        sourceFile,
        evidence: "engines.node",
      });
    }

    if (manifest.packageManager?.startsWith(PNPM_VERSION_PREFIX) === true) {
      technologies.push({
        name: "pnpm",
        category: "package_manager",
        sourceFile,
        evidence: "packageManager",
      });
    }

    if ("fastify" in manifest.dependencies) {
      technologies.push({
        name: "Fastify",
        category: "framework",
        sourceFile,
        evidence: "dependencies.fastify",
      });
    }

    if ("fastify" in manifest.devDependencies) {
      technologies.push({
        name: "Fastify",
        category: "framework",
        sourceFile,
        evidence: "devDependencies.fastify",
      });
    }

    return technologies;
  }

  detectFromTrackedFiles(trackedFiles: readonly string[]): readonly Technology[] {
    if (trackedFiles.includes(PNPM_WORKSPACE_FILE)) {
      return [
        {
          name: "pnpm",
          category: "package_manager",
          sourceFile: PNPM_WORKSPACE_FILE,
          evidence: "file exists",
        },
      ];
    }

    return [];
  }
}
