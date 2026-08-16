import { GitCommitCollectorError } from "./GitCommitCollectorError.js";

/**
 * ASCII 0x1F (unit separator) — elegido porque no aparece en texto normal
 * (a diferencia de `,`/`|`/espacios, que sí pueden aparecer en un nombre
 * de autor o en un mensaje de commit). Mismo criterio de "no parsear
 * optimistamente" que ya costó las magnitudes truncadas del golden
 * dataset (§14i, `docs/fase-4-memory-engine.md`): un delimitador que
 * puede colisionar con datos reales habría sido esa misma trampa otra
 * vez.
 */
const FIELD_SEPARATOR = "\x1f";

/**
 * Formato exacto que `GitCommitCollector` le pide a
 * `git show -s --format=...`: sha completa, nombre de autor, fecha en
 * ISO 8601 estricto (`%aI`), y el mensaje completo (`%B`, puede tener
 * múltiples líneas) al final — el mensaje va último a propósito, así un
 * salto de línea dentro de él nunca puede confundirse con un separador de
 * campo.
 */
export const COMMIT_METADATA_FORMAT = `%H${FIELD_SEPARATOR}%an${FIELD_SEPARATOR}%aI${FIELD_SEPARATOR}%B`;

const FULL_SHA_PATTERN = /^[0-9a-f]{40}$/;

export interface ParsedCommitMetadata {
  readonly sha: string;
  readonly author: string;
  readonly timestamp: Date;
  readonly message: string;
}

/**
 * Parsea el stdout de `git show -s --format=<COMMIT_METADATA_FORMAT> <sha>`
 * (función pura, sin I/O — testeable sin invocar Git real).
 *
 * Solo los primeros 3 delimitadores separan campos (sha/author/timestamp)
 * — todo lo que sigue al tercero es el mensaje completo, sin importar
 * cuántos saltos de línea tenga.
 *
 * Se recortan TODOS los saltos de línea finales, no solo uno — corregido
 * después de verificar con `xxd` contra Git real (no alcanzaba con
 * inspección visual vía `cat -A`, que llevó a una primera versión
 * incorrecta de este comentario): `git show -s --format=...` dos fuentes
 * de salto de línea final se acumulan, ninguna con contenido real que
 * preservar —
 *
 * 1. `%B` en sí mismo termina en exactamente un `\n` (verificado: Git
 *    normaliza el mensaje guardado a un único salto de línea final al
 *    hacer commit, incluso si se intenta commitear un mensaje con varias
 *    líneas en blanco al final — probado creando un commit real con
 *    `"subject\n\n\n\n"`, quedó guardado como `"subject\n"`. No existe
 *    "una línea en blanco intencional al final de un mensaje real" que
 *    preservar; Git ya la descarta antes de que este código la vea).
 * 2. `git show -s --format=...` agrega, además, su propio salto de línea
 *    separador después de todo el bloque formateado — un artefacto del
 *    comando, no del contenido del commit.
 *
 * Además normaliza `\r\n` -> `\n` en todo el mensaje: Git for Windows
 * emite ese salto de línea que él mismo agrega (el punto 2 de arriba)
 * como `\r\n` en ese entorno — detectado corriendo la integration test
 * real contra Git en Windows (no se reproduce en Linux).
 *
 * Deliberadamente estricta, mismo criterio que `parseCommitList.ts`
 * (Fase 4.8.3): si faltan separadores, la sha no matchea 40 hex, o la
 * fecha no parsea como ISO 8601 válido, lanza `GitCommitCollectorError`
 * en vez de aceptar datos parcialmente inválidos en silencio.
 */
export function parseCommitMetadata(stdout: string): ParsedCommitMetadata {
  const first = stdout.indexOf(FIELD_SEPARATOR);
  const second = first === -1 ? -1 : stdout.indexOf(FIELD_SEPARATOR, first + 1);
  const third = second === -1 ? -1 : stdout.indexOf(FIELD_SEPARATOR, second + 1);

  if (first === -1 || second === -1 || third === -1) {
    const preview = JSON.stringify(stdout.slice(0, 200));
    throw new GitCommitCollectorError(
      "invalid_output",
      `Salida de "git show --format" no tiene los 3 separadores de campo esperados: ${preview}`,
    );
  }

  const sha = stdout.slice(0, first);
  const author = stdout.slice(first + 1, second);
  const timestampRaw = stdout.slice(second + 1, third);
  const message = stdout
    .slice(third + 1)
    .replace(/\r\n/g, "\n")
    .replace(/\n+$/, "");

  if (!FULL_SHA_PATTERN.test(sha)) {
    throw new GitCommitCollectorError("invalid_output", `"${sha}" no es una SHA de 40 hex válida.`);
  }

  const timestamp = new Date(timestampRaw);
  if (Number.isNaN(timestamp.getTime())) {
    throw new GitCommitCollectorError(
      "invalid_output",
      `"${timestampRaw}" no es una fecha ISO 8601 válida (se esperaba %aI).`,
    );
  }

  return { sha, author, timestamp, message };
}
