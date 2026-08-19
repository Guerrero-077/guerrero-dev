import { randomUUID } from "node:crypto";
import { userInfo } from "node:os";
import { Command } from "commander";
import type { AgentTask } from "@guerrero-dev/domain";
import { AgentOrchestrator, ContextBuilder, PolicyEvaluator } from "@guerrero-dev/agent-core";
import { MemoryRanker, MemoryRetriever, ProjectIntelligenceProvider } from "@guerrero-dev/application";
import { OpenCodeExecutionEngine } from "@guerrero-dev/execution";
import {
  createDrizzleClient,
  DrizzleMemoryCandidateRetriever,
  DrizzleProjectIntelligenceRepository,
  loadConfig,
  OllamaEmbeddingProvider,
  OllamaProvider,
} from "@guerrero-dev/infrastructure";
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";
import { createCliContext } from "../context.js";

/**
 * Primer composition root real (Fase 5.6): cablea de punta a punta las
 * piezas ya reales de Fase 5.1-5.5b — `OllamaProvider` (LLM),
 * `ContextBuilder` (Memory + Project Intelligence, con sus
 * dependencias reales de Drizzle/Ollama), `PolicyEvaluator`
 * (`IPolicyEngine`, sin reglas registradas — fail-closed a propósito,
 * ver JSDoc de `PolicyEvaluator`) y `OpenCodeExecutionEngine` (levanta
 * un servidor `opencode` real por invocación). `project.path` real
 * (`IProjectRepository`, ya cableado en `CliContext`) alimenta
 * `AgentTask.projectRootPath` — no se inventa una ruta.
 *
 * `userId` usa el usuario real del sistema operativo (`node:os`): no
 * existe ningún sistema de autenticación en el repo todavía, y
 * fabricar un concepto de cuenta sin evidencia sería peor que usar el
 * dato real disponible. `sessionId` es un UUID nuevo por invocación —
 * `AgentSession` no se persiste todavía (mismo estado que
 * `apps/api/src/routes/sessions.ts`), así que cada corrida es efímera.
 *
 * Fase 5.7: `createOpencodeServer()` recibe un `Config.provider` con
 * Ollama como provider OpenAI-compatible custom (`npm:
 * "@ai-sdk/openai-compatible"`, `options.baseURL` apuntando a
 * `OLLAMA_BASE_URL` + `/v1`) — sin cuenta cloud, coherente con
 * `docs/adr/0003-opencode-primero.md`. `OpenCodeExecutionEngine` recibe
 * el mismo id (`OLLAMA_PROVIDER_ID`) para incluirlo en cada
 * `session.prompt()`.
 */
export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Ejecuta al agente de Guerrero Dev");

  agent
    .command("run <projectId> <instruction>")
    .description("Corre una instrucción real contra un proyecto registrado")
    .action(async (projectId: string, instruction: string) => {
      const ctx = createCliContext();
      let server: Awaited<ReturnType<typeof createOpencodeServer>> | undefined;

      try {
        const project = await ctx.getProject.execute(projectId);
        if (!project) {
          console.error(`✗ No existe un proyecto con id ${projectId}. Usa \`guerrero project list\`.`);
          process.exitCode = 1;
          return;
        }

        const config = loadConfig();
        const db = createDrizzleClient(ctx.pool);

        const llmProvider = new OllamaProvider(config.OLLAMA_BASE_URL);
        const embeddingProvider = new OllamaEmbeddingProvider(
          config.OLLAMA_BASE_URL,
          config.OLLAMA_EMBEDDING_MODEL,
          config.EMBEDDING_DIMENSIONS,
        );
        const memoryRetriever = new MemoryRetriever(
          embeddingProvider,
          new DrizzleMemoryCandidateRetriever(db),
          new MemoryRanker(),
        );
        const projectIntelligenceProvider = new ProjectIntelligenceProvider(
          new DrizzleProjectIntelligenceRepository(db),
        );
        const contextBuilder = new ContextBuilder(projectIntelligenceProvider, memoryRetriever);
        const policyEngine = new PolicyEvaluator();

        const OLLAMA_PROVIDER_ID = "ollama";
        server = await createOpencodeServer({
          config: {
            provider: {
              [OLLAMA_PROVIDER_ID]: {
                npm: "@ai-sdk/openai-compatible",
                name: "Ollama (local)",
                options: { baseURL: new URL("/v1", config.OLLAMA_BASE_URL).toString() },
                models: { [config.OLLAMA_DEFAULT_MODEL]: {} },
              },
            },
          },
        });
        const client = createOpencodeClient({ baseUrl: server.url });
        const executionEngine = new OpenCodeExecutionEngine(client, policyEngine, OLLAMA_PROVIDER_ID);

        const orchestrator = new AgentOrchestrator(
          executionEngine,
          policyEngine,
          contextBuilder,
          llmProvider,
        );

        const task: AgentTask = {
          id: randomUUID(),
          sessionId: randomUUID(),
          projectId: project.id,
          userId: userInfo().username,
          projectRootPath: project.path,
          instruction,
          modelName: config.OLLAMA_DEFAULT_MODEL,
        };

        const result = await orchestrator.run(task);

        console.log(`Estado: ${result.status}`);
        if (result.output) console.log(`\nSalida:\n${result.output}`);
        if (result.errorMessage) console.error(`\nError: ${result.errorMessage}`);
        if (result.status !== "succeeded") process.exitCode = 1;
      } catch (err) {
        console.error(`✗ ${err instanceof Error ? err.message : String(err)}`);
        process.exitCode = 1;
      } finally {
        server?.close();
        await ctx.dispose();
        // `server.close()` (@opencode-ai/sdk) no libera el proceso hijo real
        // de `opencode` de forma que Node pueda salir solo — verificado en
        // esta sesión: sin este exit explícito, el proceso queda colgado
        // indefinidamente después de que todo el trabajo real ya terminó
        // (stdout ya impreso, exitCode ya fijado). Salida forzada, no un
        // atajo — ver docs/roadmap-maestro.md §7 (Fase 5.6).
        process.exit(process.exitCode ?? 0);
      }
    });
}
