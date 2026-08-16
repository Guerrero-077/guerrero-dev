import type { Technology } from "@guerrero-dev/domain";
import type { PackageManifest } from "../models/PackageManifest.js";

/**
 * Convierte evidencia de proyecto en `Technology[]` (Fase 5.4) — puro y
 * síncrono, sin I/O, mismo criterio que `ICommitNoiseFilter` (Fase 4.8).
 * Nunca decide si una tecnología está "realmente en uso": solo traduce lo
 * declarado/observable a `Technology` con su evidencia.
 *
 * Dos métodos, no dos puertos: `detectFromPackageManifest` y
 * `detectFromTrackedFiles` tienen fuentes de evidencia distintas (contenido
 * de un manifiesto vs. existencia en la lista de `IGitTrackedFilesSource`),
 * pero la misma responsabilidad arquitectónica — separarlas en dos
 * interfaces habría sido superficie contractual sin evidencia de que un
 * consumidor necesite una independientemente de la otra.
 */
export interface ITechnologyDetector {
  /** Reglas sobre el contenido de un `package.json` ya parseado (Fase 5.4, §3b: evidencia obligatoria). */
  detectFromPackageManifest(sourceFile: string, manifest: PackageManifest): readonly Technology[];

  /** Reglas sobre la sola existencia de un archivo conocido dentro de `trackedFiles` (5.2). */
  detectFromTrackedFiles(trackedFiles: readonly string[]): readonly Technology[];
}
