import type { IFileReader, IPackageManifestReader, PackageManifest } from "@guerrero-dev/application";
import { parsePackageManifest } from "./parsePackageManifest.js";

/**
 * Implementación de `IPackageManifestReader` (Fase 5.4): compone
 * `IFileReader` (5.3, lectura) + `parsePackageManifest` (parsing puro).
 * Mismo criterio que `GitCommitCollector` componiendo `execFile` + parsers.
 *
 * `FileReaderError` (`not_found`, `access_denied`, `is_a_directory`,
 * `invalid_path`) se propaga tal cual, sin reenvolver — ya es el error
 * correcto para un fallo de lectura. Solo `parsePackageManifest` introduce
 * un tipo de error nuevo (`ManifestReaderError`).
 */
export class PackageManifestReader implements IPackageManifestReader {
  constructor(private readonly fileReader: IFileReader) {}

  async readPackageManifest(repoRoot: string, relativePath: string): Promise<PackageManifest> {
    const raw = await this.fileReader.readFile(repoRoot, relativePath);
    return parsePackageManifest(raw);
  }
}
