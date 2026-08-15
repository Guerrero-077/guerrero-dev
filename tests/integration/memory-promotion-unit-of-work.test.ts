import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Memory, MemoryRelation, MemorySource } from "@guerrero-dev/domain";
import {
  createDrizzleClient,
  createPostgresPool,
  DrizzleMemoryPromotionUnitOfWork,
  DrizzleMemoryRepository,
  loadConfig,
  runMigrations,
  type PgPool,
} from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 4.7): confirma que `DrizzleMemoryPromotionUnitOfWork`
 * es realmente atómico contra PostgreSQL — el caso que motivó introducir
 * este puerto (`Memory` + `MemorySource` + `MemoryRelation` deben
 * persistirse las tres o ninguna). Se salta si RUN_INTEGRATION_TESTS no
 * está en "true" (mismo patrón que el resto de tests/integration/).
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

function buildMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date();
  return {
    id: randomUUID(),
    projectId: null,
    scope: "global",
    type: "fact",
    content: "Memoria de prueba del unit of work.",
    status: "active",
    confidence: 0.8,
    importance: 0.5,
    createdAt: now,
    updatedAt: now,
    lastVerifiedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

describe.skipIf(!RUN)("DrizzleMemoryPromotionUnitOfWork (integration)", () => {
  let pool: PgPool;
  let unitOfWork: DrizzleMemoryPromotionUnitOfWork;
  let plainMemoryRepo: DrizzleMemoryRepository;

  beforeAll(async () => {
    const config = loadConfig();
    pool = createPostgresPool(config);
    await runMigrations(pool);
    const db = createDrizzleClient(pool);
    unitOfWork = new DrizzleMemoryPromotionUnitOfWork(db);
    plainMemoryRepo = new DrizzleMemoryRepository(db);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("hace commit de Memory + Source + Relation cuando las tres operaciones tienen éxito", async () => {
    const other = await plainMemoryRepo.create(
      buildMemory({ content: "Memoria existente para la relación." }),
    );

    const memoryId = randomUUID();
    const result = await unitOfWork.runInTransaction(
      async ({ memoryRepository, memorySourceRepository, memoryRelationRepository }) => {
        const memory = await memoryRepository.create(
          buildMemory({ id: memoryId, content: "Candidato promovido con éxito." }),
        );

        const source: MemorySource = {
          id: randomUUID(),
          memoryId: memory.id,
          sourceType: "conversation",
          sourceReference: "chat-uow-1",
          excerpt: null,
          metadata: {},
          createdAt: new Date(),
        };
        await memorySourceRepository.add(source);

        const relation: MemoryRelation = {
          id: randomUUID(),
          sourceMemoryId: memory.id,
          targetMemoryId: other.id,
          relationType: "contradicts",
          confidence: 0.7,
          createdAt: new Date(),
        };
        await memoryRelationRepository.create(relation);

        return memory.id;
      },
    );

    expect(result).toBe(memoryId);

    const persisted = await plainMemoryRepo.findById(memoryId);
    expect(persisted?.content).toBe("Candidato promovido con éxito.");
  });

  it("revierte Memory + Source si la creación de la Relation falla (ROLLBACK real)", async () => {
    const memoryId = randomUUID();

    await expect(
      unitOfWork.runInTransaction(
        async ({ memoryRepository, memorySourceRepository, memoryRelationRepository }) => {
          const memory = await memoryRepository.create(
            buildMemory({ id: memoryId, content: "Candidato que NO debería quedar persistido." }),
          );

          const source: MemorySource = {
            id: randomUUID(),
            memoryId: memory.id,
            sourceType: "conversation",
            sourceReference: "chat-uow-rollback",
            excerpt: null,
            metadata: {},
            createdAt: new Date(),
          };
          await memorySourceRepository.add(source);

          // Relación de una memoria consigo misma: viola el CHECK
          // constraint de memory_relations (confirmado en
          // memory-repository.test.ts) — fuerza el fallo del paso 3.
          const invalidRelation: MemoryRelation = {
            id: randomUUID(),
            sourceMemoryId: memory.id,
            targetMemoryId: memory.id,
            relationType: "contradicts",
            confidence: 0.7,
            createdAt: new Date(),
          };
          await memoryRelationRepository.create(invalidRelation);
        },
      ),
    ).rejects.toThrow();

    // Si el UnitOfWork es realmente atómico, ni la Memory ni la Source
    // quedaron persistidas — a pesar de que sus INSERT individuales, vistos
    // aislados, habrían tenido éxito.
    const persisted = await plainMemoryRepo.findById(memoryId);
    expect(persisted).toBeNull();
  });
});
