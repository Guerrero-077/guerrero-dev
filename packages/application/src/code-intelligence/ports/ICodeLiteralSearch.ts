import type { LiteralMatch } from "@guerrero-dev/domain";

/**
 * Búsqueda literal sobre los .ts trackeados de un repositorio (Fase 6,
 * mapa §7) — independiente de `CodeIndex`, no requiere que el resultado
 * corresponda a un `CodeSymbol`.
 */
export interface ICodeLiteralSearch {
  search(repoRoot: string, query: string): Promise<readonly LiteralMatch[]>;
}
