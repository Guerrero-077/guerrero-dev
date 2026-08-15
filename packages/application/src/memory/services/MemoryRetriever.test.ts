import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { Embedding, Memory } from "@guerrero-dev/domain";
import type { IEmbeddingProvider } from "../../common/ports/IEmbeddingProvider.js";
import {
  DEFAULT_GLOBAL_RANKING_WEIGHTS,
  DEFAULT_PROJECT_RANKING_WEIGHTS,
} from "../models/MemoryRankingWeights.js";
import type { MemoryRankingContext } from "../models/MemoryRankingContext.js";
import type { MemorySearchCandidate } from "../models/MemorySearchCandidate.js";
import type { MemorySearchQuery } from "../models/MemorySearchQuery.js";
import type { MemorySearchResult } from "../models/MemorySearchResult.js";
import type { MemorySemanticQuery } from "../models/MemorySemanticQuery.js";
import type { IMemoryCandidateRetriever } from "../ports/IMemoryCandidateRetriever.js";
import type { IMemoryRanker } from "../ports/IMemoryRanker.js";
import { MemoryRetriever } from "./MemoryRetriever.js";

const NOW = new Date("2026-08-15T00:00:00.000Z");

function buildMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: randomUUID(),
    projectId: null,
    scope: "global",
    type: "fact",
    content: "Memoria de prueba.",
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

function buildCandidate(overrides: Partial<MemorySearchCandidate> = {}): MemorySearchCandidate {
  return {
    memory: buildMemory(),
    semanticSimilarity: 0.5,
    ...overrides,
  };
}

/** Fake mínimo de IEmbeddingProvider: embed() devuelve un vector fijo, embedBatch no se usa acá. */
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

/** Fake de IMemoryCandidateRetriever: devuelve los candidatos fijos que se le pasen, capturando el query recibido. */
function fakeCandidateRetriever(candidates: readonly MemorySearchCandidate[]) {
  const findCandidates = vi.fn(async (_query: MemorySemanticQuery) => candidates);
  const retriever: IMemoryCandidateRetriever = { findCandidates };
  return { retriever, findCandidates };
}

/** Fake de IMemoryRanker: "rankea" devolviendo los candidatos en el mismo orden con score = semanticSimilarity, capturando lo recibido. */
function fakeRanker() {
  const rank = vi.fn((candidates: readonly MemorySearchCandidate[], _context: MemoryRankingContext) =>
    candidates.map((c): MemorySearchResult => ({
      memory: c.memory,
      score: c.semanticSimilarity,
      reasons: [],
    })),
  );
  const ranker: IMemoryRanker = { rank };
  return { ranker, rank };
}

describe("MemoryRetriever", () => {
  it("convierte query.text a embedding y lo pasa al candidate retriever", async () => {
    const vector = [0.1, 0.2, 0.3];
    const embeddingProvider = fakeEmbeddingProvider(vector);
    const { retriever: candidateRetriever, findCandidates } = fakeCandidateRetriever([]);
    const { ranker } = fakeRanker();

    const memoryRetriever = new MemoryRetriever(embeddingProvider, candidateRetriever, ranker);
    const query: MemorySearchQuery = { text: "¿cómo revocamos refresh tokens?" };
    await memoryRetriever.search(query);

    expect(embeddingProvider.embed).toHaveBeenCalledWith(query.text);
    expect(findCandidates.mock.calls[0]?.[0]?.embedding).toEqual(vector);
  });

  it("candidateLimit por defecto es max(topK*10, 50)", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const { retriever: candidateRetriever, findCandidates } = fakeCandidateRetriever([]);
    const { ranker } = fakeRanker();
    const memoryRetriever = new MemoryRetriever(embeddingProvider, candidateRetriever, ranker);

    await memoryRetriever.search({ text: "q", limit: 5 });
    expect(findCandidates.mock.calls[0]?.[0]?.limit).toBe(50); // max(5*10, 50)

    await memoryRetriever.search({ text: "q", limit: 20 });
    expect(findCandidates.mock.calls[1]?.[0]?.limit).toBe(200); // max(20*10, 50)

    await memoryRetriever.search({ text: "q" }); // sin limit -> topK default (10)
    expect(findCandidates.mock.calls[2]?.[0]?.limit).toBe(100); // max(10*10, 50)
  });

  it("candidateLimit es configurable vía options", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const { retriever: candidateRetriever, findCandidates } = fakeCandidateRetriever([]);
    const { ranker } = fakeRanker();
    const memoryRetriever = new MemoryRetriever(embeddingProvider, candidateRetriever, ranker, {
      candidateLimit: (topK) => topK + 1,
    });

    await memoryRetriever.search({ text: "q", limit: 5 });
    expect(findCandidates.mock.calls[0]?.[0]?.limit).toBe(6);
  });

  it("con projectId presente: lo pasa al candidate retriever y usa DEFAULT_PROJECT_RANKING_WEIGHTS", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const { retriever: candidateRetriever, findCandidates } = fakeCandidateRetriever([]);
    const { ranker, rank } = fakeRanker();
    const memoryRetriever = new MemoryRetriever(embeddingProvider, candidateRetriever, ranker);

    await memoryRetriever.search({ text: "q", projectId: "miller" });

    expect(findCandidates.mock.calls[0]?.[0]?.projectId).toBe("miller");
    expect(rank.mock.calls[0]?.[1]?.projectId).toBe("miller");
    expect(rank.mock.calls[0]?.[1]?.weights).toEqual(DEFAULT_PROJECT_RANKING_WEIGHTS);
  });

  it("sin projectId: no lo pasa al candidate retriever y usa DEFAULT_GLOBAL_RANKING_WEIGHTS", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const { retriever: candidateRetriever, findCandidates } = fakeCandidateRetriever([]);
    const { ranker, rank } = fakeRanker();
    const memoryRetriever = new MemoryRetriever(embeddingProvider, candidateRetriever, ranker);

    await memoryRetriever.search({ text: "q" });

    expect(findCandidates.mock.calls[0]?.[0]?.projectId).toBeUndefined();
    expect(rank.mock.calls[0]?.[1]?.projectId).toBeUndefined();
    expect(rank.mock.calls[0]?.[1]?.weights).toEqual(DEFAULT_GLOBAL_RANKING_WEIGHTS);
  });

  it("permite sobreescribir los pesos y el half-life de recencia vía options", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const { retriever: candidateRetriever } = fakeCandidateRetriever([]);
    const { ranker, rank } = fakeRanker();
    const customGlobalWeights = {
      semanticSimilarity: 1,
      projectRelevance: 0,
      confidence: 0,
      importance: 0,
      recency: 0,
    };
    const memoryRetriever = new MemoryRetriever(embeddingProvider, candidateRetriever, ranker, {
      globalWeights: customGlobalWeights,
      recencyHalfLifeDays: 30,
    });

    await memoryRetriever.search({ text: "q" });

    expect(rank.mock.calls[0]?.[1]?.weights).toEqual(customGlobalWeights);
    expect(rank.mock.calls[0]?.[1]?.recencyHalfLifeDays).toBe(30);
  });

  it("recorta el resultado final a topK aunque el ranker devuelva más", async () => {
    const embeddingProvider = fakeEmbeddingProvider();
    const candidates = Array.from({ length: 20 }, (_, i) =>
      buildCandidate({ semanticSimilarity: 1 - i / 100 }),
    );
    const { retriever: candidateRetriever } = fakeCandidateRetriever(candidates);
    const { ranker } = fakeRanker();
    const memoryRetriever = new MemoryRetriever(embeddingProvider, candidateRetriever, ranker);

    const results = await memoryRetriever.search({ text: "q", limit: 3 });
    expect(results).toHaveLength(3);
  });

  it("aplica post-filtro por types antes del ranking", async () => {
    const factMemory = buildCandidate({ memory: buildMemory({ type: "fact" }) });
    const decisionMemory = buildCandidate({ memory: buildMemory({ type: "decision" }) });
    const embeddingProvider = fakeEmbeddingProvider();
    const { retriever: candidateRetriever } = fakeCandidateRetriever([factMemory, decisionMemory]);
    const { ranker, rank } = fakeRanker();
    const memoryRetriever = new MemoryRetriever(embeddingProvider, candidateRetriever, ranker);

    await memoryRetriever.search({ text: "q", types: ["decision"] });

    const rankedCandidates = rank.mock.calls[0]?.[0] as readonly MemorySearchCandidate[];
    expect(rankedCandidates).toHaveLength(1);
    expect(rankedCandidates[0]?.memory.type).toBe("decision");
  });

  it("aplica post-filtro por scopes antes del ranking", async () => {
    const globalMemory = buildCandidate({ memory: buildMemory({ scope: "global" }) });
    const projectMemory = buildCandidate({
      memory: buildMemory({ scope: "project", projectId: "miller" }),
    });
    const embeddingProvider = fakeEmbeddingProvider();
    const { retriever: candidateRetriever } = fakeCandidateRetriever([globalMemory, projectMemory]);
    const { ranker, rank } = fakeRanker();
    const memoryRetriever = new MemoryRetriever(embeddingProvider, candidateRetriever, ranker);

    await memoryRetriever.search({ text: "q", scopes: ["project"] });

    const rankedCandidates = rank.mock.calls[0]?.[0] as readonly MemorySearchCandidate[];
    expect(rankedCandidates).toHaveLength(1);
    expect(rankedCandidates[0]?.memory.scope).toBe("project");
  });

  it("sin types/scopes en la query, no filtra ningún candidato", async () => {
    const candidates = [buildCandidate(), buildCandidate()];
    const embeddingProvider = fakeEmbeddingProvider();
    const { retriever: candidateRetriever } = fakeCandidateRetriever(candidates);
    const { ranker, rank } = fakeRanker();
    const memoryRetriever = new MemoryRetriever(embeddingProvider, candidateRetriever, ranker);

    await memoryRetriever.search({ text: "q" });

    expect(rank.mock.calls[0]?.[0]).toHaveLength(2);
  });
});
