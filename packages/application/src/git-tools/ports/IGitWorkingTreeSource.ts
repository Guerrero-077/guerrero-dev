/**
 * Traduce el estado real del working tree de un repositorio Git a datos
 * planos, sin interpretación semántica — mismo espíritu "tonto" que
 * `IGitTrackedFilesSource`/`IGitHistorySource` (application/common,
 * application/memory): entrega evidencia cruda de Git, nunca decide qué
 * significa un cambio.
 *
 * Distinto en propósito de esos dos puertos: `IGitTrackedFilesSource`
 * lista qué archivos existen (Project Intelligence); `IGitHistorySource`
 * consulta el historial de commits ya cerrados (formación de Memory).
 * Este puerto observa el estado *actual*, no comiteado — pensado como
 * herramienta que el propio agente invoca en runtime (vía MCP, ver
 * `@guerrero-dev/mcp`), no como insumo de un pipeline batch.
 */
export interface GitStatusEntry {
  /**
   * Código de 2 caracteres tal como lo devuelve `git status --porcelain=v1`
   * (p. ej. " M", "??", "A ", "MM") — sin traducir a texto, el modelo ya
   * conoce el vocabulario de Git de su propio entrenamiento.
   */
  readonly statusCode: string;
  /**
   * Ruta tal como la devuelve Git, relativa a `repoRoot`. Para renames
   * (`R  old -> new`), viaja completa sin partir en `oldPath`/`newPath` —
   * mismo criterio de no sobre-interpretar que el resto del puerto.
   */
  readonly path: string;
}

export interface GitLogEntry {
  readonly hash: string;
  readonly authorName: string;
  /** Fecha de autoría en formato ISO 8601 estricto (`%aI` de Git). */
  readonly authorDate: string;
  readonly subject: string;
}

export interface IGitWorkingTreeSource {
  /** Estado real de `repoRoot` (`git status --porcelain=v1`). */
  getStatus(repoRoot: string): Promise<readonly GitStatusEntry[]>;

  /**
   * Diff real de `repoRoot` contra `HEAD` (staged + unstaged). `filePath`,
   * si se pasa, acota el diff a un único archivo (ruta relativa a
   * `repoRoot`). Puede fallar con `reason: "unknown"` en un repositorio sin
   * ningún commit todavía (`HEAD` no existe) — limitación conocida, sin
   * caso de uso real que la justifique todavía.
   */
  getDiff(repoRoot: string, filePath?: string): Promise<string>;

  /** Los `limit` commits más recientes de `repoRoot`, del más nuevo al más viejo. */
  getRecentLog(repoRoot: string, limit: number): Promise<readonly GitLogEntry[]>;
}
