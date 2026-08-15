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
 *
 * Fase 4.7 (Candidate Engine) — decidir qué `MemoryCandidate` (dominio)
 * merece convertirse en `Memory` persistida, en dos etapas separadas:
 *
 * - `ports/IMemoryCandidateValidator` + `IMemoryCandidateDeduplicator` +
 *   `IMemoryConflictDetector` + `IMemoryCandidateScorer` +
 *   `IMemoryCandidateEvaluator` + `services/MemoryCandidateEvaluator`:
 *   evaluación pura (`Validation -> Deduplication -> Conflict detection ->
 *   Scoring -> Policy -> MemoryEvaluation`), sin escribir en PostgreSQL.
 * - `ports/IMemoryCandidatePromoter` + `services/MemoryCandidatePromoter`:
 *   ejecuta esa decisión (crear/actualizar `Memory`+`MemorySource`, y
 *   crear `MemoryRelation` de conflicto de forma independiente) dentro de
 *   `ports/IMemoryPromotionUnitOfWork` — frontera transaccional angosta
 *   (no un `ITransactionManager` genérico) para que las tres escrituras
 *   sean atómicas (adapter concreto: `DrizzleMemoryPromotionUnitOfWork` en
 *   infrastructure).
 *
 * `models/` tiene los tipos que viajan entre estas capas —
 * `MemorySearchCandidate` (retrieval) no es lo mismo que `MemoryCandidate`
 * del dominio (candidate engine), ver el JSDoc de `MemorySearchCandidate`.
 */
export * from "./models/index.js";
export * from "./ports/index.js";
export * from "./services/index.js";
