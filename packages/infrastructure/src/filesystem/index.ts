/**
 * infrastructure/filesystem
 *
 * `FileReader` (Fase 5.3): implementación real de `IFileReader`
 * (application/common) — lectura puntual de archivos de texto dentro de
 * un `repoRoot`, con protección contra path traversal (contrato de ruta
 * relativa de 5.1 + verificación de containment post-resolución). Listado
 * de directorios y `watch` siguen sin implementación — 5.3 no los
 * resuelve, se agregan cuando haya un caso de uso concreto que los
 * requiera (mismo criterio que dejó pendiente `infrastructure/git`).
 */
export * from "./FileReader.js";
export * from "./FileReaderError.js";
