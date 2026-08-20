/**
 * application/git-tools
 *
 * Herramientas de Git que el agente invoca en runtime sobre el working
 * tree real de un proyecto (`git_status`/`git_diff`/`git_log`), vía MCP
 * (`@guerrero-dev/mcp`, `GitMcpServer`) — mismo patrón que
 * application/code-intelligence. Puerto (`IGitWorkingTreeSource`) +
 * dispatch (`GitToolHandler`); la implementación real contra Git vive en
 * infrastructure/git.
 *
 * Distinto de los puertos de Git ya existentes en `common/ports`
 * (`IGitTrackedFilesSource`, Project Intelligence) y `memory/ports`
 * (`IGitHistorySource`, formación de Memory): esos leen estado comiteado
 * para pipelines batch; este observa el working tree actual como
 * herramienta invocada por el propio agente.
 */
export * from "./models/index.js";
export * from "./ports/index.js";
export * from "./services/index.js";
