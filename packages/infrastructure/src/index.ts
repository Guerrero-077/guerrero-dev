/**
 * @guerrero-dev/infrastructure
 *
 * Implementaciones concretas de los puertos de `application` (Fase 3.6):
 * database/ (PostgreSQL + pgvector), llm/ (Ollama), embeddings/ (Ollama,
 * Fase 4.4), configuration/ (env + zod), logging/ (pino), git/, filesystem/,
 * project-intelligence/ (Fase 5.4), execution/ (placeholder).
 * Aquí, y solo aquí, el sistema conoce tecnologías externas concretas.
 */
export * from "./configuration/index.js";
export * from "./database/index.js";
export * from "./embeddings/index.js";
export * from "./filesystem/index.js";
export * from "./git/index.js";
export * from "./llm/index.js";
export * from "./logging/index.js";
export * from "./project-intelligence/index.js";
