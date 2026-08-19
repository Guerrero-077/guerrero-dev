import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { FileReader, GitTrackedFilesSource, LiteralCodeSearch, TsMorphCodeAnalyzer } from "@guerrero-dev/infrastructure";
import { CODE_INTELLIGENCE_REPO_ROOT_ENV, buildCodeIntelligenceMcpServer } from "./CodeIntelligenceMcpServer.js";

/**
 * Entrypoint real (Fase 5.4c), pensado para spawnearse como proceso local
 * vía `Config.mcp[name]` de OpenCode (`McpLocalConfig.command`), nunca
 * importado directamente por otro package — por eso vive en `dist/server.js`
 * en vez de exportarse desde `index.ts`.
 *
 * `repoRoot` llega por la variable de entorno `CODE_INTELLIGENCE_REPO_ROOT_ENV`,
 * fijada por quien spawnea este proceso (composition root real de
 * `guerrero agent run`) — ver el JSDoc de `CodeIntelligenceMcpServer.ts`
 * para el motivo (evitar que el LLM tenga que adivinar una ruta absoluta,
 * causa real de 6p).
 */

async function main(): Promise<void> {
  const repoRoot = process.env[CODE_INTELLIGENCE_REPO_ROOT_ENV];
  if (!repoRoot) {
    throw new Error(
      `${CODE_INTELLIGENCE_REPO_ROOT_ENV} no está definida — este proceso espera que quien lo spawnee la fije con la ruta real del proyecto.`,
    );
  }

  const trackedFilesSource = new GitTrackedFilesSource();
  const fileReader = new FileReader();
  const server = buildCodeIntelligenceMcpServer({
    repoRoot,
    codeAnalyzer: new TsMorphCodeAnalyzer(trackedFilesSource, fileReader),
    literalSearch: new LiteralCodeSearch(trackedFilesSource, fileReader),
  });

  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
