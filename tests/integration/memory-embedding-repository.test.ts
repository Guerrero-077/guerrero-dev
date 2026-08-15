import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Memory, MemoryEmbedding } from "@guerrero-dev/domain";
import {
  createDrizzleClient,
  createPostgresPool,
  DrizzleMemoryEmbeddingRepository,
  DrizzleMemoryRepository,
  loadConfig,
  runMigrations,
  type PgPool,
} from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 4.5): PostgreSQL + pgvector reales, sin mocks.
 * Se salta si RUN_INTEGRATION_TESTS no está en "true" (mismo patrón que
 * tests/integration/memory-repository.test.ts). No depende de Ollama: los
 * vectores acá son fijos y deterministas — la generación real ya la valida
 * tests/integration/embedding-provider.test.ts (Fase 4.4). Esto solo prueba
 * persistencia.
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

const DIMENSIONS = 1024;

/** Vector determinista de EMBEDDING_DIMENSIONS componentes, no aleatorio: reproducible entre corridas. */
function fakeVector(seed: number, dimensions = DIMENSIONS): number[] {
  return Array.from({ length: dimensions }, (_, i) => Math.sin(seed + i));
}

function buildMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date();
  return {
    id: randomUUID(),
    projectId: null,
    scope: "global",
    type: "fact",
    content: "Memoria de prueba para memory_embeddings.",
    status: "active",
    confidence: 0.9,
    importance: 0.5,
    createdAt: now,
    updatedAt: now,
    lastVerifiedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

function buildEmbedding(memoryId: string, overrides: Partial<MemoryEmbedding> = {}): MemoryEmbedding {
  return {
    id: randomUUID(),
    memoryId,
    embedding: fakeVector(1),
    provider: "ollama",
    model: "qwen3-embedding:4b",
    dimensions: DIMENSIONS,
    createdAt: new Date(),
    ...overrides,
  };
}

describe.skipIf(!RUN)("memory_embeddings persistence (integration)", () => {
  let pool: PgPool;
  let memoryRepo: DrizzleMemoryRepository;
  let embeddingRepo: DrizzleMemoryEmbeddingRepository;

  beforeAll(async () => {
    const config = loadConfig();
    pool = createPostgresPool(config);
    await runMigrations(pool);
    const db = createDrizzleClient(pool);
    memoryRepo = new DrizzleMemoryRepository(db);
    embeddingRepo = new DrizzleMemoryEmbeddingRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("crea un embedding de 1024 dimensiones y lo recupera por memoryId", async () => {
    const memory = await memoryRepo.create(buildMemory());
    const embedding = buildEmbedding(memory.id);

    const created = await embeddingRepo.create(embedding);
    expect(created.dimensions).toBe(DIMENSIONS);
    expect(created.embedding).toHaveLength(DIMENSIONS);
    expect(created.provider).toBe("ollama");
    expect(created.model).toBe("qwen3-embedding:4b");

    const found = await embeddingRepo.findByMemoryId(memory.id);
    expect(found).toHaveLength(1);
    expect(found[0]?.embedding).toHaveLength(DIMENSIONS);
    // round-trip: los valores vuelven (casi) exactos — pgvector usa float4
    // internamente, así que se tolera el margen de precisión float4 vs
    // float8, no se exige igualdad bit-exacta como en confidence/importance.
    for (let i = 0; i < DIMENSIONS; i++) {
      expect(found[0]?.embedding[i]).toBeCloseTo(embedding.embedding[i] ?? 0, 4);
    }
  });

  it("una memoria puede tener más de un embedding (coexistencia de providers/modelos)", async () => {
    const memory = await memoryRepo.create(buildMemory());
    await embeddingRepo.create(buildEmbedding(memory.id, { embedding: fakeVector(2) }));
    await embeddingRepo.create(buildEmbedding(memory.id, { embedding: fakeVector(3) }));

    const found = await embeddingRepo.findByMemoryId(memory.id);
    expect(found).toHaveLength(2);
  });

  it("deleteByMemoryId borra todos los embeddings de esa memoria", async () => {
    const memory = await memoryRepo.create(buildMemory());
    await embeddingRepo.create(buildEmbedding(memory.id));

    await embeddingRepo.deleteByMemoryId(memory.id);

    const found = await embeddingRepo.findByMemoryId(memory.id);
    expect(found).toHaveLength(0);
  });

  it("borrar la memoria borra en cascada su embedding (ON DELETE CASCADE)", async () => {
    const memory = await memoryRepo.create(buildMemory());
    await embeddingRepo.create(buildEmbedding(memory.id));

    await pool.query("DELETE FROM memories WHERE id = $1", [memory.id]);

    const found = await embeddingRepo.findByMemoryId(memory.id);
    expect(found).toHaveLength(0);
  });

  describe("integridad (constraints de PostgreSQL — defensa en profundidad)", () => {
    it("rechaza un vector con una dimensión distinta de 1024", async () => {
      const memory = await memoryRepo.create(buildMemory());
      const embedding = buildEmbedding(memory.id, { embedding: fakeVector(4, 512) });

      await expect(embeddingRepo.create(embedding)).rejects.toThrow();
    });

    it("rechaza un provider fuera de la lista permitida", async () => {
      const memory = await memoryRepo.create(buildMemory());
      const embedding = buildEmbedding(memory.id, { provider: "openai" });

      await expect(embeddingRepo.create(embedding)).rejects.toThrow();
    });

    it("rechaza memory_id inexistente", async () => {
      const embedding = buildEmbedding(randomUUID());

      await expect(embeddingRepo.create(embedding)).rejects.toThrow();
    });
  });
});
