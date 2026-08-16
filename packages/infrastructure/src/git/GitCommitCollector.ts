import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { CommitSnapshot, ICommitCollector } from "@guerrero-dev/application";
import { COMMIT_METADATA_FORMAT, parseCommitMetadata } from "./parseCommitMetadata.js";
import { parseChangedFiles } from "./parseChangedFiles.js";
import { GitCommitCollectorError } from "./GitCommitCollectorError.js";

const execFileAsync = promisify(execFile);

/**
 * Mismo valor y mismo razonamiento que `GitHistorySource.GIT_COMMAND_TIMEOUT_MS`
 * (§14i): tuning parameter, no decisión arquitectónica, sin evidencia
 * todavía de cuál es el número correcto para repos reales grandes.
 * Nombre propio (no reexporta el de `GitHistorySource`) porque
 * `git/index.ts` reexporta ambos módulos con `export *` — dos constantes
 * con el mismo nombre en dos archivos distintos del mismo barrel
 * colisionan (`TS2308`), aunque el valor sea igual.
 */
export const GIT_COMMIT_COLLECTOR_TIMEOUT_MS = 10_000;

interface ExecFileErrorLike {
  code?: string;
  killed?: boolean;
  stderr?: string;
  message?: string;
}

/**
 * Implementación de `ICommitCollector` (Fase 4.8, decisión arquitectónica
 * nueva — ver JSDoc del puerto) vía shell directo a Git real, mismo
 * patrón que `GitHistorySource` (Fase 4.8.3): `execFile`, nunca `exec`,
 * argumentos siempre como array, nunca interpolados en un string.
 *
 * Tres invocaciones de Git separadas, cada una con una responsabilidad
 * distinta — ninguna reutiliza el parseo de otra:
 *
 * 1. `git show -s --format=<COMMIT_METADATA_FORMAT> <sha>` — metadata +
 *    mensaje completo en una sola llamada, delimitados por `\x1f` (ver
 *    `parseCommitMetadata`). `-s` suprime el diff; esta llamada no lo
 *    necesita.
 * 2. `git show --no-color --format= <sha>` — `--format=` vacío suprime
 *    el header de commit-info, dejando solo el diff/patch. Se prefiere
 *    sobre `git diff <sha>^..<sha>` porque funciona igual para el commit
 *    raíz (sin padre), sin necesitar un caso especial.
 * 3. `git show --no-color --format= --name-only <sha>` — mismo truco de
 *    formato vacío, pidiendo solo los nombres de archivo tocados (ver
 *    `parseChangedFiles`).
 *
 * Las tres corren en paralelo (`Promise.all`) — son de solo lectura,
 * independientes entre sí, y no hay razón para serializarlas.
 *
 * Comportamiento no verificado y fuera de alcance de este commit
 * (documentado, no ignorado en silencio): commits de merge — `git show`
 * sin `-m`/`-c` no emite diff para merges por default. Mismo criterio que
 * otros límites ya documentados de Fase 4.8: un comando Git nuevo es una
 * decisión de implementación que no intenta cubrir cada caso posible sin
 * evidencia real que lo exija.
 */
export class GitCommitCollector implements ICommitCollector {
  constructor(private readonly repoRoot: string) {}

  async collect(sha: string): Promise<CommitSnapshot> {
    const [metadataStdout, diff, changedFilesStdout] = await Promise.all([
      this.run(["show", "-s", `--format=${COMMIT_METADATA_FORMAT}`, sha], sha),
      this.run(["show", "--no-color", "--format=", sha], sha),
      this.run(["show", "--no-color", "--format=", "--name-only", sha], sha),
    ]);

    const metadata = parseCommitMetadata(metadataStdout);
    const changedFiles = parseChangedFiles(changedFilesStdout);

    return {
      sha: metadata.sha,
      message: metadata.message,
      author: metadata.author,
      timestamp: metadata.timestamp,
      diff,
      changedFiles,
    };
  }

  private async run(args: readonly string[], sha: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", ["--no-pager", ...args], {
        cwd: this.repoRoot,
        timeout: GIT_COMMIT_COLLECTOR_TIMEOUT_MS,
        windowsHide: true,
      });
      return stdout;
    } catch (error) {
      throw this.toGitCommitCollectorError(error, sha);
    }
  }

  private toGitCommitCollectorError(error: unknown, sha: string): GitCommitCollectorError {
    if (error instanceof GitCommitCollectorError) {
      return error;
    }

    const err = error as ExecFileErrorLike;

    if (err.code === "ENOENT") {
      return new GitCommitCollectorError(
        "git_not_found",
        "No se encontró el binario `git` en el PATH.",
        error,
      );
    }

    if (err.killed) {
      return new GitCommitCollectorError(
        "timeout",
        `La operación de Git excedió el timeout de ${GIT_COMMIT_COLLECTOR_TIMEOUT_MS}ms.`,
        error,
      );
    }

    const stderr = typeof err.stderr === "string" ? err.stderr : "";

    if (stderr.includes("not a git repository")) {
      return new GitCommitCollectorError(
        "not_a_repository",
        `"${this.repoRoot}" no es un repositorio Git válido.`,
        error,
      );
    }

    const commitMissing =
      stderr.includes("bad object") || stderr.includes("unknown revision or path not in the working tree");
    if (commitMissing) {
      return new GitCommitCollectorError(
        "commit_not_found",
        `No existe ningún commit con sha "${sha}".`,
        error,
      );
    }

    return new GitCommitCollectorError("unknown", err.message ?? "Fallo desconocido al invocar Git.", error);
  }
}
