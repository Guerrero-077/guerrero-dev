import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IGitTrackedFilesSource } from "@guerrero-dev/application";
import { GIT_COMMAND_TIMEOUT_MS } from "./GitHistorySource.js";
import { GitTrackedFilesSourceError } from "./GitTrackedFilesSourceError.js";
import { parseTrackedFiles } from "./parseTrackedFiles.js";

const execFileAsync = promisify(execFile);

interface ExecFileErrorLike {
  code?: string;
  killed?: boolean;
  stderr?: string;
}

/**
 * Implementación de `IGitTrackedFilesSource` (Fase 5.2) vía shell directo a
 * Git real (`execFile`, argumentos como array, nunca interpolados).
 * `repoRoot` es parámetro del método, no del constructor (ver JSDoc del
 * puerto): esta clase no tiene estado, se reutiliza contra N proyectos.
 *
 * `encoding: "utf8"` explícito: frontera de decode controlada entre los
 * bytes crudos que devuelve Git y el texto que recibe `parseTrackedFiles`
 * — no se deja como default implícito de Node.
 */
export class GitTrackedFilesSource implements IGitTrackedFilesSource {
  async listTrackedFiles(repoRoot: string): Promise<readonly string[]> {
    try {
      const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
        cwd: repoRoot,
        timeout: GIT_COMMAND_TIMEOUT_MS,
        windowsHide: true,
        encoding: "utf8",
      });
      return parseTrackedFiles(stdout);
    } catch (error) {
      throw this.toGitTrackedFilesSourceError(error, repoRoot);
    }
  }

  private toGitTrackedFilesSourceError(error: unknown, repoRoot: string): GitTrackedFilesSourceError {
    if (error instanceof GitTrackedFilesSourceError) {
      return error;
    }

    const err = error as ExecFileErrorLike & { message?: string };

    if (err.code === "ENOENT") {
      return new GitTrackedFilesSourceError(
        "git_not_found",
        "No se encontró el binario `git` en el PATH.",
        error,
      );
    }

    if (err.killed) {
      return new GitTrackedFilesSourceError(
        "timeout",
        `La operación de Git excedió el timeout de ${GIT_COMMAND_TIMEOUT_MS}ms.`,
        error,
      );
    }

    if (typeof err.stderr === "string" && err.stderr.includes("not a git repository")) {
      return new GitTrackedFilesSourceError(
        "not_a_repository",
        `"${repoRoot}" no es un repositorio Git válido.`,
        error,
      );
    }

    return new GitTrackedFilesSourceError(
      "unknown",
      err.message ?? "Fallo desconocido al invocar Git.",
      error,
    );
  }
}
