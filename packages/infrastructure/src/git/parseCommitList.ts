import { GitHistorySourceError } from "./GitHistorySourceError.js";

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Parsea el stdout de `git log --pretty=format:%H` (una SHA completa por
 * línea, sin texto extra) a una lista de SHAs validadas. Función pura,
 * sin I/O — testeable sin invocar Git real.
 *
 * Deliberadamente estricta: si alguna línea no matchea el formato exacto
 * de una SHA de 40 hex, lanza `GitHistorySourceError("invalid_output")` en
 * vez de aceptarla silenciosamente. Esto es a propósito el mismo tipo de
 * error que produjo las magnitudes truncadas del golden dataset (parsing
 * optimista de output de Git) — aquí se prefiere fallar ruidosamente.
 */
export function parseCommitList(stdout: string): readonly string[] {
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    if (!FULL_SHA_PATTERN.test(line)) {
      throw new GitHistorySourceError(
        "invalid_output",
        `Línea de salida de "git log" no es una SHA de 40 hex válida: "${line}"`,
      );
    }
  }

  return lines;
}
