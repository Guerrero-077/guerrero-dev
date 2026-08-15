import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { IGitHistorySource } from "@guerrero-dev/application";
import { GitHistorySourceError } from "./GitHistorySourceError.js";
import { parseCommitList } from "./parseCommitList.js";

const execFileAsync = promisify(execFile);

/**
 * Timeout por invocación a Git. Tuning parameter, no decisión
 * arquitectónica — sin evidencia todavía de cuál es el número correcto
 * para repos reales grandes (ver §14i, `docs/fase-4-memory-engine.md`).
 */
export const GIT_COMMAND_TIMEOUT_MS = 10_000;

interface ExecFileErrorLike {
  code?: string;
  killed?: boolean;
  stderr?: string;
}

/**
 * Implementación de `IGitHistorySource` (Fase 4.8.3) vía shell directo a
 * Git real (`execFile`, nunca `exec` — argumentos siempre como array,
 * nunca interpolados en un string). Responsabilidad estricta: armar el
 * comando, ejecutar, parsear, mapear errores. NO decide qué cuenta como
 * "relacionado" — esa interpretación vive exclusivamente en
 * `DeterministicCommitAnalyzer` (`packages/application`), que es quien
 * construye los `paths`/`before`/`limit` que este adapter recibe.
 *
 * `--pretty=format:%H` da una SHA completa por línea, sin truncar ni
 * pasar por `head`/`tail`/pipes — el mismo tipo de parsing optimista que
 * truncó las magnitudes del golden dataset no puede repetirse aquí.
 */
export class GitHistorySource implements IGitHistorySource {
  constructor(private readonly repoRoot: string) {}

  async findCommitsTouchingPaths(
    paths: readonly string[],
    before: Date,
    limit: number,
  ): Promise<readonly string[]> {
    // Guard crítico: "git log -- " sin pathspecs después de "--" no significa
    // "sin resultados", significa "sin filtro de path" (historial completo).
    if (paths.length === 0) {
      return [];
    }

    const stdout = await this.runGitLog(["-n", String(limit), "--", ...paths], before);
    return parseCommitList(stdout);
  }

  async findRenameHistory(path: string, before: Date, limit: number): Promise<readonly string[]> {
    const stdout = await this.runGitLog(["--follow", "-n", String(limit), "--", path], before);
    return parseCommitList(stdout);
  }

  private async runGitLog(pathArgs: readonly string[], before: Date): Promise<string> {
    const args = [
      "--no-pager",
      "log",
      "--no-color",
      "--pretty=format:%H",
      `--before=${before.toISOString()}`,
      ...pathArgs,
    ];

    try {
      const { stdout } = await execFileAsync("git", args, {
        cwd: this.repoRoot,
        timeout: GIT_COMMAND_TIMEOUT_MS,
        windowsHide: true,
      });
      return stdout;
    } catch (error) {
      throw this.toGitHistorySourceError(error);
    }
  }

  private toGitHistorySourceError(error: unknown): GitHistorySourceError {
    if (error instanceof GitHistorySourceError) {
      return error;
    }

    const err = error as ExecFileErrorLike & { message?: string };

    if (err.code === "ENOENT") {
      return new GitHistorySourceError("git_not_found", "No se encontró el binario `git` en el PATH.", error);
    }

    if (err.killed) {
      return new GitHistorySourceError(
        "timeout",
        `La operación de Git excedió el timeout de ${GIT_COMMAND_TIMEOUT_MS}ms.`,
        error,
      );
    }

    if (typeof err.stderr === "string" && err.stderr.includes("not a git repository")) {
      return new GitHistorySourceError(
        "not_a_repository",
        `"${this.repoRoot}" no es un repositorio Git válido.`,
        error,
      );
    }

    return new GitHistorySourceError("unknown", err.message ?? "Fallo desconocido al invocar Git.", error);
  }
}
