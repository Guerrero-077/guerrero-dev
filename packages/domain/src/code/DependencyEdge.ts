export type DependencyEdgeKind = "import" | "re-export";

/**
 * Una relación de import/re-export entre archivos `.ts` (Fase 6, mapa
 * §6e). `target` es el module specifier textual, sin resolución a ruta
 * local. `importedNames` puede incluir los tokens `"*"` (namespace/re-export
 * total) y `"default"` (default import), además de nombres explícitos.
 */
export interface DependencyEdge {
  readonly fromFile: string;
  readonly target: string;
  readonly kind: DependencyEdgeKind;
  readonly importedNames: readonly string[];
}
