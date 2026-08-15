import { describe, expect, it } from "vitest";
import { isScopeConsistent, isValidConfidence, isValidImportance } from "./MemoryInvariants.js";

describe("isValidConfidence / isValidImportance", () => {
  it.each([0, 0.5, 1])("acepta valores dentro de 0..1 (%s)", (value) => {
    expect(isValidConfidence(value)).toBe(true);
    expect(isValidImportance(value)).toBe(true);
  });

  it.each([-0.01, 1.01, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    "rechaza valores fuera de 0..1 (%s)",
    (value) => {
      expect(isValidConfidence(value)).toBe(false);
      expect(isValidImportance(value)).toBe(false);
    },
  );
});

describe("isScopeConsistent", () => {
  it("scope global requiere projectId null", () => {
    expect(isScopeConsistent("global", null)).toBe(true);
    expect(isScopeConsistent("global", "project-1")).toBe(false);
  });

  it("scope project requiere projectId", () => {
    expect(isScopeConsistent("project", "project-1")).toBe(true);
    expect(isScopeConsistent("project", null)).toBe(false);
  });

  it("scope session requiere projectId", () => {
    expect(isScopeConsistent("session", "project-1")).toBe(true);
    expect(isScopeConsistent("session", null)).toBe(false);
  });
});
