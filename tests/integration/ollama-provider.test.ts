import { describe, expect, it } from "vitest";
import { loadConfig, OllamaProvider } from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 5.1): valida `OllamaProvider` contra un
 * Ollama real, vía `OLLAMA_BASE_URL` (`AppConfig`). Se salta si
 * RUN_INTEGRATION_TESTS no está en "true" (mismo patrón que el resto
 * de tests/integration/).
 *
 * Limitación conocida y documentada explícitamente (Fase 5.1,
 * auditoría real): el sandbox donde se implementó y verificó el resto
 * del gate de 5.1 no tiene binario de Ollama, no tiene servicio
 * corriendo, no tiene ruta de red hacia ollama.com (bloqueo de
 * política del proxy, 403, no se reintenta) y no tiene GPU — por lo
 * tanto este archivo se escribió y quedó **sin ejecutar** en esa
 * sesión. Es responsabilidad de quien lo ejecute (Santiago, en su
 * máquina real con Ollama corriendo) correr
 * `RUN_INTEGRATION_TESTS=true pnpm run test tests/integration/ollama-provider.test.ts`
 * para cerrar la verificación real de este adapter — no se reporta
 * "verificado" lo que no se pudo verificar en el sandbox.
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

describe.skipIf(!RUN)("OllamaProvider (integration, contra Ollama real)", () => {
  const config = loadConfig();
  const provider = new OllamaProvider(config.OLLAMA_BASE_URL);

  it("listAvailableModels() devuelve al menos un modelo instalado", async () => {
    const models = await provider.listAvailableModels();

    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider === "ollama")).toBe(true);
  });

  it("generate() con un prompt trivial produce una respuesta no vacía", async () => {
    const response = await provider.generate({
      modelName: config.OLLAMA_DEFAULT_MODEL,
      prompt: "Responde únicamente con la palabra: hola",
    });

    expect(typeof response).toBe("string");
    expect(response.length).toBeGreaterThan(0);
  });
});
