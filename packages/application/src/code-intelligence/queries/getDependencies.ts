import type { CodeIndex, DependencyEdge } from "@guerrero-dev/domain";

/** Exacto respecto al índice — fromFile ya es una ruta real, sin resolución (Fase 6, mapa §2). */
export function getDependencies(index: CodeIndex, filePath: string): readonly DependencyEdge[] {
  return index.edges.filter((edge) => edge.fromFile === filePath);
}
