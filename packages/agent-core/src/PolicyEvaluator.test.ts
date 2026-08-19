import { describe, expect, it } from "vitest";
import type { ToolRequest } from "@guerrero-dev/domain";
import type { PolicyContext } from "@guerrero-dev/application";
import { PolicyEvaluator } from "./PolicyEvaluator.js";
import { AllowReadRule } from "./rules/AllowReadRule.js";

function makeRequest(): ToolRequest {
  return {
    id: "req-1",
    sessionId: "session-1",
    toolName: "fs.write",
    input: { path: "/tmp/x" },
    requestedAt: new Date(),
  };
}

const context: PolicyContext = { projectRootPath: "/repos/guerrero-dev", userId: "santiago" };

describe("PolicyEvaluator", () => {
  it("deniega por defecto (fail-closed) si no hay reglas", async () => {
    const engine = new PolicyEvaluator();
    const decision = await engine.evaluate(makeRequest(), context);

    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe("high");
  });

  it("aprueba si todas las reglas aprueban", async () => {
    const engine = new PolicyEvaluator();
    engine.addRule({
      name: "allow-all",
      evaluate: (request) => ({
        toolRequestId: request.id,
        allowed: true,
        riskLevel: "low",
        reason: "test",
        decidedAt: new Date(),
      }),
    });

    const decision = await engine.evaluate(makeRequest(), context);
    expect(decision.allowed).toBe(true);
  });

  it("deniega si cualquier regla deniega", async () => {
    const engine = new PolicyEvaluator();
    engine.addRule({
      name: "allow-all",
      evaluate: (request) => ({
        toolRequestId: request.id,
        allowed: true,
        riskLevel: "low",
        reason: "test",
        decidedAt: new Date(),
      }),
    });
    engine.addRule({
      name: "deny-fs-write",
      evaluate: (request) => ({
        toolRequestId: request.id,
        allowed: request.toolName !== "fs.write",
        riskLevel: "high",
        reason: "fs.write requiere aprobación manual",
        decidedAt: new Date(),
      }),
    });

    const decision = await engine.evaluate(makeRequest(), context);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("fs.write");
  });

  it("con AllowReadRule como única regla, aprueba read y deniega el resto", async () => {
    const engine = new PolicyEvaluator();
    engine.addRule(new AllowReadRule());

    const readDecision = await engine.evaluate({ ...makeRequest(), toolName: "read" }, context);
    expect(readDecision.allowed).toBe(true);

    const editDecision = await engine.evaluate({ ...makeRequest(), toolName: "edit" }, context);
    expect(editDecision.allowed).toBe(false);
    expect(editDecision.reason).toContain("edit");
  });
});
