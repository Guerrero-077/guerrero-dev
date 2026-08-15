import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Memory } from "@guerrero-dev/domain";
import {
  createDrizzleClient,
  createPostgresPool,
  DrizzleMemoryCandidateRetriever,
  DrizzleMemoryEmbeddingRepository,
  DrizzleMemoryRepository,
  DrizzleProjectRepository,
  loadConfig,
  runMigrations,
  type PgPool,
} from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 4.6): PostgreSQL + pgvector reales, sin mocks.
 * Se salta si RUN_INTEGRATION_TESTS no está en "true" (mismo patrón que el
 * resto de tests/integration). No depende de Ollama: los vectores son
 * deterministas, construidos para tener una similitud coseno *exacta y
 * conocida* contra un vector de consulta fijo — así se puede asertar el
 * orden y (dentro de la tolerancia de float4 de pgvector) el valor de
 * `semanticSimilarity`, no solo que "algo volvió".
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

const DIMENSIONS = 1024;

/**
 * Vector unitario en el plano generado por e0/e1 con similitud coseno
 * EXACTA `alpha` contra e0 = [1,0,0,...,0]: v = alpha*e0 + sqrt(1-alpha²)*e1.
 * Como |v| = 1 y |e0| = 1, v·e0 = alpha = cos(ángulo) = similitud coseno.
 */
function vectorWithSimilarityToE0(alpha: number, dimensions = DIMENSIONS): number[] {
  const v = new Array(dimensions).fill(0) as number[];
  v[0] = alpha;
  v[1] = Math.sqrt(Math.max(0, 1 - alpha * alpha));
  return v;
}

const QUERY_VECTOR = vectorWithSimilarityToE0(1); // e0 exacto

function buildMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date();
  return {
    id: randomUUID(),
    projectId: null,
    scope: "global",
    type: "fact",
    content: "Memoria de prueba para candidate retrieval.",
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

describe.skipIf(!RUN)("DrizzleMemoryCandidateRetriever (integration)", () => {
  let pool: PgPool;
  let memoryRepo: DrizzleMemoryRepository;
  let embeddingRepo: DrizzleMemoryEmbeddingRepository;
  let candidateRetriever: DrizzleMemoryCandidateRetriever;

  async function createMemoryWithEmbedding(alpha: number, overrides: Partial<Memory> = {}): Promise<Memory> {
    const memory = await memoryRepo.create(buildMemory(overrides));
    await embeddingRepo.create({
      id: randomUUID(),
      memoryId: memory.id,
      embedding: vectorWithSimilarityToE0(alpha),
      provider: "ollama",
      model: "qwen3-embedding:4b",
      dimensions: DIMENSIONS,
      createdAt: new Date(),
    });
    return memory;
  }

  beforeAll(async () => {
    const config = loadConfig();
    pool = createPostgresPool(config);
    await runMigrations(pool);
    const db = createDrizzleClient(pool);
    memoryRepo = new DrizzleMemoryRepository(db);
    embeddingRepo = new DrizzleMemoryEmbeddingRepository(db);
    candidateRetriever = new DrizzleMemoryCandidateRetriever(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("ordena candidatos por similitud coseno descendente, con semanticSimilarity ≈ alpha", async () => {
    const low = await createMemoryWithEmbedding(0.1, { content: "low" });
    const high = await createMemoryWithEmbedding(0.95, { content: "high" });
    const mid = await createMemoryWithEmbedding(0.5, { content: "mid" });

    const candidates = await candidateRetriever.findCandidates({ embedding: QUERY_VECTOR, limit: 10 });

    const byId = new Map(candidates.map((c) => [c.memory.id, c]));
    expect(byId.get(high.id)?.semanticSimilarity).toBeCloseTo(0.95, 2);
    expect(byId.get(mid.id)?.semanticSimilarity).toBeCloseTo(0.5, 2);
    expect(byId.get(low.id)?.semanticSimilarity).toBeCloseTo(0.1, 2);

    const ids = candidates.map((c) => c.memory.id);
    const highIdx = ids.indexOf(high.id);
    const midIdx = ids.indexOf(mid.id);
    const lowIdx = ids.indexOf(low.id);
    expect(highIdx).toBeLessThan(midIdx);
    expect(midIdx).toBeLessThan(lowIdx);
  });

  it("respeta el limit pedido", async () => {
    await createMemoryWithEmbedding(0.9, { content: "a" });
    await createMemoryWithEmbedding(0.8, { content: "b" });
    await createMemoryWithEmbedding(0.7, { content: "c" });

    const candidates = await candidateRetriever.findCandidates({ embedding: QUERY_VECTOR, limit: 2 });
    expect(candidates).toHaveLength(2);
  });

  it("con projectId filtra en SQL: solo trae memorias de ese proyecto", async () => {
    const projectRepo = new DrizzleProjectRepository(createDrizzleClient(pool));
    const now = new Date();
    const project = await projectRepo.create({
      id: randomUUID(),
      name: "candidate-retriever-test",
      path: `/tmp/guerrero-candidate-retriever-test-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    });

    const inProject = await createMemoryWithEmbedding(0.99, {
      scope: "project",
      projectId: project.id,
      content: "dentro del proyecto",
    });
    await createMemoryWithEmbedding(0.99, {
      scope: "global",
      projectId: null,
      content: "fuera del proyecto",
    });

    const candidates = await candidateRetriever.findCandidates({
      embedding: QUERY_VECTOR,
      projectId: project.id,
      limit: 10,
    });

    expect(candidates.every((c) => c.memory.projectId === project.id)).toBe(true);
    expect(candidates.some((c) => c.memory.id === inProject.id)).toBe(true);
  });

  it("memorias sin embedding no aparecen como candidatas", async () => {
    const withoutEmbedding = await memoryRepo.create(buildMemory({ content: "sin embedding" }));

    const candidates = await candidateRetriever.findCandidates({ embedding: QUERY_VECTOR, limit: 50 });

    expect(candidates.some((c) => c.memory.id === withoutEmbedding.id)).toBe(false);
  });
});
