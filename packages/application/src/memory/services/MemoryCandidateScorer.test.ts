import { describe, expect, it } from "vitest";
import type { MemoryCandidate } from "@guerrero-dev/domain";
import { MemoryCandidateScorer } from "./MemoryCandidateScorer.js";

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

describe("MemoryCandidateScorer", () => {
  it("combina confidence, importance y el peso de sourceType con los defaults documentados", () => {
    const scorer = new MemoryCandidateScorer();

    const { score } = scorer.score(
      buildCandidate({ confidence: 0.8, importance: 0.6, source: { sourceType: "conversation", sourceReference: "x" } }),
    );

    // 0.8*0.5 + 0.6*0.3 + 0.7*0.2 = 0.4 + 0.18 + 0.14 = 0.72
    expect(score).toBeCloseTo(0.72, 10);
  });

  it("da el mayor score posible a un candidato de fuente repository con confidence/importance en 1", () => {
    const scorer = new MemoryCandidateScorer();

    const { score } = scorer.score(
      buildCandidate({ confidence: 1, importance: 1, source: { sourceType: "repository", sourceReference: "x" } }),
    );

    expect(score).toBeCloseTo(1, 10);
  });

  it("penaliza agent_observation frente a repository con el mismo confidence/importance", () => {
    const scorer = new MemoryCandidateScorer();

    const repositoryScore = scorer.score(
      buildCandidate({ source: { sourceType: "repository", sourceReference: "x" } }),
    ).score;
    const agentObservationScore = scorer.score(
      buildCandidate({ source: { sourceType: "agent_observation", sourceReference: "x" } }),
    ).score;

    expect(agentObservationScore).toBeLessThan(repositoryScore);
  });

  it("trata manual con el mismo peso que repository (tope de la jerarquía)", () => {
    const scorer = new MemoryCandidateScorer();

    const repositoryScore = scorer.score(
      buildCandidate({ source: { sourceType: "repository", sourceReference: "x" } }),
    ).score;
    const manualScore = scorer.score(
      buildCandidate({ source: { sourceType: "manual", sourceReference: "x" } }),
    ).score;

    expect(manualScore).toBe(repositoryScore);
  });

  it("acepta pesos y sourceTypeWeights inyectados por constructor", () => {
    const scorer = new MemoryCandidateScorer(
      { confidence: 1, importance: 0, sourceType: 0 },
      { repository: 1, file: 1, commit: 1, test: 1, manual: 1, conversation: 1, agent_observation: 1 },
    );

    const { score } = scorer.score(buildCandidate({ confidence: 0.37 }));

    expect(score).toBeCloseTo(0.37, 10);
  });
});
