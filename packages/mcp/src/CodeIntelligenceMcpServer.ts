import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import type { ToolRequest } from "@guerrero-dev/domain";
import {
  CodeIntelligenceToolHandler,
  CodeIntelligenceToolHandlerError,
  type ICodeAnalyzer,
  type ICodeLiteralSearch,
} from "@guerrero-dev/application";

/**
 * Fase 5.4c: primer servidor MCP real del repo, envuelve
 * `CodeIntelligenceToolHandler` (Fase 5.4b, application) para que un motor
 * de ejecución que hable MCP (OpenCode, `Config.mcp`) pueda invocar Code
 * Intelligence de verdad — el handler existía desde 5.4b pero no tenía
 * ningún consumidor real (verificado: cero referencias fuera de
 * `application/code-intelligence` antes de este archivo).
 *
 * `repoRoot` se recibe una sola vez, al construir el servidor — nunca como
 * argumento de un tool que el LLM tenga que completar. Decisión deliberada,
 * no arbitraria: 6p (`docs/roadmap-maestro.md`) encontró que
 * `qwen2.5:7b-instruct-q4_K_M` alucina rutas absolutas reales al armar
 * argumentos de tool calls (`read` con `C:\path\to\your\project\...`, 2/2
 * reproducido). El proceso que spawnea este servidor (composition root de
 * `guerrero agent run`) ya conoce la ruta real del proyecto
 * (`IProjectRepository`) — pasarla por variable de entorno al spawnear
 * (ver `server.ts`) evita reproducir el mismo fallo por diseño, no por
 * suerte.
 *
 * `sessionId: "mcp"` es un valor fijo, no una sesión real: no existe un
 * concepto de `AgentSession` persistida todavía (mismo estado que
 * `apps/cli/src/commands/agent.ts`, Fase 5.6) y `ToolRequest.sessionId` no
 * tiene ningún consumidor que le dé semántica a este valor en el camino
 * MCP — solo satisface el contrato de dominio.
 */
export interface CodeIntelligenceMcpServerOptions {
  readonly repoRoot: string;
  readonly codeAnalyzer: ICodeAnalyzer;
  readonly literalSearch: ICodeLiteralSearch;
}

/**
 * Nombre de la variable de entorno que `server.ts` lee para conocer
 * `repoRoot` al arrancar como proceso spawneado — exportada acá (no solo
 * usada en `server.ts`) para que el composition root que lo spawnea
 * (`McpLocalConfig.environment`) y este servidor compartan un único punto
 * de verdad sobre el nombre, en vez de repetir el string literal en dos
 * packages.
 */
export const CODE_INTELLIGENCE_REPO_ROOT_ENV = "GUERRERO_CODE_INTELLIGENCE_REPO_ROOT";

const MCP_SESSION_ID = "mcp";

const TOOL_FIND_SYMBOLS_BY_NAME = "find_symbols_by_name";
const TOOL_GET_DEPENDENCIES = "get_dependencies";
const TOOL_GET_DEPENDENTS = "get_dependents";
const TOOL_SEARCH_LITERAL = "search_literal";

/**
 * Nombres reales (sin prefijo de servidor MCP) de los cuatro tools que
 * registra `buildCodeIntelligenceMcpServer()` — exportados como única
 * fuente de verdad (Fase 5.4c-6n) para que el composition root
 * (`apps/cli/src/commands/agent.ts`) pueda construir los nombres
 * prefijados reales (`{serverId}_{toolName}`, ver JSDoc de
 * `apps/cli/src/commands/agent.ts`) que necesita tanto para
 * `Config.permission` como para `AllowReadRule`, sin duplicar los cuatro
 * strings literales en otro package y arriesgar que diverjan.
 */
export const CODE_INTELLIGENCE_TOOL_NAMES = [
  TOOL_FIND_SYMBOLS_BY_NAME,
  TOOL_GET_DEPENDENCIES,
  TOOL_GET_DEPENDENTS,
  TOOL_SEARCH_LITERAL,
] as const;

export function buildCodeIntelligenceMcpServer(
  options: CodeIntelligenceMcpServerOptions,
): McpServer {
  const handler = new CodeIntelligenceToolHandler(options.codeAnalyzer, options.literalSearch);
  const server = new McpServer({ name: "guerrero-dev-code-intelligence", version: "0.1.0" });
  const { repoRoot } = options;

  server.registerTool(
    TOOL_FIND_SYMBOLS_BY_NAME,
    {
      description:
        "Busca símbolos de código (clases, funciones, interfaces, etc.) por nombre exacto en el árbol .ts trackeado por Git de este proyecto.",
      inputSchema: { name: z.string().min(1) },
    },
    (args) => callHandler(handler, repoRoot, TOOL_FIND_SYMBOLS_BY_NAME, args),
  );
  server.registerTool(
    TOOL_GET_DEPENDENCIES,
    {
      description:
        "Lista los imports salientes (dependencias) de un archivo .ts de este proyecto, dada su ruta relativa al repositorio.",
      inputSchema: { filePath: z.string().min(1) },
    },
    (args) => callHandler(handler, repoRoot, TOOL_GET_DEPENDENCIES, args),
  );
  server.registerTool(
    TOOL_GET_DEPENDENTS,
    {
      description:
        "Lista los archivos .ts de este proyecto que importan un archivo dado (dependientes), dada su ruta relativa al repositorio.",
      inputSchema: { filePath: z.string().min(1) },
    },
    (args) => callHandler(handler, repoRoot, TOOL_GET_DEPENDENTS, args),
  );
  server.registerTool(
    TOOL_SEARCH_LITERAL,
    {
      description:
        "Busca un texto literal en el árbol .ts trackeado por Git de este proyecto (sin AST, coincidencia de texto).",
      inputSchema: { query: z.string().min(1) },
    },
    (args) => callHandler(handler, repoRoot, TOOL_SEARCH_LITERAL, args),
  );

  return server;
}

/**
 * Cuerpo compartido de los cuatro tools de arriba — deliberadamente no
 * genérico sobre el `Shape` de cada schema de Zod: intentarlo (una versión
 * anterior de este archivo lo hacía) rompe la inferencia de
 * `McpServer.registerTool()` entre `inputSchema` y el tipo de `args` del
 * callback (el SDK resuelve `InputArgs` contra el objeto literal en cada
 * call site, no a través de un parámetro de tipo indirecto). `args` llega
 * como `Record<string, unknown>` a propósito: cada schema de arriba ya
 * validó su forma antes de que el SDK invoque este callback.
 */
async function callHandler(
  handler: CodeIntelligenceToolHandler,
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
  if (error instanceof CodeIntelligenceToolHandlerError) {
    return `${error.reason}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
