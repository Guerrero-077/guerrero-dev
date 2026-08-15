import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { Memory } from "@guerrero-dev/domain";
import {
  DEFAULT_GLOBAL_RANKING_WEIGHTS,
  DEFAULT_PROJECT_RANKING_WEIGHTS,
} from "../models/MemoryRankingWeights.js";
import type { MemoryRankingContext } from "../models/MemoryRankingContext.js";
import type { MemorySearchCandidate } from "../models/MemorySearchCandidate.js";
import { MemoryRanker } from "./MemoryRanker.js";

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

function buildContext(overrides: Partial<MemoryRankingContext> = {}): MemoryRankingContext {
  return {
    weights: DEFAULT_GLOBAL_RANKING_WEIGHTS,
    recencyHalfLifeDays: 180,
    now: NOW,
    ...overrides,
  };
}

describe("MemoryRanker", () => {
  const ranker = new MemoryRanker();

  it("devuelve [] para una lista de candidatos vacía", () => {
    expect(ranker.rank([], buildContext())).toEqual([]);
  });

  it("ordena por score descendente, no por el orden de entrada", () => {
    const low = buildCandidate({
      memory: buildMemory({ id: "low", confidence: 0.1, importance: 0.1 }),
      semanticSimilarity: 0.1,
    });
    const high = buildCandidate({
      memory: buildMemory({ id: "high", confidence: 0.9, importance: 0.9 }),
      semanticSimilarity: 0.9,
    });

    const results = ranker.rank([low, high], buildContext());

    expect(results.map((r) => r.memory.id)).toEqual(["high", "low"]);
  });

  it("cada score es la suma ponderada exacta de los cinco factores (pesos globales)", () => {
    const memory = buildMemory({
      projectId: null,
      scope: "global",
      confidence: 0.8,
      importance: 0.6,
      lastVerifiedAt: NOW, // ageDays = 0 -> recency = 1
    });
    const candidate = buildCandidate({ memory, semanticSimilarity: 0.7 });

    const [result] = ranker.rank([candidate], buildContext({ weights: DEFAULT_GLOBAL_RANKING_WEIGHTS }));

    // global scope -> projectRelevance = 1 aunque no haya contextProjectId
    const expectedScore =
      0.7 * DEFAULT_GLOBAL_RANKING_WEIGHTS.semanticSimilarity +
      1 * DEFAULT_GLOBAL_RANKING_WEIGHTS.projectRelevance +
      0.8 * DEFAULT_GLOBAL_RANKING_WEIGHTS.confidence +
      0.6 * DEFAULT_GLOBAL_RANKING_WEIGHTS.importance +
      1 * DEFAULT_GLOBAL_RANKING_WEIGHTS.recency;

    expect(result?.score).toBeCloseTo(expectedScore, 10);
  });

  describe("projectRelevance", () => {
    it("es 1 para memorias del mismo proyecto que el contexto", () => {
      const memory = buildMemory({ scope: "project", projectId: "miller" });
      const candidate = buildCandidate({ memory, semanticSimilarity: 0 });
      const context = buildContext({
        projectId: "miller",
        weights: { semanticSimilarity: 0, projectRelevance: 1, confidence: 0, importance: 0, recency: 0 },
      });

      const [result] = ranker.rank([candidate], context);
      expect(result?.score).toBeCloseTo(1, 10);
    });

    it("es 0 para memorias de un proyecto distinto y específico (no global)", () => {
      const memory = buildMemory({ scope: "project", projectId: "gescomph" });
      const candidate = buildCandidate({ memory, semanticSimilarity: 0 });
      const context = buildContext({
        projectId: "miller",
        weights: { semanticSimilarity: 0, projectRelevance: 1, confidence: 0, importance: 0, recency: 0 },
      });

      const [result] = ranker.rank([candidate], context);
      expect(result?.score).toBeCloseTo(0, 10);
    });

    it("es 1 para memorias globales sin importar el proyecto de contexto", () => {
      const memory = buildMemory({ scope: "global", projectId: null });
      const candidate = buildCandidate({ memory, semanticSimilarity: 0 });
      const context = buildContext({
        projectId: "miller",
        weights: { semanticSimilarity: 0, projectRelevance: 1, confidence: 0, importance: 0, recency: 0 },
      });

      const [result] = ranker.rank([candidate], context);
      expect(result?.score).toBeCloseTo(1, 10);
    });

    it("es neutro (1) para todos cuando el contexto no tiene projectId", () => {
      const memoryA = buildMemory({ scope: "project", projectId: "miller" });
      const memoryB = buildMemory({ scope: "project", projectId: "gescomph" });
      const weights = {
        semanticSimilarity: 0,
        projectRelevance: 1,
        confidence: 0,
        importance: 0,
        recency: 0,
      };

      const [resultA] = ranker.rank([buildCandidate({ memory: memoryA })], buildContext({ weights }));
      const [resultB] = ranker.rank([buildCandidate({ memory: memoryB })], buildContext({ weights }));

      expect(resultA?.score).toBeCloseTo(1, 10);
      expect(resultB?.score).toBeCloseTo(1, 10);
    });
  });

  describe("recency (decay exponencial de media vida)", () => {
    const onlyRecencyContext = buildContext({
      weights: { semanticSimilarity: 0, projectRelevance: 0, confidence: 0, importance: 0, recency: 1 },
      recencyHalfLifeDays: 180,
    });

    it("es 1 para una memoria verificada ahora mismo (age = 0)", () => {
      const memory = buildMemory({ lastVerifiedAt: NOW });
      const [result] = ranker.rank([buildCandidate({ memory })], onlyRecencyContext);
      expect(result?.score).toBeCloseTo(1, 10);
    });

    it("es exactamente 0.5 cuando age === halfLifeDays", () => {
      const halfLifeAgo = new Date(NOW.getTime() - 180 * 24 * 60 * 60 * 1000);
      const memory = buildMemory({ lastVerifiedAt: halfLifeAgo });
      const [result] = ranker.rank([buildCandidate({ memory })], onlyRecencyContext);
      expect(result?.score).toBeCloseTo(0.5, 6);
    });

    it("usa lastVerifiedAt si existe; si no, cae a updatedAt", () => {
      const old = new Date(NOW.getTime() - 365 * 24 * 60 * 60 * 1000);
      const memory = buildMemory({ createdAt: old, updatedAt: NOW, lastVerifiedAt: null });
      const [result] = ranker.rank([buildCandidate({ memory })], onlyRecencyContext);
      // updatedAt = NOW -> age = 0 -> recency = 1, no se usa createdAt
      expect(result?.score).toBeCloseTo(1, 10);
    });

    it("no da recency negativa ni > 1 para fechas futuras (age se clampea a 0)", () => {
      const future = new Date(NOW.getTime() + 10 * 24 * 60 * 60 * 1000);
      const memory = buildMemory({ lastVerifiedAt: future });
      const [result] = ranker.rank([buildCandidate({ memory })], onlyRecencyContext);
      expect(result?.score).toBeLessThanOrEqual(1);
      expect(result?.score).toBeGreaterThanOrEqual(0);
    });
  });

  describe("reasons", () => {
    it("incluye same_project solo si hay contextProjectId y coincide con la memoria", () => {
      const memory = buildMemory({ scope: "project", projectId: "miller" });
      const candidate = buildCandidate({ memory, semanticSimilarity: 0.1 });

      const [withContext] = ranker.rank([candidate], buildContext({ projectId: "miller" }));
      const [withoutContext] = ranker.rank([candidate], buildContext({ projectId: undefined }));

      expect(withContext?.reasons).toContain("same_project");
      expect(withoutContext?.reasons).not.toContain("same_project");
    });

    it("incluye high_confidence / high_importance / semantic_similarity / recent según umbrales", () => {
      const memory = buildMemory({ confidence: 0.95, importance: 0.9, lastVerifiedAt: NOW });
      const candidate = buildCandidate({ memory, semanticSimilarity: 0.85 });

      const [result] = ranker.rank([candidate], buildContext());

      expect(result?.reasons).toEqual(
        expect.arrayContaining(["semantic_similarity", "high_confidence", "high_importance", "recent"]),
      );
    });

    it("no incluye ningún reason cuando todos los valores están por debajo de los umbrales", () => {
      const veryOld = new Date(NOW.getTime() - 10 * 365 * 24 * 60 * 60 * 1000);
      const memory = buildMemory({ confidence: 0.1, importance: 0.1, lastVerifiedAt: veryOld });
      const candidate = buildCandidate({ memory, semanticSimilarity: 0.1 });

      const [result] = ranker.rank([candidate], buildContext());

      expect(result?.reasons).toEqual([]);
    });
  });

  it("con pesos de búsqueda dentro de proyecto (projectRelevance=0), dos memorias del mismo proyecto se ordenan solo por el resto de los factores", () => {
    const weak = buildCandidate({
      memory: buildMemory({ scope: "project", projectId: "miller", confidence: 0.2, importance: 0.2 }),
      semanticSimilarity: 0.3,
    });
    const strong = buildCandidate({
      memory: buildMemory({ scope: "project", projectId: "miller", confidence: 0.9, importance: 0.9 }),
      semanticSimilarity: 0.4,
    });

    const results = ranker.rank(
      [weak, strong],
      buildContext({ projectId: "miller", weights: DEFAULT_PROJECT_RANKING_WEIGHTS }),
    );

    expect(results[0]?.memory.id).toBe(strong.memory.id);
  });
});
