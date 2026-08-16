import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Embedding, Memory, MemoryCandidate } from "@guerrero-dev/domain";
import type { IEmbeddingProvider } from "../../common/ports/IEmbeddingProvider.js";
import type { MemorySearchCandidate } from "../models/MemorySearchCandidate.js";
import type { MemorySemanticQuery } from "../models/MemorySemanticQuery.js";
import type { IMemoryCandidateRetriever } from "../ports/IMemoryCandidateRetriever.js";
import { MemoryCandidateDeduplicator } from "./MemoryCandidateDeduplicator.js";

const NOW = new Date("2026-08-15T00:00:00.000Z");

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

function buildMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: randomUUID(),
    projectId: null,
    scope: "global",
    type: "fact",
    content: "Memoria existente.",
    status: "active",
    confidence: 0.5,
    importance: 0.5,
    createdAt: NOW,
    updatedAt: NOW,
    lastVerifiedAt: null,
    expiresAt: null,
    ...overrides,
  };
}

function buildSearchCandidate(overrides: Partial<MemorySearchCandidate> = {}): MemorySearchCandidate {
  return {
    memory: buildMemory(),
    semanticSimilarity: 0.5,
    ...overrides,
  };
}

function fakeEmbeddingProvider(vector: readonly number[] = [1, 0, 0]): IEmbeddingProvider {
  return {
    model: "fake-model",
    dimensions: vector.length,
    embed: vi.fn(async (): Promise<Embedding> => ({
      values: vector,
      model: "fake-model",
      dimensions: vector.length,
    })),
    embedBatch: vi.fn(async () => []),
  };
}

function fakeCandidateRetriever(candidates: readonly MemorySearchCandidate[]) {
  const findCandidates = vi.fn(async (_query: MemorySemanticQuery) => candidates);
  const retriever: IMemoryCandidateRetriever = { findCandidates };
  return { retriever, findCandidates };
}

describe("MemoryCandidateDeduplicator", () => {
  it("devuelve null cuando el pool está vacío", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const { retriever } = fakeCandidateRetriever([]);
    const deduplicator = new MemoryCandidateDeduplicator(embeddingProvider, retriever);

    const result = await deduplicator.findDuplicate(buildCandidate());

    expect(result).toBeNull();
  });

  it("devuelve null cuando la mejor coincidencia del mismo type está por debajo del umbral", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const memoryId = randomUUID();
    const { retriever } = fakeCandidateRetriever([
      buildSearchCandidate({ memory: buildMemory({ id: memoryId, type: "fact" }), semanticSimilarity: 0.85 }),
    ]);
    const deduplicator = new MemoryCandidateDeduplicator(embeddingProvider, retriever);

    const result = await deduplicator.findDuplicate(buildCandidate({ type: "fact" }));

    expect(result).toBeNull();
  });

  it("devuelve el match cuando la similitud iguala o supera el umbral por defecto (0.90)", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const memoryId = randomUUID();
    const { retriever } = fakeCandidateRetriever([
      buildSearchCandidate({ memory: buildMemory({ id: memoryId, type: "fact" }), semanticSimilarity: 0.9 }),
    ]);
    const deduplicator = new MemoryCandidateDeduplicator(embeddingProvider, retriever);

    const result = await deduplicator.findDuplicate(buildCandidate({ type: "fact" }));

    expect(result).toEqual({ memoryId, similarity: 0.9 });
  });

  it("ignora candidatos de otro type aunque tengan mayor similitud", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const factMemoryId = randomUUID();
    const { retriever } = fakeCandidateRetriever([
      // El más parecido es una "decision", no cuenta como duplicado de un "fact".
      buildSearchCandidate({ memory: buildMemory({ type: "decision" }), semanticSimilarity: 0.99 }),
      buildSearchCandidate({ memory: buildMemory({ id: factMemoryId, type: "fact" }), semanticSimilarity: 0.92 }),
    ]);
    const deduplicator = new MemoryCandidateDeduplicator(embeddingProvider, retriever);

    const result = await deduplicator.findDuplicate(buildCandidate({ type: "fact" }));

    expect(result).toEqual({ memoryId: factMemoryId, similarity: 0.92 });
  });

  it("respeta un similarityThreshold inyectado por opciones", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const memoryId = randomUUID();
    const { retriever } = fakeCandidateRetriever([
      buildSearchCandidate({ memory: buildMemory({ id: memoryId, type: "fact" }), semanticSimilarity: 0.8 }),
    ]);
    const deduplicator = new MemoryCandidateDeduplicator(embeddingProvider, retriever, {
      similarityThreshold: 0.75,
    });

    const result = await deduplicator.findDuplicate(buildCandidate({ type: "fact" }));

    expect(result).toEqual({ memoryId, similarity: 0.8 });
  });

  it("pasa projectId al candidate retriever cuando el candidato tiene uno", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const { retriever, findCandidates } = fakeCandidateRetriever([]);
    const deduplicator = new MemoryCandidateDeduplicator(embeddingProvider, retriever);

    await deduplicator.findDuplicate(
      buildCandidate({ scope: "project", projectId: "project-1" }),
    );

    expect(findCandidates.mock.calls[0]?.[0]?.projectId).toBe("project-1");
  });

  it("no pasa projectId al candidate retriever cuando el candidato es global", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const { retriever, findCandidates } = fakeCandidateRetriever([]);
    const deduplicator = new MemoryCandidateDeduplicator(embeddingProvider, retriever);

    await deduplicator.findDuplicate(buildCandidate({ scope: "global", projectId: null }));

    expect(findCandidates.mock.calls[0]?.[0]?.projectId).toBeUndefined();
  });

  it("embebe candidate.content, no candidate completo", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const { retriever } = fakeCandidateRetriever([]);
    const deduplicator = new MemoryCandidateDeduplicator(embeddingProvider, retriever);
    const candidate = buildCandidate({ content: "Miller utiliza PostgreSQL." });

    await deduplicator.findDuplicate(candidate);

    expect(embeddingProvider.embed).toHaveBeenCalledWith("Miller utiliza PostgreSQL.");
  });
});
