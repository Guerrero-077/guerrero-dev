import type { CommitReference } from "../models/CommitReference.js";
import type { CommitSignal } from "../models/CommitSignal.js";
import type { CommitSnapshot } from "../models/CommitSnapshot.js";
import type { ICommitAnalyzer } from "../ports/ICommitAnalyzer.js";
import type { IGitHistorySource } from "../ports/IGitHistorySource.js";

/**
 * Máximo de resultados por consulta a `IGitHistorySource` y del
 * `CommitSignal.recentRelatedCommits` final. Tuning parameter, no decisión
 * arquitectónica — sin evidencia todavía de cuál es el número correcto
 * (ver §14h, `docs/fase-4-memory-engine.md`). Se revisita si el golden
 * dataset lo justifica.
 */
export const HISTORY_QUERY_LIMIT = 5;

/**
 * Implementación determinista de `ICommitAnalyzer` (Fase 4.8.3): convierte
 * un `CommitSnapshot` crudo en `CommitSignal`. Dos responsabilidades
 * deliberadamente separadas:
 *
 * 1. **Estadísticas puras del propio commit**
 *    (`filesChanged`/`linesAdded`/`linesRemoved`/`touchedPaths`) — se
 *    derivan enteramente de `commit.diff`/`commit.changedFiles`, sin I/O.
 * 2. **Contexto histórico estructural** (`recentRelatedCommits`) — toda la
 *    evidencia cruda viene de `IGitHistorySource` (I/O real vía Git); este
 *    servicio decide, de forma pura, qué combinación de esa evidencia
 *    cuenta como `CommitReference`: overlap de paths exactos, overlap de
 *    directorio (paths derivados), y continuidad de renombrado — nunca
 *    mismo autor, ventana temporal, ni vocabulario del mensaje (frontera
 *    congelada, ver `CommitReference` y §14g/§14h de
 *    `fase-4-memory-engine.md`).
 *
 * Deliberadamente NO interpreta intención arquitectónica
 * (`architectural_decision`, `supersedes`, `reinforces`, etc.) — eso es
 * responsabilidad exclusiva de `ICandidateExtractor`.
 */
export class DeterministicCommitAnalyzer implements ICommitAnalyzer {
  constructor(private readonly historySource: IGitHistorySource) {}

  async analyze(commit: CommitSnapshot): Promise<CommitSignal> {
    const { linesAdded, linesRemoved } = parseDiffStats(commit.diff);
    const touchedPaths = commit.changedFiles;

    return {
      commit,
      filesChanged: touchedPaths.length,
      linesAdded,
      linesRemoved,
      touchedPaths,
      recentRelatedCommits: await this.findRecentRelatedCommits(commit),
    };
  }

  /**
   * Combina las tres heurísticas estructurales congeladas contra
   * `IGitHistorySource`, y las reduce a una lista deduplicada (excluyendo
   * el propio `commit.sha`, defensivamente) truncada a
   * `HISTORY_QUERY_LIMIT`. `before` es siempre `commit.timestamp` — nunca
   * se mira hacia adelante en el historial.
   */
  private async findRecentRelatedCommits(commit: CommitSnapshot): Promise<readonly CommitReference[]> {
    const directories = deriveDirectories(commit.changedFiles);

    const [pathOverlap, directoryOverlap, ...renameHistories] = await Promise.all([
      commit.changedFiles.length > 0
        ? this.historySource.findCommitsTouchingPaths(
            commit.changedFiles,
            commit.timestamp,
            HISTORY_QUERY_LIMIT,
          )
        : Promise.resolve<readonly string[]>([]),
      directories.length > 0
        ? this.historySource.findCommitsTouchingPaths(directories, commit.timestamp, HISTORY_QUERY_LIMIT)
        : Promise.resolve<readonly string[]>([]),
      ...commit.changedFiles.map((path) =>
        this.historySource.findRenameHistory(path, commit.timestamp, HISTORY_QUERY_LIMIT),
      ),
    ]);

    const merged = [...pathOverlap, ...directoryOverlap, ...renameHistories.flat()];

    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const sha of merged) {
      if (sha === commit.sha || seen.has(sha)) continue;
      seen.add(sha);
      deduped.push(sha);
    }

    return deduped.slice(0, HISTORY_QUERY_LIMIT).map((sha) => ({ sha }));
  }
}

/**
 * Cuenta líneas `+`/`-` de un diff unificado, ignorando las cabeceras de
 * archivo (`+++`/`---`). Suficiente para el golden dataset — no intenta
 * parsear hunks, renombres, ni binarios.
 */
function parseDiffStats(diff: string): { linesAdded: number; linesRemoved: number } {
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const line of diff.split("\n")) {
    if (line.startsWith("+++") || line.startsWith("---")) continue;
    if (line.startsWith("+")) linesAdded++;
    else if (line.startsWith("-")) linesRemoved++;
  }
  return { linesAdded, linesRemoved };
}

/** Directorios únicos derivados de `paths`. Archivos en la raíz (sin `/`) no aportan un directorio útil que consultar. */
function deriveDirectories(paths: readonly string[]): readonly string[] {
  const directories = new Set<string>();
  for (const path of paths) {
    const lastSlash = path.lastIndexOf("/");
    if (lastSlash < 0) continue;
    directories.add(path.slice(0, lastSlash));
  }
  return [...directories];
}
