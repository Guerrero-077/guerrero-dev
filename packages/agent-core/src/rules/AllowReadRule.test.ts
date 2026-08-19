import { describe, expect, it } from "vitest";
import type { ToolRequest } from "@guerrero-dev/domain";
import type { PolicyContext } from "@guerrero-dev/application";
import { AllowReadRule } from "./AllowReadRule.js";

function makeRequest(toolName: string): ToolRequest {
  return {
    id: "req-1",
    sessionId: "session-1",
    toolName,
    input: { path: "/repos/guerrero-dev/README.md" },
    requestedAt: new Date(),
  };
}

const context: PolicyContext = { projectRootPath: "/repos/guerrero-dev", userId: "santiago" };

describe("AllowReadRule", () => {
  it("aprueba la herramienta read", async () => {
    const decision = await new AllowReadRule().evaluate(makeRequest("read"), context);

    expect(decision.allowed).toBe(true);
    expect(decision.riskLevel).toBe("low");
    expect(decision.toolRequestId).toBe("req-1");
  });

  it("deniega edit (categoría de permiso real de OpenCode)", async () => {
    const decision = await new AllowReadRule().evaluate(makeRequest("edit"), context);

    expect(decision.allowed).toBe(false);
    expect(decision.riskLevel).toBe("high");
    expect(decision.reason).toContain("edit");
  });

  it("deniega bash (categoría de permiso real de OpenCode)", async () => {
    const decision = await new AllowReadRule().evaluate(makeRequest("bash"), context);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("bash");
  });

  it("deniega cualquier herramienta desconocida", async () => {
    const decision = await new AllowReadRule().evaluate(makeRequest("fs.write"), context);

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("fs.write");
  });

  it("compara el nombre de herramienta de forma exacta y sensible a mayúsculas", async () => {
    const decision = await new AllowReadRule().evaluate(makeRequest("Read"), context);

    expect(decision.allowed).toBe(false);
  });
});
