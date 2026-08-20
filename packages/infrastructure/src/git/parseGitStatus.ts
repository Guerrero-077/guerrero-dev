import type { GitStatusEntry } from "@guerrero-dev/application";
import { GitWorkingTreeSourceError } from "./GitWorkingTreeSourceError.js";

/**
 * Longitud mínima de una línea válida de `git status --porcelain=v1`: 2
 * caracteres de código de estado + 1 espacio + al menos 1 caracter de
 * ruta.
 */
const MIN_STATUS_LINE_LENGTH = 4;

/**
 * Parsea el stdout de `git status --porcelain=v1` (una línea por archivo,
 * formato `XY path`) a entradas planas. Función pura, sin I/O — testeable
 * sin invocar Git real.
 *
 * Deliberadamente no parte `path` en `oldPath`/`newPath` para renames
 * (`R  old -> new`): mismo criterio "tonto" que el resto de
 * infrastructure/git, no reinterpretar lo que Git ya expresa con claridad.
 * `-z` (NUL-separado, como usa `GitTrackedFilesSource`) se evita a
 * propósito acá: partiría el formato `old -> new` de un rename en dos
 * campos NUL-separados sin el separador humano " -> ", complicando el
 * parseo sin beneficio real para este caso de uso (una tool que el agente
 * lee, no un pipeline que compara rutas exactas).
 */
export function parseGitStatus(stdout: string): readonly GitStatusEntry[] {
  const lines = stdout.split("\n").filter((line) => line.length > 0);
  const entries: GitStatusEntry[] = [];

  for (const line of lines) {
    if (line.length < MIN_STATUS_LINE_LENGTH || line[2] !== " ") {
      throw new GitWorkingTreeSourceError(
        "invalid_output",
        `Línea de salida de "git status --porcelain=v1" no matchea el formato esperado "XY path": "${line}"`,
      );
    }

    entries.push({ statusCode: line.slice(0, 2), path: line.slice(3) });
  }

  return entries;
}
