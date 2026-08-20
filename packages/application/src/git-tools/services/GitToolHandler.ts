import type { ToolRequest } from "@guerrero-dev/domain";
import type { GitToolResult } from "../models/GitToolResult.js";
import type { IGitWorkingTreeSource } from "../ports/IGitWorkingTreeSource.js";
import { GitToolHandlerError } from "./GitToolHandlerError.js";

const DEFAULT_LOG_LIMIT = 20;

/**
 * Adapta un `ToolRequest` a una llamada real sobre `IGitWorkingTreeSource` —
 * mismo patrón que `CodeIntelligenceToolHandler` (application/code-intelligence):
 * forma de tool invocada por el agente en runtime, no de contexto
 * siempre-presente.
 *
 * `repoRoot` se recibe como segundo parámetro, no como parte de
 * `ToolRequest.input` — mismo motivo que `CodeIntelligenceToolHandler`: el
 * proceso que spawnea el servidor MCP ya conoce la ruta real del proyecto,
 * pedírsela al modelo solo reabre el riesgo de alucinación de rutas
 * documentado en `docs/roadmap-maestro.md` (hallazgo 6p).
 */
export class GitToolHandler {
  constructor(private readonly workingTreeSource: IGitWorkingTreeSource) {}

  async handle(request: ToolRequest, repoRoot: string): Promise<GitToolResult> {
    switch (request.toolName) {
      case "git_status": {
        const entries = await this.workingTreeSource.getStatus(repoRoot);
        return { toolName: "git_status", entries };
      }
      case "git_diff": {
        const filePath = this.optionalStringInput(request, "filePath");
        const diff = await this.workingTreeSource.getDiff(repoRoot, filePath);
        return { toolName: "git_diff", diff };
      }
      case "git_log": {
        const limit = this.optionalPositiveIntInput(request, "limit") ?? DEFAULT_LOG_LIMIT;
        const entries = await this.workingTreeSource.getRecentLog(repoRoot, limit);
        return { toolName: "git_log", entries };
      }
      default:
        throw new GitToolHandlerError("unknown_tool", `GitToolHandler no reconoce la herramienta "${request.toolName}".`);
    }
  }

  private optionalStringInput(request: ToolRequest, key: string): string | undefined {
    const value = request.input[key];
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value.length === 0) {
      throw new GitToolHandlerError(
        "invalid_input",
        `GitToolHandler: "${request.toolName}" requiere que input.${key}, si se pasa, sea un string no vacío.`,
      );
    }
    return value;
  }

  private optionalPositiveIntInput(request: ToolRequest, key: string): number | undefined {
    const value = request.input[key];
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new GitToolHandlerError(
        "invalid_input",
        `GitToolHandler: "${request.toolName}" requiere que input.${key}, si se pasa, sea un entero positivo.`,
      );
    }
    return value;
  }
}
