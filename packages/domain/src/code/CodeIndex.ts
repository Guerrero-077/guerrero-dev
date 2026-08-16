import type { CodeSymbol } from "./CodeSymbol.js";
import type { DependencyEdge } from "./DependencyEdge.js";

/** Estado derivado y reconstruible del análisis de un repositorio (Fase 6, mapa §5) — no se persiste. */
export interface CodeIndex {
  readonly symbols: readonly CodeSymbol[];
  readonly edges: readonly DependencyEdge[];
}
