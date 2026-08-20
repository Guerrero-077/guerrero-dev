import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { GitLogEntry, GitStatusEntry, IGitWorkingTreeSource } from "@guerrero-dev/application";
import { GIT_COMMAND_TIMEOUT_MS } from "./GitHistorySource.js";
import { GitWorkingTreeSourceError } from "./GitWorkingTreeSourceError.js";
import { GIT_LOG_FIELD_SEPARATOR, GIT_LOG_RECORD_SEPARATOR, parseGitLog } from "./parseGitLog.js";
import { parseGitStatus } from "./parseGitStatus.js";

const execFileAsync = promisify(execFile);

/**
 * Cota dura sobre el tamaño de un diff devuelto por `getDiff()` — un diff
 * real de un reformateo masivo (ej. Prettier sobre un archivo de miles de
 * líneas) puede desbordar la ventana de contexto de un modelo 7B mucho
 * antes que cualquier otro tool de este repo (mismo riesgo que
 * "Pilar F — Token Bleeding" señalado en la auditoría externa que motivó
 * este archivo). No es un `DiffTrimmer` inteligente (resumir por firma de
 * función) — es un corte duro y honesto, documentado en el propio output,
 * sin pretender ser más sofisticado de lo que es.
 */
export const MAX_DIFF_OUTPUT_CHARS = 20_000;

/** `1MB` (default de Node) se queda corto para un diff real grande antes de truncar. */
const MAX_GIT_OUTPUT_BUFFER_BYTES = 10 * 1024 * 1024;

const GIT_LOG_PRETTY_FORMAT = `tformat:%H${GIT_LOG_FIELD_SEPARATOR}%an${GIT_LOG_FIELD_SEPARATOR}%aI${GIT_LOG_FIELD_SEPARATOR}%s${GIT_LOG_RECORD_SEPARATOR}`;

interface ExecFileErrorLike {
  code?: string;
  killed?: boolean;
  stderr?: string;
}

/**
 * Implementación de `IGitWorkingTreeSource` vía shell directo a Git real
 * (`execFile`, argumentos siempre como array, nunca interpolados en un
 * string) — mismo patrón exacto que `GitHistorySource`/`GitTrackedFilesSource`.
 * Sin estado: `repoRoot` es parámetro de cada método, no del constructor,
 * para poder reutilizar una sola instancia contra N proyectos (mismo
 * motivo que `GitTrackedFilesSource`).
 *
 * `getDiff()` usa `git diff HEAD` (no `git diff` a secas): incluye tanto
 * cambios staged como unstaged desde el último commit — el agente no
 * expone ningún concepto de "stage" al modelo (no hay tool `git add`
 * todavía), así que la pregunta real que esta tool responde es "qué
 * cambió desde el último commit", no "qué está en el índice". Falla con
 * `reason: "unknown"` en un repositorio sin ningún commit (`HEAD` no
 * existe) — limitación conocida y aceptada, sin evidencia de que un
 * proyecto real cableado a `guerrero agent run` empiece así.
 */
export class GitWorkingTreeSource implements IGitWorkingTreeSource {
  async getStatus(repoRoot: string): Promise<readonly GitStatusEntry[]> {
    const stdout = await this.runGit(["status", "--porcelain=v1"], repoRoot);
    return parseGitStatus(stdout);
  }

  async getDiff(repoRoot: string, filePath?: string): Promise<string> {
    const args = filePath === undefined ? ["diff", "HEAD"] : ["diff", "HEAD", "--", filePath];
    const stdout = await this.runGit(args, repoRoot);
    return this.truncateDiff(stdout);
  }

  async getRecentLog(repoRoot: string, limit: number): Promise<readonly GitLogEntry[]> {
    const stdout = await this.runGit(["log", "-n", String(limit), `--pretty=${GIT_LOG_PRETTY_FORMAT}`], repoRoot);
    return parseGitLog(stdout);
  }

  private truncateDiff(stdout: string): string {
    if (stdout.length <= MAX_DIFF_OUTPUT_CHARS) {
      return stdout;
    }

    const omitted = stdout.length - MAX_DIFF_OUTPUT_CHARS;
    return `${stdout.slice(0, MAX_DIFF_OUTPUT_CHARS)}\n\n[... diff truncado, ${omitted} caracteres omitidos ...]`;
  }

  private async runGit(args: readonly string[], repoRoot: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync("git", ["--no-pager", ...args], {
        cwd: repoRoot,
        timeout: GIT_COMMAND_TIMEOUT_MS,
        windowsHide: true,
        encoding: "utf8",
        maxBuffer: MAX_GIT_OUTPUT_BUFFER_BYTES,
      });
      return stdout;
    } catch (error) {
      throw this.toGitWorkingTreeSourceError(error, repoRoot);
    }
  }

  private toGitWorkingTreeSourceError(error: unknown, repoRoot: string): GitWorkingTreeSourceError {
    if (error instanceof GitWorkingTreeSourceError) {
      return error;
    }

    const err = error as ExecFileErrorLike & { message?: string };

    if (err.code === "ENOENT") {
      return new GitWorkingTreeSourceError("git_not_found", "No se encontró el binario `git` en el PATH.", error);
    }

    if (err.killed) {
      return new GitWorkingTreeSourceError(
        "timeout",
        `La operación de Git excedió el timeout de ${GIT_COMMAND_TIMEOUT_MS}ms.`,
        error,
      );
    }

    if (typeof err.stderr === "string" && err.stderr.includes("not a git repository")) {
      return new GitWorkingTreeSourceError(
        "not_a_repository",
        `"${repoRoot}" no es un repositorio Git válido.`,
        error,
      );
    }

    return new GitWorkingTreeSourceError("unknown", err.message ?? "Fallo desconocido al invocar Git.", error);
  }
}
