import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ToolRequest } from "@guerrero-dev/domain";
import { GitToolHandler, GitToolHandlerError, type IGitWorkingTreeSource } from "@guerrero-dev/application";

/**
 * Segundo servidor MCP real del repo (el primero fue `CodeIntelligenceMcpServer`,
 * Fase 5.4c), mismo patrón exacto: envuelve `GitToolHandler`
 * (`application/git-tools`) para que OpenCode (`Config.mcp`) pueda
 * invocarlo. Cierra un gap explícitamente anotado desde antes en el JSDoc
 * de `infrastructure/git/index.ts` ("el resto de operaciones de git...
 * se agregan cuando haya un caso de uso concreto que las requiera") — el
 * caso de uso concreto es este: el agente hoy no tiene ninguna forma de
 * observar el estado real de Git del proyecto (qué cambió, qué dice el
 * historial reciente) más allá de leer archivos sueltos con `read`/`grep`.
 *
 * `repoRoot` se recibe una sola vez al construir el servidor, nunca como
 * argumento de un tool — mismo motivo exacto que `CodeIntelligenceMcpServer`
 * (evitar que el modelo tenga que completar una ruta absoluta real, causa
 * confirmada de alucinación en 6p, `docs/roadmap-maestro.md`).
 *
 * `sessionId: "mcp"` es un valor fijo, no una sesión real — mismo estado
 * que `CodeIntelligenceMcpServer` (no existe `AgentSession` persistida
 * todavía).
 */
export interface GitMcpServerOptions {
  readonly repoRoot: string;
  readonly workingTreeSource: IGitWorkingTreeSource;
}

/**
 * Nombre de la variable de entorno que `git-server.ts` lee para conocer
 * `repoRoot` al arrancar como proceso spawneado — mismo patrón que
 * `CODE_INTELLIGENCE_REPO_ROOT_ENV`.
 */
export const GIT_REPO_ROOT_ENV = "GUERRERO_GIT_REPO_ROOT";

const MCP_SESSION_ID = "mcp";

const TOOL_GIT_STATUS = "git_status";
const TOOL_GIT_DIFF = "git_diff";
const TOOL_GIT_LOG = "git_log";

/**
 * Nombres reales (sin prefijo de servidor MCP) de los tres tools que
 * registra `buildGitMcpServer()` — exportados como única fuente de verdad,
 * mismo motivo que `CODE_INTELLIGENCE_TOOL_NAMES`: el composition root
 * (`apps/cli/src/commands/agent.ts`) construye los nombres prefijados
 * reales (`{serverId}_{toolName}`) que necesita tanto para
 * `Config.permission` como para `AllowScopedMutationRule`, sin duplicar
 * los strings literales en otro package.
 */
export const GIT_TOOL_NAMES = [TOOL_GIT_STATUS, TOOL_GIT_DIFF, TOOL_GIT_LOG] as const;

export function buildGitMcpServer(options: GitMcpServerOptions): McpServer {
  const handler = new GitToolHandler(options.workingTreeSource);
  const server = new McpServer({ name: "guerrero-dev-git", version: "0.1.0" });
  const { repoRoot } = options;

  server.registerTool(
    TOOL_GIT_STATUS,
    {
      description:
        "Muestra el estado real del working tree de este proyecto (archivos modificados, agregados, borrados o sin trackear), vía `git status --porcelain=v1`. Sin argumentos.",
      inputSchema: {},
    },
    (args) => callHandler(handler, repoRoot, TOOL_GIT_STATUS, args),
  );
  server.registerTool(
    TOOL_GIT_DIFF,
    {
      description:
        "Muestra el diff real (staged + unstaged) de este proyecto desde el último commit, vía `git diff HEAD`. `filePath` opcional (ruta relativa a la raíz del proyecto) acota el diff a un único archivo.",
      inputSchema: { filePath: z.string().min(1).optional() },
    },
    (args) => callHandler(handler, repoRoot, TOOL_GIT_DIFF, args),
  );
  server.registerTool(
    TOOL_GIT_LOG,
    {
      description:
        "Lista los commits más recientes de este proyecto (hash, autor, fecha, asunto), vía `git log`. `limit` opcional, entero positivo (default 20).",
      inputSchema: { limit: z.number().int().positive().optional() },
    },
    (args) => callHandler(handler, repoRoot, TOOL_GIT_LOG, args),
  );

  return server;
}

/** Cuerpo compartido de los tres tools de arriba — mismo criterio que `CodeIntelligenceMcpServer.callHandler`. */
async function callHandler(
  handler: GitToolHandler,
  repoRoot: string,
  toolName: string,
  args: Record<string, unknown>,
): Promise<CallToolResult> {
  const request: ToolRequest = {
    id: randomUUID(),
    sessionId: MCP_SESSION_ID,
    toolName,
    input: args,
    requestedAt: new Date(),
  };

  try {
    const result = await handler.handle(request, repoRoot);
    return { content: [{ type: "text", text: JSON.stringify(result) }] };
  } catch (error) {
    return { content: [{ type: "text", text: toErrorText(error) }], isError: true };
  }
}

function toErrorText(error: unknown): string {
  if (error instanceof GitToolHandlerError) {
    return `${error.reason}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
