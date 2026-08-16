/**
 * Razón de fallo de `parsePackageManifest`/`PackageManifestReader` (Fase
 * 5.4). Un solo motivo por ahora — no se inventan razones especulativas
 * sin evidencia de necesitarlas, mismo criterio que el resto de errores
 * tipados de esta fase.
 *
 * Deliberadamente NO incluye los motivos de `FileReaderError`
 * (`not_found`, `access_denied`, etc.): esos son fallos de lectura
 * genuinos que `PackageManifestReader` propaga intactos, sin reenvolver —
 * `invalid_manifest` es exclusivamente el fallo nuevo que esta pieza
 * introduce (el archivo se leyó bien, pero su contenido no es la forma
 * esperada de un manifiesto).
 */
export type ManifestReaderErrorReason = "invalid_manifest";

/** Error tipado que encapsula un fallo de parsing de `package.json`. */
export class ManifestReaderError extends Error {
  constructor(
    readonly reason: ManifestReaderErrorReason,
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ManifestReaderError";
  }
}
