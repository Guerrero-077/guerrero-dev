import { beforeEach, describe, expect, it } from "vitest";
import { loadConfig, resetConfigCache } from "./config.js";

describe("loadConfig", () => {
  beforeEach(() => {
    resetConfigCache();
  });

  it("aplica defaults cuando el entorno está vacío", () => {
    const config = loadConfig({});

    expect(config.NODE_ENV).toBe("development");
    expect(config.API_PORT).toBe(3000);
    expect(config.DATABASE_URL).toContain("postgresql://");
    expect(config.OLLAMA_EMBEDDING_MODEL).toBe("qwen3-embedding:4b");
    expect(config.EMBEDDING_DIMENSIONS).toBe(1024);
  });

  it("respeta EMBEDDING_DIMENSIONS y OLLAMA_EMBEDDING_MODEL provistos por el entorno", () => {
    const config = loadConfig({
      OLLAMA_EMBEDDING_MODEL: "qwen3-embedding:8b",
      EMBEDDING_DIMENSIONS: "2560",
    });

    expect(config.OLLAMA_EMBEDDING_MODEL).toBe("qwen3-embedding:8b");
    expect(config.EMBEDDING_DIMENSIONS).toBe(2560);
  });

  it("respeta valores provistos por el entorno", () => {
    const config = loadConfig({
      NODE_ENV: "production",
      API_PORT: "8080",
      DATABASE_URL: "postgresql://user:pass@db:5432/name",
    });

    expect(config.NODE_ENV).toBe("production");
    expect(config.API_PORT).toBe(8080);
    expect(config.DATABASE_URL).toBe("postgresql://user:pass@db:5432/name");
  });

  it("lanza un error legible cuando un valor es inválido", () => {
    expect(() => loadConfig({ NODE_ENV: "not-a-real-env" })).toThrow(/Configuración inválida/);
  });

  it("cachea el resultado entre llamadas", () => {
    const first = loadConfig({ API_PORT: "4000" });
    const second = loadConfig({ API_PORT: "5000" });

    expect(second).toBe(first);
    expect(second.API_PORT).toBe(4000);
  });
});
