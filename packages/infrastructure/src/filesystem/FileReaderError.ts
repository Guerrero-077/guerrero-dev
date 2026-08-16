/**
 * Razones normalizadas de fallo de `FileReader` (Fase 5.3). Mismo criterio
 * que `GitTrackedFilesSourceError`/`GitCommitCollectorError`: tipo propio,
 * no una reutilización del error de otro adapter — cada adapter mantiene
 * su contrato de errores independiente.
 *
 * `invalid_path` cubre dos capas distintas de rechazo (ruta que no cumple
 * `isRelativePath`, o que resuelta escapa de `repoRoot`) — ambas son la
 * misma categoría desde la perspectiva del llamador: "esta ruta no es
 * aceptable", sin que el llamador necesite distinguir cuál de las dos
 * capas la rechazó.
 */
export type FileReaderErrorReason =
  "not_found" | "access_denied" | "is_a_directory" | "invalid_path" | "unknown";

/** Error tipado que encapsula cualquier fallo de `FileReader` al leer un archivo. */
export class FileReaderError extends Error {
  constructor(
    readonly reason: FileReaderErrorReason,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FileReaderError";
  }
}
