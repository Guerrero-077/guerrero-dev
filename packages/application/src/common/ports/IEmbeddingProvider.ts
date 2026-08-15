import type { Embedding } from "@guerrero-dev/domain";

/**
 * Contrato mínimo del proveedor de embeddings (Fase 4.1 §8, Fase 4.3 §8).
 * Excepción deliberada al orden 4.2→4.9: se define ya para poder congelar
 * la forma de `memory_embeddings` antes de la migración, pero no se
 * implementa todavía. El provider real (local vía Ollama, comparado
 * contra alternativas por calidad/latencia/RAM/VRAM en español + inglés
 * técnico + código) se elige en Fase 4.4 — recién ahí se fija
 * `dimensions` y el índice HNSW/IVFFlat en PostgreSQL.
 */
export interface IEmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;

  embed(text: string): Promise<Embedding>;
}
