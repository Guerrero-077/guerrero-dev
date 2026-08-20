/**
 * @guerrero-dev/mcp
 *
 * Servidores MCP reales de Guerrero Dev. `CodeIntelligenceMcpServer`
 * (Fase 5.4c): expone `CodeIntelligenceToolHandler` (`application`) como
 * tools MCP reales. `GitMcpServer`: expone `GitToolHandler`
 * (`application/git-tools`) — status/diff/log del working tree actual.
 * Ambos invocables por un motor de ejecución que hable el protocolo
 * (OpenCode, vía `Config.mcp`).
 */
export * from "./CodeIntelligenceMcpServer.js";
export * from "./GitMcpServer.js";
