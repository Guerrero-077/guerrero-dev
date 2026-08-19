import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
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
} from "@guerrero-dev/infrastructure";
import { CODE_INTELLIGENCE_REPO_ROOT_ENV } from "@guerrero-dev/mcp";
import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";
import { createCliContext } from "../context.js";

const require = createRequire(import.meta.url);

/**
 * Fase 5.4c: ruta real al servidor MCP de Code Intelligence, compilado por
 * `@guerrero-dev/mcp` (subpath `./server`, no exportado desde `.` — ver su
 * JSDoc). `require.resolve` respeta los `exports` del `package.json` real
 * y no asume ninguna estructura de directorios del monorepo.
 */
const CODE_INTELLIGENCE_MCP_SERVER_PATH = require.resolve("@guerrero-dev/mcp/server");

/**
 * Nombre del servidor MCP tal como aparece en `Config.mcp`. OpenCode
 * expone cada tool de un servidor MCP local prefijado con este nombre
 * (`{id}_{toolName}`, p. ej. `code-intelligence_find_symbols_by_name`) —
 * verificado real con un proxy HTTP interceptando el `POST
 * /v1/chat/completions` real hacia Ollama (mismo método que 5.14/6o), no
 * asumido de la documentación de MCP.
 */
const CODE_INTELLIGENCE_MCP_SERVER_ID = "code-intelligence";

/**
 * Fase 5.9c: red de seguridad, no fix de causa raíz. Verificando 5.9b con
 * `qwen2.5:7b-instruct-q4_K_M`, el modelo llamó `read` con
 * `filePath: "/path/to/your/file.txt"` — un placeholder literal, copiado
 * del propio texto de un error de esquema anterior en vez de sustituirlo
 * por la ruta real — que OpenCode interpretó como fuera del proyecto y
 * disparó permiso `external_directory`. Ese permiso quedó en estado
 * `running` para siempre: `OpenCodeExecutionEngine.execute()` (Fase 5.5b)
 * nunca lo vio pasar por `handlePermissionEvents()` para evaluarlo y
 * responderlo. Hipótesis sin confirmar (no se pudo inspeccionar el
 * binario `opencode` en tiempo de ejecución): `event.subscribe()` se
 * suscribe con `query: { directory: policyContext.projectRootPath }` —
 * un permiso de directorio EXTERNO al proyecto podría quedar fuera de ese
 * filtro server-side, exactamente la categoría de evento más
 * security-sensible para perder. `session.prompt()` nunca resuelve
 * mientras esa sesión espera esa respuesta — deadlock real, sin relación
 * con el hang de Fase 5.7b (ese ya estaba resuelto: acá `session.prompt()`
 * jamás llega a resolver, no es que el listener no se cierre después).
 * `EXECUTION_TIMEOUT_MS` activa `options.timeoutMs` (puerto
 * `IExecutionEngine`, ya soportado desde Fase 5.7b pero nunca antes
 * pasado desde ningún composition root real) como cota dura: convierte
 * un deadlock silencioso en `Estado: failed` con `reason: "timeout"` en
 * vez de un proceso colgado para siempre. No resuelve la causa — la dejo
 * documentada en `docs/roadmap-maestro.md` como pendiente de auditoría.
 * Reproducido en 2/2 corridas — no es un caso raro.
 */
const EXECUTION_TIMEOUT_MS = 120_000;

/**
 * Fase 5.10: por qué preguntas de solo lectura ("lee package.json y
 * decime qué dependencias tiene") no obtenían respuesta de texto incluso
 * con Fase 5.9d/5.9e ya arregladas. `read` nunca pasa por
 * `IPolicyEngine` — no es una categoría de `Config.permission`, así que
 * un `PolicyRule` no cambia nada ahí. El bloqueo real: con
 * `qwen2.5:7b-instruct-q4_K_M`, después de leer el archivo el modelo
 * intentaba de más (reescribir el archivo con el texto numerado que le
 * devolvió `read`, o buscar en la web algo no pedido) — esa tool call
 * quedaba denegada (`edit`/`bash`/`webfetch` gateadas a `"ask"`,
 * `PolicyEvaluator` fail-closed sin reglas) y OpenCode no le daba al
 * modelo otro turno para responder en texto — el turno terminaba en
 * `finish: "tool-calls"`, sin ninguna parte de texto (Fase 5.9e).
 *
 * Verificado real (levantando `opencode serve` a mano con la config real
 * de este archivo): `Config.tools` a nivel raíz NO restringe lo que el
 * agente `build` puede intentar — probado, el modelo llamó `webfetch`
 * igual con `tools.webfetch: false` en la raíz. Recién bajo
 * `Config.agent.build.tools` (specific al agente `build`, el que
 * `agent=build` en los logs confirma que se usa acá) el modelo dejó de
 * poder invocar esas tools — y, sin la posibilidad de desviarse, leyó el
 * archivo y respondió en texto (`finish: "stop"`, no `"tool-calls"`).
 *
 * `DISABLED_TOOLS` apaga exactamente las tools de escritura/red/ejecución
 * (`bash`, `edit`, `write`, `webfetch`, `websearch`, `apply_patch`) del
 * agente `build` — `read`/`glob`/`grep` (solo lectura) quedan
 * habilitadas. Esto es coherente con dónde está el proyecto hoy (Fase 5,
 * roadmap unificado — "Agent Core real, LLM conectado", sin acciones
 * reales todavía; escritura de archivos es Fase 6 — Developer Tools, no
 * iniciada) — no es una limitación arbitraria, es el alcance real de
 * esta fase. `permission: {edit,bash,webfetch}: "ask"` (Fase 5.9b) queda
 * intacto como segunda capa: si en el futuro se reactiva alguna de estas
 * tools acá sin recordar tocar este archivo, `IPolicyEngine` fail-closed
 * las sigue denegando igual.
 */
const DISABLED_TOOLS = {
  bash: false,
  edit: false,
  write: false,
  webfetch: false,
  websearch: false,
  apply_patch: false,
} as const;

/**
 * Fase 5.12: verificando Fase 5.11 (subagentes ya visibles para
 * `IPolicyEngine`) end-to-end, el modelo no repitió el camino del
 * subagente esa vez — en cambio, tanto el agente `build` como un
 * subagente `general` (spawneado vía `task`, que sigue habilitada)
 * entraron en loops que nunca convergían (`todowrite` repetido sin fin
 * en un caso, o simplemente más pasos de los necesarios en otro),
 * terminando recién cuando `EXECUTION_TIMEOUT_MS` cortaba a los 120s —
 * mitigado, no evitado.
 *
 * `MAX_AGENT_STEPS` activa `AgentConfig.maxSteps` ("Maximum number of
 * agentic iterations before forcing text-only response",
 * `@opencode-ai/sdk/dist/gen/types.gen.d.ts`) — verificado real,
 * levantando `opencode serve` a mano: con `maxSteps: 1` corta antes de
 * poder ni siquiera leer un archivo (muy agresivo); con `maxSteps: 3` ya
 * alcanza para el flujo normal completo (leer + responder en texto,
 * verificado con contenido real, no truncado); `6` da margen extra sin
 * acercarse a los 18-20+ pasos de un loop real. Tiene que declararse en
 * CADA agente que puede correr, no solo `build`: un subagente `general`
 * (vía `task`) corre bajo su propia config de agente, sin heredar el
 * `maxSteps` de `build` — confirmado real: con `maxSteps` solo en
 * `build`, un pedido de escritura que se canalizó vía subagente siguió
 * sin converger hasta el timeout; agregando `general: {maxSteps}`
 * también, el mismo pedido resolvió en ~23s. `general` es el único otro
 * agente real que se ejercitó hasta ahora (vía `task`) — si en el
 * futuro aparece evidencia de otro agente (`plan`, `explore`) corriendo
 * acá, se audita entonces, no se adivina ahora.
 */
const MAX_AGENT_STEPS = 6;

/**
 * Primer composition root real (Fase 5.6): cablea de punta a punta las
 * piezas ya reales de Fase 5.1-5.5b — `ContextBuilder` (Memory +
 * Project Intelligence, con sus
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
 *
 * Fase 5.8: `--model` opcional permite elegir qué modelo de Ollama usa
 * la corrida, sin editar `OLLAMA_DEFAULT_MODEL`. Motivo real: la
 * primera corrida end-to-end (Fase 5.7, `gemma3:4b`) devolvió una tool
 * call como JSON en texto plano en vez de una tool call real
 * interceptada por el puente de Fase 5.5b — hipótesis sin confirmar
 * sobre soporte de tool-calling del modelo, no del wiring. Este flag
 * permite repetir el experimento con otros modelos ya descargados
 * (p. ej. `qwen2.5-coder:7b`) sin tocar variables de entorno.
 *
 * Fase 5.9: `tool_call: true` agregado en la entrada del modelo — campo
 * real del SDK instalado (`ProviderConfig.models[key].tool_call?:
 * boolean`, `@opencode-ai/sdk/dist/gen/types.gen.d.ts`), sin el cual
 * OpenCode nunca declara herramientas estructuradas al proveedor. Es
 * necesario pero NO fue suficiente para el síntoma original: probado
 * directo contra `POST /api/chat` de Ollama (sin pasar por OpenCode) con
 * un `tools` real declarado, `qwen2.5-coder:7b` devuelve el tool call
 * como `content` de texto plano en vez de `tool_calls` estructurado, de
 * forma consistente (3/3) — su propio template (`ollama show
 * qwen2.5-coder:7b --template`) exige envolver la respuesta en
 * `<tool_call>...</tool_call>`, pero el modelo no lo hace. Es una
 * limitación de esa cuantización/checkpoint específica, no del wiring de
 * OpenCode ni de este flag. `qwen2.5:7b-instruct-q4_K_M` (mismo peso,
 * mismo host) sí lo hace de forma consistente (2/2, verificado real) y
 * es la elección recomendada hoy para `agent run`. `tool_call: true`
 * queda incondicional acá de todos modos: si el modelo no soporta tools
 * en absoluto (p. ej. `gemma3:4b`), Ollama devuelve un 400 explícito
 * ("does not support tools") que se propaga limpio como `Estado: failed`
 * (fix de Fase 5.7b) — nunca degrada en silencio a texto plano.
 *
 * Fase 5.9b: brecha de seguridad real encontrada al verificar 5.9 con
 * `qwen2.5:7b-instruct-q4_K_M` (el primer modelo que sí dispara
 * tool-calling estructurado real): el log de `opencode serve` mostró
 * `evaluated permission=webfetch ... action.action=allow` repetido en
 * cada paso, sin que `OpenCodeExecutionEngine.handlePermissionEvents()`
 * (Fase 5.5b) viera jamás un `permission.updated` para esa sesión —
 * `IPolicyEngine.evaluate()` nunca se llamó. Causa real: sin
 * `Config.permission` explícito, OpenCode resuelve `webfetch` a `allow`
 * por su propio default interno y jamás emite el evento — exactamente el
 * hueco que Fase 5.5b decía haber cerrado ("OpenCode ejecutaba tool
 * calls sin que nuestro PolicyEngine los viera"), seguía abierto para
 * esta categoría de tool. `permission: {edit,bash,webfetch}: "ask"`
 * fuerza que las tres categorías reales de tool que expone el agente
 * `build` de OpenCode (`Agent.permission`,
 * `@opencode-ai/sdk/dist/gen/types.gen.d.ts:1407-1415`) pasen siempre
 * por un `permission.updated` real, sin excepción — con
 * `PolicyEvaluator` fail-closed y sin reglas (comportamiento documentado
 * y esperado, ver `docs/roadmap-maestro.md` ítem 6c), esto deniega toda
 * tool call real hasta que existan `PolicyRule`s, que es exactamente la
 * garantía que esta clase dice ofrecer.
 *
 * Fase 5.14: `OllamaProvider` desaparece de este composition root. No es
 * una regresión: `AgentOrchestrator` ya no hace una inferencia propia
 * (era una llamada standalone a `ILLMProvider.generate()` cuyo resultado
 * nadie leía). El único LLM que corre la task es el que invoca OpenCode
 * vía el `Config.provider` de acá arriba — el mismo modelo, el mismo
 * `OLLAMA_BASE_URL`, una sola inferencia. El contexto real de
 * `ContextBuilder` ahora llega a ese modelo como `body.system` de
 * `session.prompt()` (ver `ExecutionOptions.systemPrompt` y el JSDoc de
 * `OpenCodeExecutionEngine`), que es lo que 5.2 prometía y no cumplía.
 *
 * Fase 5.4c: `Config.mcp` real. Auditando el estado de Fase 5.4b (Code
 * Intelligence expuesta al agente) se confirmó que `CodeIntelligenceToolHandler`
 * (`application`, ya cerrado y testeado desde 5.4b) tenía cero
 * consumidores reales — mismo patrón que 6n (`AllowReadRule`): código
 * cerrado, inalcanzable en runtime. El camino de dominio
 * (`ExecutionPlanStep.toolRequest` → `ToolSelector.selectToolSteps()`)
 * está muerto con el motor OpenCode (6n) — enchufar el handler ahí habría
 * sido igual de inerte. Verificado contra el SDK real
 * (`@opencode-ai/sdk@1.18.18`) que el único mecanismo real para tools
 * nuevas es un servidor MCP (`Config.mcp[id]`, `McpLocalConfig`) — ya
 * anticipado en el propio JSDoc de `ToolSelector` ("Cuando exista un
 * catálogo real de herramientas MCP"). `@guerrero-dev/mcp` (Fase 5.4c)
 * implementa el primer servidor MCP real del repo,
 * `CodeIntelligenceMcpServer`, envolviendo ese mismo handler.
 *
 * `environment: { [CODE_INTELLIGENCE_REPO_ROOT_ENV]: project.path }`:
 * `repoRoot` viaja por variable de entorno al spawnear, nunca como
 * argumento que el modelo tenga que completar — evita reproducir la
 * alucinación de rutas de 6p (el modelo inventando
 * `C:\path\to\your\project\...` en vez de la ruta real).
 *
 * **Hallazgo real de esta auditoría, no de wiring**: la primera vez que
 * se probó `Config.mcp` + `Config.provider` juntos contra este mismo
 * directorio (`guerrero-dev`), `opencode serve` devolvió `Unexpected
 * error / ServeError` de forma silenciosa (no fatal, el servidor HTTP
 * seguía respondiendo) y nunca llegó a spawnear el proceso MCP —
 * verificado con `Get-CimInstance Win32_Process`, cero procesos
 * `node ... server.js` corriendo. Aislado el problema (config vacía →
 * sin error; solo `provider` → sin error; solo `mcp` → sin error, pero
 * tampoco spawnea; ambos juntos → error) hasta un directorio de trabajo
 * nuevo, sin ningún error: `opencode` mantiene una "instancia" por
 * directorio persistida en `~/.local/share/opencode/opencode.db`, y un
 * primer intento roto contra un directorio deja esa instancia
 * envenenada — reintentos posteriores contra el mismo directorio, incluso
 * con config corregida, siguen fallando hasta usar un directorio nuevo.
 * No es un bug de este código: es una limitación operacional real de
 * `opencode serve` (versión 1.18.18) que no se investigó más a fondo acá
 * (causa raíz exacta sin confirmar, candidata a auditoría futura si
 * reaparece en uso real).
 *
 * **Verificado real, end-to-end**, con el mismo método de proxy HTTP de
 * 5.14/6o (`OLLAMA_BASE_URL` apuntado a un proxy local que loggea el
 * `POST /v1/chat/completions` real antes de reenviarlo a Ollama): los
 * cuatro tools de Code Intelligence aparecen en el array `tools` que
 * OpenCode le manda al modelo, prefijados
 * `code-intelligence_{toolName}` (confirma el JSDoc de arriba sobre el
 * naming), junto a los tools nativos (`bash`, `read`, `edit`, etc.) — en
 * un directorio de trabajo limpio, sin el problema de instancia
 * envenenada de arriba.
 */
export function registerAgentCommands(program: Command): void {
  const agent = program.command("agent").description("Ejecuta al agente de Guerrero Dev");

  agent
    .command("run <projectId> <instruction>")
    .description("Corre una instrucción real contra un proyecto registrado")
    .option("-m, --model <model>", "Modelo de Ollama a usar (default: OLLAMA_DEFAULT_MODEL)")
    .action(async (projectId: string, instruction: string, options: { model?: string }) => {
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
        const modelName = options.model ?? config.OLLAMA_DEFAULT_MODEL;
        const db = createDrizzleClient(ctx.pool);

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
                models: { [modelName]: { tool_call: true } },
              },
            },
            mcp: {
              [CODE_INTELLIGENCE_MCP_SERVER_ID]: {
                type: "local",
                command: [process.execPath, CODE_INTELLIGENCE_MCP_SERVER_PATH],
                environment: { [CODE_INTELLIGENCE_REPO_ROOT_ENV]: project.path },
              },
            },
            permission: { edit: "ask", bash: "ask", webfetch: "ask" },
            agent: {
              build: { tools: DISABLED_TOOLS, maxSteps: MAX_AGENT_STEPS },
              general: { maxSteps: MAX_AGENT_STEPS },
            },
          },
        });
        const client = createOpencodeClient({ baseUrl: server.url });
        const executionEngine = new OpenCodeExecutionEngine(client, policyEngine, OLLAMA_PROVIDER_ID);

        const orchestrator = new AgentOrchestrator(executionEngine, policyEngine, contextBuilder);

        const task: AgentTask = {
          id: randomUUID(),
          sessionId: randomUUID(),
          projectId: project.id,
          userId: userInfo().username,
          projectRootPath: project.path,
          instruction,
          modelName,
        };

        const result = await orchestrator.run(task, { timeoutMs: EXECUTION_TIMEOUT_MS });

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
