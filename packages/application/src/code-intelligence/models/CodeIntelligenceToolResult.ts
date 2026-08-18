import type { CodeSymbol, DependencyEdge, LiteralMatch } from "@guerrero-dev/domain";

/** Resultado de `CodeIntelligenceToolHandler.handle()` (Fase 5.4b), discriminado por `toolName`. */
export type CodeIntelligenceToolResult =
  | { readonly toolName: "find_symbols_by_name"; readonly symbols: readonly CodeSymbol[] }
  | { readonly toolName: "get_dependencies"; readonly edges: readonly DependencyEdge[] }
  | { readonly toolName: "get_dependents"; readonly edges: readonly DependencyEdge[] }
  | { readonly toolName: "search_literal"; readonly matches: readonly LiteralMatch[] };
