import { beforeAll, describe, expect, it } from "vitest";
import { loadConfig, OllamaEmbeddingProvider, pingOllama } from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 4.4): Ollama real corriendo en el host, sin
 * mocks. Se salta si RUN_INTEGRATION_TESTS no está en "true" (mismo patrón
 * que tests/integration/memory-repository.test.ts) o si Ollama no responde
 * — no tiene sentido fallar el suite completo porque el modelo no está
 * pulled localmente.
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

function cosineSimilarity(a: readonly number[], b: readonly number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += (a[i] ?? 0) * (b[i] ?? 0);
  }
  // Los embeddings ya salen L2-normalizados de OllamaEmbeddingProvider, así
  // que el producto punto es directamente la similitud coseno.
  return dot;
}

describe("OllamaEmbeddingProvider (integration)", () => {
  let provider: OllamaEmbeddingProvider;
  let available = false;

  beforeAll(async () => {
    if (!RUN) return;
    const config = loadConfig();
    available = await pingOllama(config.OLLAMA_BASE_URL);
    provider = new OllamaEmbeddingProvider(
      config.OLLAMA_BASE_URL,
      config.OLLAMA_EMBEDDING_MODEL,
      config.EMBEDDING_DIMENSIONS,
    );

    // Warmup deliberado acá, no en el primer `it`: cargar el modelo en
    // Ollama (cold start) puede tardar varios segundos — el benchmark mide
    // exactamente eso (docs/fase-4-memory-engine.md §14b). Este test valida
    // corrección, no performance, así que absorbemos el cold start en el
    // hook (con timeout ampliado) para que cada `it` corra ya en caliente.
    if (available) {
      await provider.embed("warmup");
    }
  }, 30_000);

  describe.skipIf(!RUN)("con Ollama real", () => {
    it("devuelve exactamente EMBEDDING_DIMENSIONS componentes", async () => {
      if (!available) return;
      const config = loadConfig();
      const embedding = await provider.embed(
        "El proyecto utiliza Clean Architecture y separa Domain, Application, Infrastructure y Web.",
      );

      expect(embedding.model).toBe(config.OLLAMA_EMBEDDING_MODEL);
      expect(embedding.dimensions).toBe(config.EMBEDDING_DIMENSIONS);
      expect(embedding.values).toHaveLength(config.EMBEDDING_DIMENSIONS);
    });

    it("es razonablemente determinista para el mismo texto", async () => {
      if (!available) return;
      const text = "RefreshTokenRepository revoca todos los tokens activos del usuario.";
      const [first, second] = await Promise.all([provider.embed(text), provider.embed(text)]);

      // No exigimos bit-exactitud (backends de inferencia pueden variar en
      // el último decimal), sino que dos llamadas al mismo texto produzcan
      // vectores prácticamente idénticos en el mismo espacio.
      expect(cosineSimilarity(first.values, second.values)).toBeGreaterThan(0.999);
    });

    it("embedBatch produce los mismos vectores (dentro de tolerancia) que embed individual", async () => {
      if (!available) return;
      const texts = [
        "El proyecto utiliza PostgreSQL como persistencia principal y EF Core como ORM.",
        "The refresh token is revoked after rotation.",
      ];

      const individual = await Promise.all(texts.map((t) => provider.embed(t)));
      const batch = await provider.embedBatch(texts);

      for (let i = 0; i < texts.length; i++) {
        const fromIndividual = individual[i];
        const fromBatch = batch[i];
        expect(fromIndividual).toBeDefined();
        expect(fromBatch).toBeDefined();
        expect(cosineSimilarity(fromIndividual!.values, fromBatch!.values)).toBeGreaterThan(0.999);
      }
    });

    it("textos semánticamente relacionados quedan más cerca que textos no relacionados", async () => {
      if (!available) return;
      const query = await provider.embed("¿Cómo manejamos la revocación de refresh tokens?");
      const related = await provider.embed(
        "El método RevokeAllForUserAsync actualiza todos los refresh tokens activos.",
      );
      const unrelated = await provider.embed(
        "Prefiere interfaces para desacoplar infraestructura de los casos de uso.",
      );

      const simRelated = cosineSimilarity(query.values, related.values);
      const simUnrelated = cosineSimilarity(query.values, unrelated.values);
      expect(simRelated).toBeGreaterThan(simUnrelated);
    });
  });
});
