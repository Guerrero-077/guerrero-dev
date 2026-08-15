/**
 * @guerrero-dev/application/memory
 *
 * Fase 4.6 (docs/fase-4-memory-engine.md §14d) — retrieval, en tres capas:
 *
 * - `ports/IMemoryCandidateRetriever`: retrieval semántico puro (adapter
 *   pgvector: `DrizzleMemoryCandidateRetriever` en infrastructure).
 * - `ports/IMemoryRanker` + `services/MemoryRanker`: scoring híbrido puro,
 *   sin I/O, testeado sin PostgreSQL.
 * - `ports/IMemoryRetriever` + `services/MemoryRetriever`: el caso de uso
 *   real que orquesta `IEmbeddingProvider` + `IMemoryCandidateRetriever` +
 *   `IMemoryRanker`.
 */
export * from "./models/index.js";
export * from "./ports/index.js";
export * from "./services/index.js";
