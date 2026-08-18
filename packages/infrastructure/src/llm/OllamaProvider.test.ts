import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider } from "./OllamaProvider.js";
import { OllamaProviderError } from "./OllamaProviderError.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function brokenJsonResponse(ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.reject(new SyntaxError("Unexpected token")),
  } as Response;
}

describe("OllamaProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("listAvailableModels", () => {
    it("mapea los modelos de /api/tags, con ramRequirementMb cuando hay size", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse({
          models: [{ name: "gemma3:4b", size: 4 * 1024 * 1024 * 1024 }, { name: "qwen2.5-coder:7b" }],
        }),
      );

      const provider = new OllamaProvider("http://localhost:11434");
      const models = await provider.listAvailableModels();

      expect(models).toEqual([
        {
          name: "gemma3:4b",
          provider: "ollama",
          contextWindow: 0,
          toolCalling: false,
          ramRequirementMb: 4096,
        },
        { name: "qwen2.5-coder:7b", provider: "ollama", contextWindow: 0, toolCalling: false },
      ]);
    });

    it("llama a GET /api/tags contra baseUrl", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ models: [] }));

      const provider = new OllamaProvider("http://localhost:11434");
      await provider.listAvailableModels();

      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.toString()).toBe("http://localhost:11434/api/tags");
      expect(init.method).toBe("GET");
    });

    it("lanza invalid_response si la respuesta no trae 'models'", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}));

      const provider = new OllamaProvider("http://localhost:11434");
      await expect(provider.listAvailableModels()).rejects.toMatchObject({
        reason: "invalid_response",
      });
    });
  });

  describe("generate", () => {
    it("envía model/prompt/system/stream:false a POST /api/generate y devuelve response", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({ response: "hola" }));

      const provider = new OllamaProvider("http://localhost:11434");
      const result = await provider.generate({
        modelName: "gemma3:4b",
        prompt: "di hola",
        system: "eres breve",
      });

      expect(result).toBe("hola");
      const [url, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
      expect(url.toString()).toBe("http://localhost:11434/api/generate");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body as string)).toEqual({
        model: "gemma3:4b",
        prompt: "di hola",
        system: "eres breve",
        stream: false,
      });
    });

    it("lanza invalid_response si la respuesta no trae 'response' como string", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}));

      const provider = new OllamaProvider("http://localhost:11434");
      await expect(provider.generate({ modelName: "gemma3:4b", prompt: "x" })).rejects.toMatchObject({
        reason: "invalid_response",
      });
    });
  });

  describe("errores comunes (aplican a ambos métodos, verificados sobre generate)", () => {
    it("lanza http_error si Ollama responde con status distinto de 2xx", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500));

      const provider = new OllamaProvider("http://localhost:11434");
      const error = await provider.generate({ modelName: "m", prompt: "x" }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OllamaProviderError);
      expect((error as OllamaProviderError).reason).toBe("http_error");
      expect((error as OllamaProviderError).message).toMatch(/Ollama respondió 500/);
    });

    it("lanza invalid_response si el body no es JSON válido", async () => {
      fetchMock.mockResolvedValueOnce(brokenJsonResponse());

      const provider = new OllamaProvider("http://localhost:11434");
      await expect(provider.generate({ modelName: "m", prompt: "x" })).rejects.toMatchObject({
        reason: "invalid_response",
      });
    });

    it("lanza unreachable si fetch falla por conexión (no por timeout)", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));

      const provider = new OllamaProvider("http://localhost:11434");
      await expect(provider.generate({ modelName: "m", prompt: "x" })).rejects.toMatchObject({
        reason: "unreachable",
      });
    });

    it("aborta y lanza timeout si Ollama no responde dentro del timeout configurado", async () => {
      fetchMock.mockImplementationOnce((_url: URL, init: RequestInit) => {
        return new Promise((_resolve, reject) => {
          const signal = init.signal as AbortSignal;
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      });

      const provider = new OllamaProvider("http://localhost:11434", 5);
      const error = await provider.generate({ modelName: "m", prompt: "x" }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(OllamaProviderError);
      expect((error as OllamaProviderError).reason).toBe("timeout");
      expect((error as OllamaProviderError).message).toMatch(/no respondió dentro de 5ms/);
    });
  });
});
