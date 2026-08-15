import type { Entity } from "../shared/Entity.js";

/**
 * Representación vectorial de una `Memory` (Fase 4.1 §13-14).
 *
 * Deliberadamente separado de `Memory` en vez de un campo `embedding`
 * directo: puede haber varios modelos de embedding coexistiendo, o una
 * migración de un modelo a otro, sin tocar la fila de `memories`.
 *
 * `dimensions` no se hardcodea (p.ej. `vector(1536)`) hasta que se elija el
 * `IEmbeddingProvider` concreto (Fase 4.5) — viaja como metadata junto al
 * embedding.
 */
export interface MemoryEmbedding extends Entity {
  readonly memoryId: string;
  readonly embedding: readonly number[];
  readonly model: string;
  readonly dimensions: number;
  readonly createdAt: Date;
}
