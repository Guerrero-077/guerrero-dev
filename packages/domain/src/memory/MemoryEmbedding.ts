import type { Entity } from "../shared/Entity.js";

/**
 * Representación vectorial de una `Memory` (Fase 4.1 §13-14, Fase 4.5 §14c).
 *
 * Deliberadamente separado de `Memory` en vez de un campo `embedding`
 * directo: puede haber varios modelos de embedding coexistiendo, o una
 * migración de un modelo a otro, sin tocar la fila de `memories` — por eso
 * `findByMemoryId` en `IMemoryEmbeddingRepository` devuelve un array, no un
 * único valor.
 *
 * `provider` + `model` + `dimensions` identifican de dónde salió el vector
 * (Fase 4.4: `ollama` / `qwen3-embedding:4b` / `1024`). Deliberadamente NO
 * se agrega todavía un `embeddingVersion` separado — cuando haga falta
 * migrar de modelo se diseña esa estrategia entonces, no antes (Fase 4.5
 * §14d: no sobrearquitecturar una migración que no existe todavía).
 */
export interface MemoryEmbedding extends Entity {
  readonly memoryId: string;
  readonly embedding: readonly number[];
  readonly provider: string;
  readonly model: string;
  readonly dimensions: number;
  readonly createdAt: Date;
}
