import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Memory, MemoryCandidate, MemoryRelation, MemorySource } from "@guerrero-dev/domain";
import type { IMemoryRelationRepository } from "../../common/ports/IMemoryRelationRepository.js";
import type { IMemoryRepository } from "../../common/ports/IMemoryRepository.js";
import type { IMemorySourceRepository } from "../../common/ports/IMemorySourceRepository.js";
import type { MemoryEvaluation } from "../models/MemoryEvaluation.js";
import type {
  IMemoryPromotionUnitOfWork,
  MemoryPromotionRepositories,
} from "../ports/IMemoryPromotionUnitOfWork.js";
import { MemoryCandidatePromoter } from "./MemoryCandidatePromoter.js";

function buildCandidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
  return {
    type: "fact",
    scope: "global",
    projectId: null,
    content: "Miller utiliza PostgreSQL.",
    confidence: 0.8,
    importance: 0.6,
    source: { sourceType: "conversation", sourceReference: "chat-1" },
    ...overrides,
  };
}

function buildEvaluation(overrides: Partial<MemoryEvaluation> = {}): MemoryEvaluation {
  return {
    accepted: true,
    confidence: 0.8,
    importance: 0.6,
    duplicateOf: null,
    conflictsWith: [],
    reason: "test",
    ...overrides,
  };
}

function buildMemory(overrides: Partial<Memory> = {}): Memory {
  const now = new Date();
  return {
    id: randomUUID(),
    projectId: null,
    scope: "global",
    type: "fact",
    content: "Memoria existente.",
    status: "active",
    confidence: 0.5,
    importance: 0.5,
    createdAt: now,
    updatedAt: now,
    lastVerifiedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

/**
 * Fake in-memory de los tres repositorios + un `IMemoryPromotionUnitOfWork`
 * que simplemente los expone sin transacción real — suficiente para
 * testear la lógica de `MemoryCandidatePromoter` sin PostgreSQL. La
 * atomicidad real se prueba en
 * tests/integration/memory-promotion-unit-of-work.test.ts.
 */
function fakeUnitOfWork(existingMemories: readonly Memory[] = []) {
  const memories = new Map(existingMemories.map((m) => [m.id, m]));
  const sources: MemorySource[] = [];
  const relations: MemoryRelation[] = [];

  const memoryRepository: IMemoryRepository = {
    create: async (memory) => {
      memories.set(memory.id, memory);
      return memory;
    },
    findById: async (id) => memories.get(id) ?? null,
    update: async (memory) => {
      if (!memories.has(memory.id)) throw new Error(`No existe memory ${memory.id}`);
      memories.set(memory.id, memory);
      return memory;
    },
    findByProject: async (projectId) => [...memories.values()].filter((m) => m.projectId === projectId),
    invalidate: async () => undefined,
  };

  const memorySourceRepository: IMemorySourceRepository = {
    add: async (source) => {
      sources.push(source);
      return source;
    },
    findByMemory: async (memoryId) => sources.filter((s) => s.memoryId === memoryId),
  };

  const memoryRelationRepository: IMemoryRelationRepository = {
    create: async (relation) => {
      relations.push(relation);
      return relation;
    },
    findForMemory: async (memoryId) =>
      relations.filter((r) => r.sourceMemoryId === memoryId || r.targetMemoryId === memoryId),
  };

  const repositories: MemoryPromotionRepositories = {
    memoryRepository,
    memorySourceRepository,
    memoryRelationRepository,
  };

  const unitOfWork: IMemoryPromotionUnitOfWork = {
    runInTransaction: async (work) => work(repositories),
  };

  return { unitOfWork, memories, sources, relations };
}

describe("MemoryCandidatePromoter", () => {
  it("rejected sin duplicado ni conflicto: no persiste nada", async () => {
    const { unitOfWork, memories, sources, relations } = fakeUnitOfWork();
    const promoter = new MemoryCandidatePromoter(unitOfWork);

    const result = await promoter.promote(buildCandidate(), buildEvaluation({ accepted: false }));

    expect(result).toEqual({ action: "rejected", memoryId: null, conflictRelationsCreated: [] });
    expect(memories.size).toBe(0);
    expect(sources).toHaveLength(0);
    expect(relations).toHaveLength(0);
  });

  it("rejected CON conflicto: no crea Memory ni Relation (no hay sourceMemoryId válido)", async () => {
    const { unitOfWork, memories, sources, relations } = fakeUnitOfWork();
    const promoter = new MemoryCandidatePromoter(unitOfWork);

    const result = await promoter.promote(
      buildCandidate(),
      buildEvaluation({ accepted: false, conflictsWith: ["mem-a"] }),
    );

    expect(result).toEqual({ action: "rejected", memoryId: null, conflictRelationsCreated: [] });
    expect(memories.size).toBe(0);
    expect(sources).toHaveLength(0);
    expect(relations).toHaveLength(0);
  });

  it("accepted sin duplicado: crea Memory + Source", async () => {
    const { unitOfWork, memories, sources } = fakeUnitOfWork();
    const promoter = new MemoryCandidatePromoter(unitOfWork);

    const candidate = buildCandidate({ content: "Miller usa arquitectura modular." });
    const result = await promoter.promote(candidate, buildEvaluation());

    expect(result.action).toBe("created");
    expect(result.memoryId).not.toBeNull();
    expect(result.conflictRelationsCreated).toEqual([]);

    const memory = memories.get(result.memoryId ?? "");
    expect(memory?.content).toBe("Miller usa arquitectura modular.");
    expect(memory?.status).toBe("active");

    expect(sources).toHaveLength(1);
    expect(sources[0]?.memoryId).toBe(result.memoryId);
  });

  it("duplicate: actualiza la Memory existente en vez de crear una nueva, sin importar el score", async () => {
    const existing = buildMemory({ id: "mem-existing", confidence: 0.3, importance: 0.3 });
    const { unitOfWork, memories, sources } = fakeUnitOfWork([existing]);
    const promoter = new MemoryCandidatePromoter(unitOfWork);

    // accepted: false a propósito -- duplicateOf debe ganar de todos modos.
    const result = await promoter.promote(
      buildCandidate(),
      buildEvaluation({ accepted: false, duplicateOf: "mem-existing", confidence: 0.95, importance: 0.9 }),
    );

    expect(result.action).toBe("updated");
    expect(result.memoryId).toBe("mem-existing");
    expect(memories.size).toBe(1); // no se creó una segunda memoria

    const updated = memories.get("mem-existing");
    expect(updated?.confidence).toBe(0.95);
    expect(updated?.importance).toBe(0.9);
    expect(updated?.lastVerifiedAt).not.toBeNull();

    expect(sources).toHaveLength(1);
    expect(sources[0]?.memoryId).toBe("mem-existing");
  });

  it("accepted + conflict: crea Memory + Source + Relation(contradicts)", async () => {
    const { unitOfWork, memories, relations } = fakeUnitOfWork();
    const promoter = new MemoryCandidatePromoter(unitOfWork);

    const result = await promoter.promote(
      buildCandidate(),
      buildEvaluation({ conflictsWith: ["mem-conflict"] }),
    );

    expect(result.action).toBe("created");
    expect(result.conflictRelationsCreated).toEqual(["mem-conflict"]);

    expect(relations).toHaveLength(1);
    expect(relations[0]?.sourceMemoryId).toBe(result.memoryId);
    expect(relations[0]?.targetMemoryId).toBe("mem-conflict");
    expect(relations[0]?.relationType).toBe("contradicts");
    expect(memories.size).toBe(1);
  });

  it("duplicate + conflict: actualiza la Memory duplicada Y crea la Relation de conflicto", async () => {
    const existing = buildMemory({ id: "mem-existing" });
    const { unitOfWork, memories, relations } = fakeUnitOfWork([existing]);
    const promoter = new MemoryCandidatePromoter(unitOfWork);

    const result = await promoter.promote(
      buildCandidate(),
      buildEvaluation({ duplicateOf: "mem-existing", conflictsWith: ["mem-conflict-a", "mem-conflict-b"] }),
    );

    expect(result.action).toBe("updated");
    expect(result.memoryId).toBe("mem-existing");
    expect(result.conflictRelationsCreated).toEqual(["mem-conflict-a", "mem-conflict-b"]);
    expect(memories.size).toBe(1);

    expect(relations).toHaveLength(2);
    expect(relations.every((r) => r.sourceMemoryId === "mem-existing")).toBe(true);
    expect(relations.map((r) => r.targetMemoryId)).toEqual(["mem-conflict-a", "mem-conflict-b"]);
  });

  it("lanza si duplicateOf apunta a una memoria que no existe en el repositorio", async () => {
    const { unitOfWork } = fakeUnitOfWork();
    const promoter = new MemoryCandidatePromoter(unitOfWork);

    await expect(
      promoter.promote(buildCandidate(), buildEvaluation({ duplicateOf: "no-existe" })),
    ).rejects.toThrow(/no existe/i);
  });

  it("preserva sourceType/sourceReference/excerpt/metadata del candidato en la Source creada", async () => {
    const { unitOfWork, sources } = fakeUnitOfWork();
    const promoter = new MemoryCandidatePromoter(unitOfWork);

    const candidate = buildCandidate({
      source: {
        sourceType: "file",
        sourceReference: "src/auth/RefreshTokenRepository.ts",
        excerpt: "export class RefreshTokenRepository",
        metadata: { lineStart: 1, lineEnd: 10 },
      },
    });
    await promoter.promote(candidate, buildEvaluation());

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      sourceType: "file",
      sourceReference: "src/auth/RefreshTokenRepository.ts",
      excerpt: "export class RefreshTokenRepository",
      metadata: { lineStart: 1, lineEnd: 10 },
    });
  });
});
