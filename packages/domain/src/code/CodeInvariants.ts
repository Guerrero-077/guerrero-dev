import type { CodeSymbol, CodeSymbolKind } from "./CodeSymbol.js";
import type { DependencyEdge, DependencyEdgeKind } from "./DependencyEdge.js";
import type { LiteralMatch } from "./LiteralMatch.js";

const CODE_SYMBOL_KINDS: readonly CodeSymbolKind[] = [
  "function",
  "class",
  "interface",
  "type",
  "const",
  "method",
];

const DEPENDENCY_EDGE_KINDS: readonly DependencyEdgeKind[] = ["import", "re-export"];

const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]:/;

/** Duplicado deliberado de `project/ProjectProfileInvariants.isRelativePath` — las capacidades de domain/ no se importan entre sí. */
export function isRelativeFilePath(value: string): boolean {
  if (value.length === 0) return false;
  if (value.includes("\\")) return false;
  if (value.startsWith("/")) return false;
  if (WINDOWS_DRIVE_PATTERN.test(value)) return false;
  return !value.split("/").includes("..");
}

export function isKnownCodeSymbolKind(kind: string): kind is CodeSymbolKind {
  return CODE_SYMBOL_KINDS.includes(kind as CodeSymbolKind);
}

export function isKnownDependencyEdgeKind(kind: string): kind is DependencyEdgeKind {
  return DEPENDENCY_EDGE_KINDS.includes(kind as DependencyEdgeKind);
}

/** Forma congelada de un CodeSymbol (Fase 6, mapa §6b/§6c/§6d). */
export function isValidCodeSymbol(symbol: CodeSymbol): boolean {
  if (symbol.name.trim().length === 0) return false;
  if (!isKnownCodeSymbolKind(symbol.kind)) return false;
  if (!isRelativeFilePath(symbol.filePath)) return false;
  if (!Number.isInteger(symbol.line) || symbol.line < 1) return false;
  if (!Number.isInteger(symbol.endLine) || symbol.endLine < symbol.line) return false;

  if (symbol.kind === "method") {
    return (
      symbol.exported === false && symbol.containerName !== null && symbol.containerName.trim().length > 0
    );
  }
  return symbol.containerName === null;
}

/** Forma congelada de un DependencyEdge (Fase 6, mapa §6e). */
export function isValidDependencyEdge(edge: DependencyEdge): boolean {
  if (!isRelativeFilePath(edge.fromFile)) return false;
  if (edge.target.trim().length === 0) return false;
  if (!isKnownDependencyEdgeKind(edge.kind)) return false;
  return edge.importedNames.every((name) => name.trim().length > 0);
}

/** Forma congelada de un LiteralMatch (Fase 6, mapa §7) — `text` puede ser vacío. */
export function isValidLiteralMatch(match: LiteralMatch): boolean {
  if (!isRelativeFilePath(match.filePath)) return false;
  return Number.isInteger(match.line) && match.line >= 1;
}
