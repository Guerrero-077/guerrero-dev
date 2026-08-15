import type { Memory } from "@guerrero-dev/domain";

/**
 * Salida final de `IMemoryRetriever.search()` (Fase 4.1 §21, Fase 4.6):
 * memoria + score híbrido + explicación de por qué quedó rankeada así.
 * `reasons` es para debugging/observabilidad ("por qué el sistema trajo
 * esto"), no participa en el cálculo del score.
 */
export interface MemorySearchResult {
  readonly memory: Memory;
  readonly score: number;
  readonly reasons: readonly string[];
}
