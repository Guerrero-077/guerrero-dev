import type { Embedding } from "@guerrero-dev/domain";
import type { IEmbeddingProvider } from "@guerrero-dev/application";

interface OllamaEmbedResponse {
  model: string;
  embeddings: number[][];
}

/**
 * `IEmbeddingProvider` sobre Ollama (Fase 4.4 — docs/fase-4-memory-engine.md).
 *
 * Decisiones de esta implementación:
 *
 * - Un único request HTTP por `embedBatch`, vía `/api/embed` con `input`
 *   como array. `embed(text)` es `embedBatch([text])[0]` — no hay dos
 *   caminos distintos para lo mismo.
 * - El modelo (`qwen3-embedding:4b` por defecto) emite vectores nativos de
 *   más dimensiones que las configuradas (p.ej. 2560). Este provider trunca
 *   a `dimensions` vía MRL (Matryoshka Representation Learning: el modelo
 *   fue entrenado para que los primeros N componentes por sí solos sigan
 *   siendo un embedding válido) y **renormaliza L2** después de truncar,
 *   porque cosine similarity con vectores no normalizados tras el corte da
 *   resultados sistemáticamente sesgados hacia vectores más largos.
 * - No se asume que 1024 sea la dimensión correcta: eso es exactamente lo
 *   que el benchmark de `scripts/benchmark-embeddings.ts` mide antes de
 *   fijar `vector(1024)` en la migración. Este provider solo hace lo que
 *   se le configura.
 * - Sin prefijos de instrucción (a diferencia de nomic-embed-text o
 *   mxbai-embed-large). Qwen3-Embedding admite un prefijo `Instruct: ...`
 *   opcional para queries que puede mejorar retrieval; se agrega en una
 *   iteración posterior solo si el benchmark de Recall@5/MRR muestra que
 *   hace falta — no antes.
 */
export class OllamaEmbeddingProvider implements IEmbeddingProvider {
  constructor(
    private readonly baseUrl: string,
    readonly model: string,
    readonly dimensions: number,
    private readonly timeoutMs = 30_000,
  ) {}

  async embed(text: string): Promise<Embedding> {
    const [embedding] = await this.embedBatch([text]);
    if (!embedding) {
      throw new Error("Ollama no devolvió ningún embedding para el texto solicitado");
    }
    return embedding;
  }

  async embedBatch(texts: readonly string[]): Promise<readonly Embedding[]> {
    if (texts.length === 0) {
      return [];
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(new URL("/api/embed", this.baseUrl), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: this.model, input: texts }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`Ollama no respondió dentro de ${this.timeoutMs}ms al generar embeddings`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      throw new Error(`Ollama respondió ${res.status} al generar embeddings`);
    }

    const data = (await res.json()) as OllamaEmbedResponse;

    if (data.embeddings.length !== texts.length) {
      throw new Error(
        `Ollama devolvió ${data.embeddings.length} embeddings para ${texts.length} textos solicitados`,
      );
    }

    return data.embeddings.map((values) => this.toEmbedding(values));
  }

  private toEmbedding(nativeValues: number[]): Embedding {
    if (nativeValues.length < this.dimensions) {
      throw new Error(
        `El modelo ${this.model} devolvió ${nativeValues.length} dimensiones, ` +
          `menos que las ${this.dimensions} configuradas`,
      );
    }

    const truncated = nativeValues.slice(0, this.dimensions);
    const values = l2Normalize(truncated);

    return { values, model: this.model, dimensions: this.dimensions };
  }
}

/** Renormaliza un vector truncado (norma L2 = 1) para que cosine similarity siga siendo comparable. */
function l2Normalize(vector: readonly number[]): readonly number[] {
  const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (norm === 0) {
    return vector;
  }
  return vector.map((v) => v / norm);
}
