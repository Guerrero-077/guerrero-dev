import { describe, expect, it } from "vitest";
import type { MemoryCandidate } from "@guerrero-dev/domain";
import { DeterministicMemoryCandidateValidator } from "./DeterministicMemoryCandidateValidator.js";

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

describe("DeterministicMemoryCandidateValidator", () => {
  const validator = new DeterministicMemoryCandidateValidator();

  it("no lanza para un candidato válido (scope global sin projectId)", () => {
    expect(() => validator.validate(buildCandidate())).not.toThrow();
  });

  it("no lanza para un candidato válido (scope project con projectId)", () => {
    expect(() =>
      validator.validate(buildCandidate({ scope: "project", projectId: "project-1" })),
    ).not.toThrow();
  });

  it("lanza si confidence está por encima de 1", () => {
    expect(() => validator.validate(buildCandidate({ confidence: 1.4 }))).toThrow(
      /confidence fuera de rango: 1.4/,
    );
  });

  it("lanza si confidence está por debajo de 0", () => {
    expect(() => validator.validate(buildCandidate({ confidence: -0.1 }))).toThrow(
      /confidence fuera de rango: -0.1/,
    );
  });

  it("lanza si importance está fuera de rango", () => {
    expect(() => validator.validate(buildCandidate({ importance: -0.2 }))).toThrow(
      /importance fuera de rango: -0.2/,
    );
  });

  it("lanza si scope global tiene projectId", () => {
    expect(() => validator.validate(buildCandidate({ scope: "global", projectId: "project-1" }))).toThrow(
      /scope "global" inconsistente con projectId "project-1"/,
    );
  });

  it("lanza si scope project no tiene projectId", () => {
    expect(() => validator.validate(buildCandidate({ scope: "project", projectId: null }))).toThrow(
      /scope "project" inconsistente con projectId null/,
    );
  });

  it("lanza si scope session no tiene projectId", () => {
    expect(() => validator.validate(buildCandidate({ scope: "session", projectId: null }))).toThrow(
      /scope "session" inconsistente con projectId null/,
    );
  });

  it("valida confidence antes que importance (primer invariante que falla)", () => {
    expect(() => validator.validate(buildCandidate({ confidence: 2, importance: -5 }))).toThrow(
      /confidence fuera de rango/,
    );
  });
});
