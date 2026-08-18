import type { ToolRequest } from "@guerrero-dev/domain";
import type { CodeIntelligenceToolResult } from "../models/CodeIntelligenceToolResult.js";
import type { ICodeAnalyzer } from "../ports/ICodeAnalyzer.js";
import type { ICodeLiteralSearch } from "../ports/ICodeLiteralSearch.js";
import { findSymbolsByName } from "../queries/findSymbolsByName.js";
import { getDependencies } from "../queries/getDependencies.js";
import { getDependents } from "../queries/getDependents.js";
import { CodeIntelligenceToolHandlerError } from "./CodeIntelligenceToolHandlerError.js";

/**
 * Adapta un `ToolRequest` a una llamada real sobre `ICodeAnalyzer`/
 * `ICodeLiteralSearch` + las queries puras de Code Intelligence (Fase 6)
 * — forma de tool, no de contexto siempre-presente (ver JSDoc de
 * `ContextBuilder`, Fase 5.4a): `ICodeAnalyzer.analyze()` es un parseo
 * completo del árbol `.ts`, sin caché ni persistencia, así que cada
 * `handle()` con `find_symbols_by_name`/`get_dependencies`/
 * `get_dependents` repite el escaneo.
 *
 * `repoRoot` se recibe como segundo parámetro, no como parte de
 * `ToolRequest.input` — mismo patrón que `IPolicyEngine.evaluate(request,
 * context)` (Fase 5.3).
 *
 * Cableado a `AgentOrchestrator`/`IExecutionEngine` queda fuera de
 * alcance (Fase 5.4b): no existe hoy un motor de ejecución real que
 * produzca steps con `toolRequest` para código — eso es Fase 5.5.
 */
export class CodeIntelligenceToolHandler {
  constructor(
    private readonly codeAnalyzer: ICodeAnalyzer,
    private readonly literalSearch: ICodeLiteralSearch,
  ) {}

  async handle(request: ToolRequest, repoRoot: string): Promise<CodeIntelligenceToolResult> {
    switch (request.toolName) {
      case "find_symbols_by_name": {
        const name = this.requireStringInput(request, "name");
        const index = await this.codeAnalyzer.analyze(repoRoot);
        return { toolName: "find_symbols_by_name", symbols: findSymbolsByName(index, name) };
      }
      case "get_dependencies": {
        const filePath = this.requireStringInput(request, "filePath");
        const index = await this.codeAnalyzer.analyze(repoRoot);
        return { toolName: "get_dependencies", edges: getDependencies(index, filePath) };
      }
      case "get_dependents": {
        const filePath = this.requireStringInput(request, "filePath");
        const index = await this.codeAnalyzer.analyze(repoRoot);
        return { toolName: "get_dependents", edges: getDependents(index, filePath) };
      }
      case "search_literal": {
        const query = this.requireStringInput(request, "query");
        const matches = await this.literalSearch.search(repoRoot, query);
        return { toolName: "search_literal", matches };
      }
      default:
        throw new CodeIntelligenceToolHandlerError(
          "unknown_tool",
          `CodeIntelligenceToolHandler no reconoce la herramienta "${request.toolName}".`,
        );
    }
  }

  private requireStringInput(request: ToolRequest, key: string): string {
    const value = request.input[key];
    if (typeof value !== "string" || value.length === 0) {
      throw new CodeIntelligenceToolHandlerError(
        "invalid_input",
        `CodeIntelligenceToolHandler: "${request.toolName}" requiere input.${key} como string no vacío.`,
      );
    }
    return value;
  }
}
