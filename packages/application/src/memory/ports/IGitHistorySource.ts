/**
 * Consulta el historial real de Git para el contexto histórico estructural
 * que usa `DeterministicCommitAnalyzer` (Fase 4.8.3). Deliberadamente
 * angosto y "tonto": responde qué commits tocaron qué paths o nombres
 * anteriores — NUNCA decide si esos commits están "relacionados" en
 * ningún sentido arquitectónico. Esa interpretación (path overlap vs.
 * directory overlap vs. rename continuity, y qué hacer con el resultado)
 * es responsabilidad exclusiva del analyzer; este puerto solo entrega
 * evidencia cruda.
 *
 * Solo dos operaciones, deliberadamente sin ampliar (decisión congelada,
 * ver §14h de `docs/fase-4-memory-engine.md`): no se agrega un tercer
 * método ni se enriquece el resultado con `message`/autor/paths/fechas
 * hasta que aparezca evidencia real de que el analyzer lo necesita.
 */
export interface IGitHistorySource {
  /**
   * SHAs de commits, antes de `before`, que tocaron alguno de `paths`.
   * El pathspec (archivo exacto o prefijo de directorio) lo decide el
   * llamador — Git resuelve "todo lo que está debajo de este directorio"
   * mecánicamente, sin que este puerto tome ninguna decisión semántica.
   * Orden: más reciente primero. Máximo `limit` resultados.
   */
  findCommitsTouchingPaths(paths: readonly string[], before: Date, limit: number): Promise<readonly string[]>;

  /**
   * SHAs de commits que tocaron `path` bajo cualquiera de sus nombres
   * anteriores (equivalente a `git log --follow`), antes de `before`. Un
   * solo archivo a la vez — `--follow` de Git no acepta múltiples
   * pathspecs. Orden: más reciente primero. Máximo `limit` resultados.
   */
  findRenameHistory(path: string, before: Date, limit: number): Promise<readonly string[]>;
}
