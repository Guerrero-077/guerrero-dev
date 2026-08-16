import type { CodeIndex, CodeSymbol } from "@guerrero-dev/domain";

/** Exact-match únicamente (Fase 6, mapa §8) — sin fuzzy, sin substring, sin case-insensitive. */
export function findSymbolsByName(index: CodeIndex, name: string): readonly CodeSymbol[] {
  return index.symbols.filter((symbol) => symbol.name === name);
}
