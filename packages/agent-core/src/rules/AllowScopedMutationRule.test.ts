import { describe, expect, it } from "vitest";
import type { ToolRequest } from "@guerrero-dev/domain";
import type { PolicyContext } from "@guerrero-dev/application";
import { AllowScopedMutationRule, EDIT_TARGET_PATH_METADATA_KEY } from "./AllowScopedMutationRule.js";

const PROJECT_ROOT = "/repos/guerrero-dev";

function makeRequest(toolName: string, input: Record<string, unknown> = {}): ToolRequest {
  return {
    id: "req-1",
    sessionId: "session-1",
    toolName,
    input,
    requestedAt: new Date(),
  };
}

function editRequest(targetPath: string): ToolRequest {
  return makeRequest("edit", { [EDIT_TARGET_PATH_METADATA_KEY]: targetPath });
}

const context: PolicyContext = { projectRootPath: PROJECT_ROOT, userId: "santiago" };

describe("AllowScopedMutationRule", () => {
  describe("categoría de lectura (equivalente a AllowReadRule)", () => {
    it("aprueba read", async () => {
      const decision = await new AllowScopedMutationRule().evaluate(makeRequest("read"), context);

      expect(decision.allowed).toBe(true);
      expect(decision.riskLevel).toBe("low");
      expect(decision.toolRequestId).toBe("req-1");
    });

    it("deniega bash", async () => {
      const decision = await new AllowScopedMutationRule().evaluate(makeRequest("bash"), context);

      expect(decision.allowed).toBe(false);
      expect(decision.riskLevel).toBe("high");
      expect(decision.reason).toContain("bash");
    });

    it("deniega cualquier herramienta desconocida", async () => {
      const decision = await new AllowScopedMutationRule().evaluate(makeRequest("fs.write"), context);

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("fs.write");
    });

    it("compara el nombre de herramienta de forma exacta y sensible a mayúsculas", async () => {
      const decision = await new AllowScopedMutationRule().evaluate(makeRequest("Read"), context);

      expect(decision.allowed).toBe(false);
    });

    it("aprueba una tool de solo lectura adicional inyectada por constructor", async () => {
      const rule = new AllowScopedMutationRule(["code-intelligence_find_symbols_by_name"]);

      const decision = await rule.evaluate(makeRequest("code-intelligence_find_symbols_by_name"), context);

      expect(decision.allowed).toBe(true);
    });

    it("sigue aprobando read cuando se inyectan tools adicionales", async () => {
      const rule = new AllowScopedMutationRule(["code-intelligence_find_symbols_by_name"]);

      const decision = await rule.evaluate(makeRequest("read"), context);

      expect(decision.allowed).toBe(true);
    });

    it("deniega una tool que no está ni en read ni en las adicionales inyectadas", async () => {
      const rule = new AllowScopedMutationRule(["code-intelligence_find_symbols_by_name"]);

      const decision = await rule.evaluate(makeRequest("code-intelligence_search_literal"), context);

      expect(decision.allowed).toBe(false);
    });
  });

  describe('categoría de mutación ("edit")', () => {
    it("aprueba una edición dentro del proyecto, fuera de la deny-list", async () => {
      const decision = await new AllowScopedMutationRule().evaluate(editRequest("src/foo.ts"), context);

      expect(decision.allowed).toBe(true);
      expect(decision.riskLevel).toBe("low");
    });

    it("aprueba una edición con path absoluto ya dentro del proyecto", async () => {
      const decision = await new AllowScopedMutationRule().evaluate(
        editRequest(`${PROJECT_ROOT}/src/foo.ts`),
        context,
      );

      expect(decision.allowed).toBe(true);
    });

    it("deniega si falta el campo del path objetivo (fail-closed)", async () => {
      const decision = await new AllowScopedMutationRule().evaluate(makeRequest("edit", {}), context);

      expect(decision.allowed).toBe(false);
      expect(decision.riskLevel).toBe("high");
      expect(decision.reason).toContain("fail-closed");
    });

    it("deniega si el campo del path objetivo no es un string", async () => {
      const decision = await new AllowScopedMutationRule().evaluate(
        makeRequest("edit", { [EDIT_TARGET_PATH_METADATA_KEY]: 42 }),
        context,
      );

      expect(decision.allowed).toBe(false);
    });

    it('deniega con nombres de campo "razonables" pero no confirmados (file, filePath) — todavía no alcanzable en runtime', async () => {
      const withFile = await new AllowScopedMutationRule().evaluate(
        makeRequest("edit", { file: "src/foo.ts" }),
        context,
      );
      const withFilePath = await new AllowScopedMutationRule().evaluate(
        makeRequest("edit", { filePath: "src/foo.ts" }),
        context,
      );

      expect(withFile.allowed).toBe(false);
      expect(withFilePath.allowed).toBe(false);
    });

    it("deniega una edición fuera de projectRootPath (../)", async () => {
      const decision = await new AllowScopedMutationRule().evaluate(
        editRequest("../otro-repo/archivo.ts"),
        context,
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("fuera de projectRootPath");
    });

    it("deniega una edición fuera de projectRootPath (absoluta, mismo prefijo de string)", async () => {
      const decision = await new AllowScopedMutationRule().evaluate(
        editRequest("/repos/guerrero-dev-other/archivo.ts"),
        context,
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("fuera de projectRootPath");
    });

    it.each([
      [".env"],
      [".env.local"],
      [".git/config"],
      ["pnpm-lock.yaml"],
      ["packages/infrastructure/src/database/migrations/0001_init.sql"],
    ])("deniega la edición de una ruta sensible: %s", async (sensitivePath) => {
      const decision = await new AllowScopedMutationRule().evaluate(editRequest(sensitivePath), context);

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("deny-list");
    });

    it("aprueba una migración todavía no aplicada (no está en la deny-list)", async () => {
      const decision = await new AllowScopedMutationRule().evaluate(
        editRequest("packages/infrastructure/src/database/migrations/0005_nueva.sql"),
        context,
      );

      expect(decision.allowed).toBe(true);
    });

    it("deniega una ruta sensible con path absoluto real de Windows", async () => {
      const windowsContext: PolicyContext = {
        projectRootPath: "C:\\Dev\\agente\\guerrero-dev",
        userId: "santiago",
      };
      const decision = await new AllowScopedMutationRule().evaluate(
        editRequest("C:\\Dev\\agente\\guerrero-dev\\.env"),
        windowsContext,
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("deny-list");
    });
  });

  describe("guarda contra apply_patch (metadata compartida con la categoría edit)", () => {
    it('deniega si request.input trae "files" (patch multi-archivo)', async () => {
      const decision = await new AllowScopedMutationRule().evaluate(
        makeRequest("edit", {
          [EDIT_TARGET_PATH_METADATA_KEY]: "src/a.ts, src/b.ts",
          files: ["src/a.ts", "src/b.ts"],
        }),
        context,
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("lista de archivos");
    });

    it('deniega si el path objetivo contiene ", " aunque no venga "files"', async () => {
      const decision = await new AllowScopedMutationRule().evaluate(
        editRequest("src/a.ts, src/b.ts"),
        context,
      );

      expect(decision.allowed).toBe(false);
      expect(decision.reason).toContain("lista de archivos");
    });

    it('la guarda no da falsos positivos sobre un path legítimo sin ", "', async () => {
      const decision = await new AllowScopedMutationRule().evaluate(editRequest("src/foo.ts"), context);

      expect(decision.allowed).toBe(true);
    });
  });
});
