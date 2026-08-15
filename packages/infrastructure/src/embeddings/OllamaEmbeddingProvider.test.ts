import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OllamaEmbeddingProvider } from "./OllamaEmbeddingProvider.js";

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function randomVector(dims: number): number[] {
  return Array.from({ length: dims }, () => Math.random() * 2 - 1);
}

describe("OllamaEmbeddingProvider", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("trunca el vector nativo a `dimensions` y lo renormaliza (norma L2 = 1)", async () => {
    const native = randomVector(2560);
    fetchMock.mockResolvedValueOnce(jsonResponse({ model: "qwen3-embedding:4b", embeddings: [native] }));

    const provider = new OllamaEmbeddingProvider("http://localhost:11434", "qwen3-embedding:4b", 1024);
    const embedding = await provider.embed("El proyecto usa Clean Architecture.");

    expect(embedding.model).toBe("qwen3-embedding:4b");
    expect(embedding.dimensions).toBe(1024);
    expect(embedding.values).toHaveLength(1024);
    expect(embedding.values.slice(0, 5)).not.toEqual(native.slice(0, 5)); // renormalizado, no crudo

    const norm = Math.sqrt(embedding.values.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("embedBatch hace una sola llamada HTTP para N textos", async () => {
    const texts = ["uno", "dos", "tres"];
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        model: "qwen3-embedding:4b",
        embeddings: texts.map(() => randomVector(2560)),
      }),
    );

    const provider = new OllamaEmbeddingProvider("http://localhost:11434", "qwen3-embedding:4b", 1024);
    const embeddings = await provider.embedBatch(texts);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ model: "qwen3-embedding:4b", input: texts });
    expect(embeddings).toHaveLength(3);
  });

  it("embedBatch([]) no llama a Ollama", async () => {
    const provider = new OllamaEmbeddingProvider("http://localhost:11434", "qwen3-embedding:4b", 1024);
    const embeddings = await provider.embedBatch([]);

    expect(embeddings).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("lanza un error legible si Ollama responde con status distinto de 2xx", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500));

    const provider = new OllamaEmbeddingProvider("http://localhost:11434", "qwen3-embedding:4b", 1024);
    await expect(provider.embed("texto")).rejects.toThrow(/Ollama respondió 500/);
  });

  it("lanza un error si el modelo devuelve menos dimensiones que las configuradas", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ model: "qwen3-embedding:4b", embeddings: [randomVector(512)] }),
    );

    const provider = new OllamaEmbeddingProvider("http://localhost:11434", "qwen3-embedding:4b", 1024);
    await expect(provider.embed("texto")).rejects.toThrow(/menos que las 1024 configuradas/);
  });

  it("lanza un error si la cantidad de embeddings devueltos no coincide con la cantidad de textos", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ model: "qwen3-embedding:4b", embeddings: [randomVector(2560)] }),
    );

    const provider = new OllamaEmbeddingProvider("http://localhost:11434", "qwen3-embedding:4b", 1024);
    await expect(provider.embedBatch(["uno", "dos"])).rejects.toThrow(/1 embeddings para 2 textos/);
  });

  it("aborta y lanza un error legible si Ollama no responde dentro del timeout", async () => {
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

    const provider = new OllamaEmbeddingProvider("http://localhost:11434", "qwen3-embedding:4b", 1024, 5);
    await expect(provider.embed("texto")).rejects.toThrow(/no respondió dentro de 5ms/);
  });
});
