import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { GitWorkingTreeSource } from "@guerrero-dev/infrastructure";
import { GIT_REPO_ROOT_ENV, buildGitMcpServer } from "./GitMcpServer.js";

/**
 * Entrypoint real, pensado para spawnearse como proceso local vía
 * `Config.mcp[name]` de OpenCode (`McpLocalConfig.command`), nunca
 * importado directamente por otro package — mismo motivo que `server.ts`
 * (Code Intelligence): vive en `dist/git-server.js`, no se exporta desde
 * `index.ts`.
 *
 * `repoRoot` llega por la variable de entorno `GIT_REPO_ROOT_ENV`, fijada
 * por quien spawnea este proceso — ver el JSDoc de `GitMcpServer.ts`.
 */

async function main(): Promise<void> {
  const repoRoot = process.env[GIT_REPO_ROOT_ENV];
  if (!repoRoot) {
    throw new Error(
      `${GIT_REPO_ROOT_ENV} no está definida — este proceso espera que quien lo spawnee la fije con la ruta real del proyecto.`,
    );
  }

  const server = buildGitMcpServer({ repoRoot, workingTreeSource: new GitWorkingTreeSource() });
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
