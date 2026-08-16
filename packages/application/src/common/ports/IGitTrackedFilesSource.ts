/**
 * Traduce "qué archivos existen en un repositorio Git, según Git" a una
 * lista plana de rutas (Fase 5, mapa §4). Deliberadamente "tonto", mismo
 * espíritu que `IGitHistorySource`: entrega evidencia cruda, NUNCA decide
 * qué significa — ninguna detección de tecnología, componente ni
 * configuración vive aquí (eso es 5.4/5.5).
 *
 * `repoRoot` es parámetro del método, no del constructor: a diferencia de
 * `GitHistorySource` (que opera siempre sobre este mismo repositorio),
 * `ProjectProfileScanner` (5.7) reutilizará una única instancia de este
 * puerto contra N proyectos distintos. El adapter queda sin estado.
 */
export interface IGitTrackedFilesSource {
  /**
   * Rutas de archivos *tracked* por Git en `repoRoot`, relativas a
   * `repoRoot` (contrato de 5.1: `isRelativePath`). Si `repoRoot` no es un
   * repositorio Git, rechaza con `GitTrackedFilesSourceError`
   * (`reason: "not_a_repository"`) — no hay fallback a filesystem walk en
   * v1 (limitación conocida y aceptada, mapa §4).
   */
  listTrackedFiles(repoRoot: string): Promise<readonly string[]>;
}
