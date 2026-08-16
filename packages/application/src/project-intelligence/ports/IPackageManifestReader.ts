import type { PackageManifest } from "../models/PackageManifest.js";

/**
 * Lee y parsea un `package.json` dentro de un proyecto (Fase 5.4). Compone
 * lectura (`IFileReader`, 5.3) y parsing (infraestructura) en un solo
 * puerto — mismo criterio que `ICommitCollector` (Fase 4.8) compone
 * `execFile` + parsing en `collect()`.
 *
 * `repoRoot`/`relativePath` por método, no por constructor: sin estado,
 * reutilizable contra N proyectos y N manifiestos (root, `apps/api`, etc.).
 *
 * Errores de lectura (`FileReaderError`: `not_found`, `access_denied`,
 * etc.) se propagan intactos, sin reenvolver — ya son el error correcto.
 * Solo el fallo de parsing introduce un tipo nuevo (`ManifestReaderError`).
 */
export interface IPackageManifestReader {
  readPackageManifest(repoRoot: string, relativePath: string): Promise<PackageManifest>;
}
