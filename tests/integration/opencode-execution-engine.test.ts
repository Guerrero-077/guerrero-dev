import { createOpencodeClient, createOpencodeServer } from "@opencode-ai/sdk";
import { OpenCodeExecutionEngine } from "@guerrero-dev/execution";
import type { AgentTask } from "@guerrero-dev/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test de integración (Fase 5.5): valida `OpenCodeExecutionEngine`
 * contra un servidor `opencode` real, levantado como subproceso vía
 * `createOpencodeServer()` (`@opencode-ai/sdk`, que a su vez invoca el
 * binario `opencode` del paquete `opencode-ai` — ver
 * `docs/adr/0003-opencode-primero.md`). Se salta si
 * RUN_INTEGRATION_TESTS no está en "true" (mismo patrón que el resto
 * de tests/integration/).
 *
 * A diferencia de `ollama-provider.test.ts` (Fase 5.1, sin poder
 * ejecutarse en el sandbox de esa sesión), el ciclo de vida del
 * servidor OpenCode **sí se verificó real en este sandbox** antes de
 * escribir este archivo (arranca, sirve su spec OpenAPI, sin red
 * externa) — por eso `plan()` (que solo crea una sesión, sin invocar
 * ningún LLM) se ejercita de verdad acá.
 *
 * `execute()` con un prompt que realmente llegue a un LLM queda fuera
 * de este archivo: requiere un provider configurado (Ollama u otro) y
 * este sandbox no tiene Ollama alcanzable (mismo hallazgo de Fase 5.1).
 * Verificar `execute()` end-to-end contra un LLM real queda para la
 * máquina de Santiago.
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

describe.skipIf(!RUN)("OpenCodeExecutionEngine (integration, contra un servidor opencode real)", () => {
  let server: Awaited<ReturnType<typeof createOpencodeServer>>;
  let engine: OpenCodeExecutionEngine;

  beforeAll(async () => {
    server = await createOpencodeServer({ hostname: "127.0.0.1", port: 41414, timeout: 20000 });
    const client = createOpencodeClient({ baseUrl: server.url });
    engine = new OpenCodeExecutionEngine(client);
  }, 30000);

  afterAll(() => {
    server?.close();
  });

  it("plan() crea una sesión real: session.get() la encuentra después", async () => {
    const task: AgentTask = {
      id: "task-1",
      sessionId: "session-1",
      projectId: "project-1",
      userId: "user-1",
      projectRootPath: process.cwd(),
      instruction: "responde únicamente con la palabra: hola",
      modelName: "gemma3:4b",
    };

    const plan = await engine.plan(task);

    expect(typeof plan.id).toBe("string");
    expect(plan.id.length).toBeGreaterThan(0);
    expect(plan.steps).toEqual([{ description: task.instruction }]);

    const client = createOpencodeClient({ baseUrl: server.url });
    const found = await client.session.get({ path: { id: plan.id } });
    expect(found.error).toBeUndefined();
    expect(found.data?.id).toBe(plan.id);
  }, 20000);
});
