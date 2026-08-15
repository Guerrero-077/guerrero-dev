import type { MemoryScope, MemoryType } from "@guerrero-dev/domain";

/**
 * Entrada del caso de uso completo `IMemoryRetriever.search()` (Fase 4.1
 * §21, Fase 4.6). `text` es la pregunta en lenguaje natural — convertirla a
 * embedding es responsabilidad de `IMemoryRetriever` (vía
 * `IEmbeddingProvider`), no de quien llama a `search()`.
 */
export interface MemorySearchQuery {
  readonly text: string;
  readonly projectId?: string;
  readonly types?: readonly MemoryType[];
  readonly scopes?: readonly MemoryScope[];
  readonly limit?: number;
}
