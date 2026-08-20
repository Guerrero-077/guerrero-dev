import type { GitLogEntry } from "@guerrero-dev/application";
import { GitWorkingTreeSourceError } from "./GitWorkingTreeSourceError.js";

/** Separador de campo/registro real de `GIT_LOG_PRETTY_FORMAT` (ver `GitWorkingTreeSource`). */
export const GIT_LOG_FIELD_SEPARATOR = "\x1f";
export const GIT_LOG_RECORD_SEPARATOR = "\x1e";

const EXPECTED_FIELD_COUNT = 4;

/**
 * Parsea el stdout de `git log --pretty=tformat:%H<FS>%an<FS>%aI<FS>%s<RS>`
 * (un registro por commit, terminado en `GIT_LOG_RECORD_SEPARATOR`, campos
 * separados por `GIT_LOG_FIELD_SEPARATOR`) a entradas planas. Función pura,
 * sin I/O — testeable sin invocar Git real.
 *
 * `tformat` (no `format`) es deliberado: a diferencia de `format`, que
 * inserta un salto de línea entre commits pero no después del último,
 * `tformat` aplica el terminador (acá, el RS explícito) después de CADA
 * commit de forma uniforme — evita tener que distinguir "es el último
 * registro" al parsear. Separadores de control (`\x1f`/`\x1e`, no coma ni
 * pipe) para no colisionar con el contenido real de `%s` (el asunto de un
 * commit puede contener cualquier caracter imprimible).
 *
 * `.trim().length > 0` (no solo `.length > 0`) al filtrar registros:
 * verificado real contra Git real (no solo el fixture sintético de este
 * archivo) que el binario agrega un `\n` final después del último RS —
 * sin el `trim()`, ese resto queda como un "registro" de un solo campo y
 * el parseo lo rechaza con `invalid_output` pese a que la salida es
 * válida.
 */
export function parseGitLog(stdout: string): readonly GitLogEntry[] {
  const records = stdout.split(GIT_LOG_RECORD_SEPARATOR).filter((record) => record.trim().length > 0);
  const entries: GitLogEntry[] = [];

  for (const record of records) {
    const fields = record.split(GIT_LOG_FIELD_SEPARATOR);

    if (fields.length !== EXPECTED_FIELD_COUNT) {
      throw new GitWorkingTreeSourceError(
        "invalid_output",
        `Registro de salida de "git log" no tiene los ${EXPECTED_FIELD_COUNT} campos esperados (hash, autor, fecha, asunto): "${record}"`,
      );
    }

    entries.push({
      hash: fields[0] ?? "",
      authorName: fields[1] ?? "",
      authorDate: fields[2] ?? "",
      subject: fields[3] ?? "",
    });
  }

  return entries;
}
