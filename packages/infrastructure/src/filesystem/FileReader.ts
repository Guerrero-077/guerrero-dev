import { readFile as fsReadFile } from "node:fs/promises";
import { resolve } from "node:path";
import { isRelativePath } from "@guerrero-dev/domain";
import type { IFileReader } from "@guerrero-dev/application";
import { FileReaderError } from "./FileReaderError.js";
import { isPathWithinRoot } from "./isPathWithinRoot.js";

interface NodeErrorLike {
  code?: string;
}

/**
 * Implementación de `IFileReader` (Fase 5.3) vía `node:fs/promises`.
 * `repoRoot` es parámetro del método, no del constructor (ver JSDoc del
 * puerto): sin estado, se reutiliza contra N proyectos.
 *
 * Dos capas de validación antes de tocar el filesystem, con
 * responsabilidades separadas (no una sustituye a la otra):
 *
 * 1. `isRelativePath` (dominio, 5.1) — rechazo contractual/sintáctico.
 *    Esta clase NO redefine qué es una ruta relativa válida.
 * 2. Containment post-resolución — verifica que `resolve(repoRoot,
 *    relativePath)` permanezca dentro de `resolve(repoRoot)`, vía
 *    `path.relative` en vez de `resolved.startsWith(root)`: un
 *    `startsWith` ingenuo aceptaría `/repo/project-other/file.txt` contra
 *    `root = /repo/project` (coincidencia de prefijo de string, no de
 *    directorio) — `path.relative` respeta el límite real del directorio,
 *    y funciona igual en Windows y POSIX.
 */
export class FileReader implements IFileReader {
  async readFile(repoRoot: string, relativePath: string): Promise<string> {
    if (!isRelativePath(relativePath)) {
      throw new FileReaderError(
        "invalid_path",
        `"${relativePath}" no cumple el contrato de ruta relativa (isRelativePath).`,
      );
    }

    const normalizedRoot = resolve(repoRoot);
    const target = resolve(normalizedRoot, relativePath);

    if (!isPathWithinRoot(normalizedRoot, target)) {
      throw new FileReaderError("invalid_path", `"${relativePath}" resuelve fuera de "${repoRoot}".`);
    }

    try {
      return await fsReadFile(target, "utf8");
    } catch (error) {
      throw this.toFileReaderError(error, relativePath);
    }
  }

  private toFileReaderError(error: unknown, relativePath: string): FileReaderError {
    const err = error as NodeErrorLike & { message?: string };

    if (err.code === "ENOENT") {
      return new FileReaderError("not_found", `No existe el archivo "${relativePath}".`, error);
    }

    if (err.code === "EACCES" || err.code === "EPERM") {
      return new FileReaderError("access_denied", `Acceso denegado a "${relativePath}".`, error);
    }

    if (err.code === "EISDIR") {
      return new FileReaderError(
        "is_a_directory",
        `"${relativePath}" es un directorio, no un archivo.`,
        error,
      );
    }

    return new FileReaderError(
      "unknown",
      err.message ?? `Fallo desconocido al leer "${relativePath}".`,
      error,
    );
  }
}
