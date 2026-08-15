import type { Embedding } from "@guerrero-dev/domain";

/**
 * Contrato del proveedor de embeddings (Fase 4.1 §8, Fase 4.3 §8, decisión
 * Fase 4.4 en docs/fase-4-memory-engine.md).
 *
 * `dimensions` es la dimensión final que expone el provider (p.ej. 1024
 * tras truncar vía MRL), no necesariamente la dimensión nativa del modelo
 * subyacente — eso es un detalle de la implementación concreta.
 *
 * `embedBatch` no es azúcar sintáctico sobre `embed`: existe para que un
 * análisis de repositorio con cientos de memorias resulte en una sola
 * llamada a Ollama con N textos en vez de N llamadas HTTP secuenciales.
 * Toda implementación debe enviar los textos en un único request cuando el
 * runtime subyacente lo soporte.
 */
export interface IEmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;

  embed(text: string): Promise<Embedding>;
  embedBatch(texts: readonly string[]): Promise<readonly Embedding[]>;
}
