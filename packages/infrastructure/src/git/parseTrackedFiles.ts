import { isRelativePath } from "@guerrero-dev/domain";
import { GitTrackedFilesSourceError } from "./GitTrackedFilesSourceError.js";

/**
 * Parsea el stdout de `git ls-files -z` (rutas separadas por NUL, no por
 * salto de línea) a una lista de rutas validadas. Función pura, sin I/O —
 * testeable sin invocar Git real.
 *
 * `-z` en vez del formato de línea por defecto: a diferencia de una SHA
 * (siempre ASCII), un path puede tener espacios o Unicode, y `git ls-files`
 * por defecto entrecomilla/escapa esos casos (`core.quotePath`) en vez de
 * darlos crudos. `stdout` ya llega decodificado como texto UTF-8 (frontera
 * de decode explícita en `GitTrackedFilesSource`, vía `execFile`); este
 * parser solo separa por NUL — no normaliza, no repara, no reinterpreta
 * bytes.
 *
 * Cada ruta se valida contra `isRelativePath` (`@guerrero-dev/domain`,
 * congelada en 5.1): relativa al root, sin segmentos `..`, sin separador de
 * Windows, sin unidad de disco. Si algo la viola, se rechaza con
 * `invalid_output` en vez de aceptarse silenciosamente — mismo criterio
 * anti-parsing-optimista que `parseCommitList`.
 */
export function parseTrackedFiles(stdout: string): readonly string[] {
  const paths = stdout.split("\0").filter((path) => path.length > 0);

  for (const path of paths) {
    if (!isRelativePath(path)) {
      throw new GitTrackedFilesSourceError(
        "invalid_output",
        `"git ls-files -z" devolvió una ruta que viola el contrato de ruta relativa: "${path}"`,
      );
    }
  }

  return paths;
}
