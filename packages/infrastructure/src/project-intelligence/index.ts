/**
 * infrastructure/project-intelligence
 *
 * `PackageManifestReader` (Fase 5.4): implementación real de
 * `IPackageManifestReader` (application/project-intelligence) — compone
 * `FileReader` (5.3) + `parsePackageManifest` (parsing puro de
 * `package.json`) en un solo puerto de lectura+parsing.
 */
export * from "./ManifestReaderError.js";
export * from "./PackageManifestReader.js";
