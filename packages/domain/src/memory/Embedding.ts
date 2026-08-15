/**
 * Resultado conceptual de un proveedor de embeddings (Fase 4.1 §8, Fase
 * 4.3 §8). El dominio no conoce Ollama, OpenAI, Gemini ni Transformers —
 * solo esta forma.
 *
 * No es una `Entity`: no tiene `id` propio. Es el valor que produce
 * `IEmbeddingProvider.embed()`, antes de decidir si se persiste como
 * `MemoryEmbedding` (que sí es una entidad, con su propio `id` y
 * `memoryId`).
 */
export interface Embedding {
  readonly values: readonly number[];
  readonly model: string;
  readonly dimensions: number;
}
