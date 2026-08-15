import { ConfigurationError } from "@guerrero-dev/shared";
import { z } from "zod";

/**
 * Config system (Fase 3.9).
 *
 * Toda la configuración del sistema se carga desde variables de entorno y
 * se valida con zod al arrancar el proceso. Si falta o es inválida una
 * variable requerida, el proceso falla rápido con un mensaje claro en vez
 * de fallar más tarde de forma confusa.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),

  // PostgreSQL + pgvector
  DATABASE_URL: z.string().url().default("postgresql://guerrero:guerrero@localhost:5432/guerrero_dev"),

  // Ollama (local LLM runtime)
  OLLAMA_BASE_URL: z.string().url().default("http://localhost:11434"),
  OLLAMA_DEFAULT_MODEL: z.string().default("gemma3:4b"),

  // Embeddings (Fase 4.4 — docs/fase-4-memory-engine.md): qwen3-embedding:4b
  // vía Ollama, single provider para texto + código + español. 1024 es la
  // dimensión objetivo tras truncar el nativo 2560 vía MRL; queda pendiente
  // de validación por benchmark antes de fijar vector(1024) en PostgreSQL.
  OLLAMA_EMBEDDING_MODEL: z.string().default("qwen3-embedding:4b"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().default(1024),

  // Cloud LLM (opcional; abstracción vía LLM Gateway)
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

  // API
  API_PORT: z.coerce.number().int().positive().default(3000),
  API_HOST: z.string().default("0.0.0.0"),
});

export type AppConfig = z.infer<typeof envSchema>;

let cachedConfig: AppConfig | undefined;

/**
 * Carga y valida la configuración desde `process.env`. El resultado se
 * cachea: llamadas subsecuentes no vuelven a parsear.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const parsed = envSchema.safeParse(env);

  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new ConfigurationError(`Configuración inválida:\n${issues}`);
  }

  cachedConfig = parsed.data;
  return cachedConfig;
}

/** Solo para tests: permite resetear la config cacheada entre casos. */
export function resetConfigCache(): void {
  cachedConfig = undefined;
}
