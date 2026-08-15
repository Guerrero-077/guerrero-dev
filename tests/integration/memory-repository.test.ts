import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Memory, MemoryRelation, MemorySource } from "@guerrero-dev/domain";
import {
  createDrizzleClient,
  createPostgresPool,
  DrizzleMemoryRelationRepository,
  DrizzleMemoryRepository,
  DrizzleMemorySourceRepository,
  DrizzleProjectRepository,
  loadConfig,
  runMigrations,
  type PgPool,
} from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 4.3): PostgreSQL real, sin mocks, a través de
 * Drizzle. Se salta si RUN_INTEGRATION_TESTS no está en "true" (mismo
 * patrón que tests/integration/project-repository.test.ts).
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

function buildMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date();
  return {
    id: randomUUID(),
    projectId: null,
    scope: "global",
    type: "fact",
    content: "Prefiere soluciones desacopladas.",
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

describe.skipIf(!RUN)("Memory Engine persistence (integration)", () => {
  let pool: PgPool;
  let memoryRepo: DrizzleMemoryRepository;
  let sourceRepo: DrizzleMemorySourceRepository;
  let relationRepo: DrizzleMemoryRelationRepository;
  let projectId: string;

  beforeAll(async () => {
    const config = loadConfig();
    pool = createPostgresPool(config);
    await runMigrations(pool);
    const db = createDrizzleClient(pool);
    memoryRepo = new DrizzleMemoryRepository(db);
    sourceRepo = new DrizzleMemorySourceRepository(db);
    relationRepo = new DrizzleMemoryRelationRepository(db);

    const projectRepo = new DrizzleProjectRepository(db);
    const now = new Date();
    const project = await projectRepo.create({
      id: randomUUID(),
      name: "memory-engine-test",
      path: `/tmp/guerrero-memory-test-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  describe("persistencia básica", () => {
    it("crea, lee, actualiza e invalida una memoria", async () => {
      const memory = buildMemory({ projectId, scope: "project", content: "Miller utiliza PostgreSQL." });
      const created = await memoryRepo.create(memory);
      expect(created.id).toBe(memory.id);

      const found = await memoryRepo.findById(created.id);
      expect(found?.content).toBe("Miller utiliza PostgreSQL.");

      const updated = await memoryRepo.update({ ...created, content: "Miller utiliza PostgreSQL 16." });
      expect(updated.content).toBe("Miller utiliza PostgreSQL 16.");

      await memoryRepo.invalidate(created.id, "reemplazada por evidencia más reciente");
      const invalidated = await memoryRepo.findById(created.id);
      expect(invalidated?.status).toBe("invalidated");
    });

    it("findById devuelve null si la memoria no existe", async () => {
      const found = await memoryRepo.findById("00000000-0000-0000-0000-000000000000");
      expect(found).toBeNull();
    });
  });

  describe("scope", () => {
    it("persiste una memoria global (projectId null)", async () => {
      const memory = buildMemory({
        scope: "global",
        projectId: null,
        content: "Prefiere interfaces para desacoplar infraestructura.",
      });
      const created = await memoryRepo.create(memory);
      expect(created.projectId).toBeNull();
    });

    it("persiste una memoria de proyecto y aparece en findByProject", async () => {
      const memory = buildMemory({
        scope: "project",
        projectId,
        content: "Miller usa arquitectura modular.",
      });
      await memoryRepo.create(memory);

      const projectMemories = await memoryRepo.findByProject(projectId);
      expect(projectMemories.some((m) => m.id === memory.id)).toBe(true);
    });
  });

  describe("integridad (constraints de PostgreSQL — defensa en profundidad)", () => {
    it("rechaza confidence fuera de 0..1", async () => {
      const memory = buildMemory({ confidence: 1.5 });
      await expect(memoryRepo.create(memory)).rejects.toThrow();
    });

    it("rechaza importance fuera de 0..1", async () => {
      const memory = buildMemory({ importance: -0.1 });
      await expect(memoryRepo.create(memory)).rejects.toThrow();
    });

    it("rechaza project_id inexistente", async () => {
      const memory = buildMemory({ scope: "project", projectId: randomUUID() });
      await expect(memoryRepo.create(memory)).rejects.toThrow();
    });
  });

  describe("sources", () => {
    it("adjunta una fuente con metadata JSONB", async () => {
      const memory = await memoryRepo.create(
        buildMemory({ content: "Usa JWT con refresh tokens rotativos." }),
      );

      const source: MemorySource = {
        id: randomUUID(),
        memoryId: memory.id,
        sourceType: "file",
        sourceReference: "src/auth/RefreshTokenRepository.ts",
        excerpt: null,
        metadata: { lineStart: 42, lineEnd: 71 },
        createdAt: new Date(),
      };
      const created = await sourceRepo.add(source);
      expect(created.metadata).toEqual({ lineStart: 42, lineEnd: 71 });

      const sources = await sourceRepo.findByMemory(memory.id);
      expect(sources).toHaveLength(1);
      expect(sources[0]?.sourceReference).toBe("src/auth/RefreshTokenRepository.ts");
    });
  });

  describe("relations", () => {
    it("persiste una relación entre dos memorias, consultable desde ambos lados", async () => {
      const a = await memoryRepo.create(buildMemory({ content: "Miller utiliza PostgreSQL." }));
      const b = await memoryRepo.create(buildMemory({ content: "Miller utiliza SQL Server." }));

      const relation: MemoryRelation = {
        id: randomUUID(),
        sourceMemoryId: a.id,
        targetMemoryId: b.id,
        relationType: "supersedes",
        confidence: 0.8,
        createdAt: new Date(),
      };
      const created = await relationRepo.create(relation);
      expect(created.relationType).toBe("supersedes");

      const forA = await relationRepo.findForMemory(a.id);
      expect(forA.some((r) => r.id === created.id)).toBe(true);

      const forB = await relationRepo.findForMemory(b.id);
      expect(forB.some((r) => r.id === created.id)).toBe(true);
    });

    it("rechaza una relación de una memoria consigo misma", async () => {
      const memory = await memoryRepo.create(buildMemory({ content: "Autorelación inválida." }));
      const relation: MemoryRelation = {
        id: randomUUID(),
        sourceMemoryId: memory.id,
        targetMemoryId: memory.id,
        relationType: "contradicts",
        confidence: 0.5,
        createdAt: new Date(),
      };
      await expect(relationRepo.create(relation)).rejects.toThrow();
    });
  });

  describe("round-trip sin pérdida de información (Fase 4.3 §18)", () => {
    it("confidence, importance y lastVerifiedAt vuelven exactamente iguales", async () => {
      const lastVerifiedAt = new Date("2026-08-15T10:30:00.000Z");
      const memory = buildMemory({
        confidence: 0.87,
        importance: 0.73,
        lastVerifiedAt,
        content: "Test de precisión numérica.",
      });

      const created = await memoryRepo.create(memory);
      expect(created.confidence).toBe(0.87);
      expect(created.importance).toBe(0.73);
      expect(created.lastVerifiedAt?.toISOString()).toBe(lastVerifiedAt.toISOString());

      const found = await memoryRepo.findById(created.id);
      expect(found?.confidence).toBe(0.87);
      expect(found?.importance).toBe(0.73);
      expect(found?.lastVerifiedAt?.toISOString()).toBe(lastVerifiedAt.toISOString());
    });
  });
});
