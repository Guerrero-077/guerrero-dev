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
 * Fase 4.8 (Candidate Detection, docs/benchmarks/candidate-detection/) —
 * quién produce el `MemoryCandidate` que 4.7 evalúa. Pipeline híbrido, no
 * un único `ICandidateDetector`, porque el audit de 23 commits reales (2
 * repositorios) mostró tres problemas distintos, no uno:
 *
 * - `models/CommitSnapshot` + `ports/ICommitAnalyzer` -> `models/CommitSignal`:
 *   análisis estructural (magnitud, paths, `models/CommitReference[]` como
 *   contexto histórico) — deliberadamente SIN acceso a memoria persistida,
 *   esa pregunta ("¿ya lo sabíamos?") sigue siendo exclusiva de 4.7.
 *   `CommitReference` tiene una frontera explícita y congelada (§14g,
 *   `fase-4-memory-engine.md`): solo heurísticas estructurales baratas
 *   (overlap de paths/directorio, continuidad de renombrado) — nunca mismo
 *   autor, ventana temporal, ni carpeta-como-proxy-de-feature, porque eso
 *   mezclaría "estructura observable" con "significado arquitectónico"
 *   dentro del analyzer. Es una lista de candidatos de contexto, no
 *   relaciones semánticas confirmadas — interpretarlas es trabajo del
 *   extractor.
 * - `ports/ICommitNoiseFilter`: filtro determinista, puro y síncrono —
 *   descarta ruido obvio antes de gastar interpretación semántica.
 *   Implementación concreta (`services/DeterministicCommitNoiseFilter`)
 *   cerrada y medida contra los 23 commits del golden dataset: 100%
 *   precisión, 75% recall, un falso negativo conocido y aceptado
 *   (`6537bec`, ver §14f).
 * - `ports/ICandidateExtractor` -> `models/CandidateExtractionResult[]`
 *   (un commit puede producir 0..N candidatas, no una): interpretación
 *   semántica, provider-agnostic (regla determinista hoy, LLM después sin
 *   cambiar el contrato). `models/RiskSignal` es independiente de
 *   `importance` — un cambio puede ser importante y no peligroso, o
 *   peligroso y de importancia baja. `CandidateExtractionOutcome`
 *   (`rejected`/`pending_review`/`ready`) decide si la candidata sigue a
 *   4.7 directo o espera revisión humana — sin agregarle ese campo a
 *   `MemoryCandidate` (Fase 4.1 se mantiene simple a propósito).
 * - `services/CandidateDetectionService`: orquesta las tres piezas, sin
 *   tomar ninguna decisión propia.
 *
 * `ICommitAnalyzer` determinista (`services/DeterministicCommitAnalyzer` +
 * `ports/IGitHistorySource` + adapter real `GitHistorySource` en
 * infrastructure) cerrado y validado contra Git real — incluyendo el caso
 * `bf7f9fb` -> `96f2719`/`d3b5804`, que resultó ser un ejemplo de path
 * overlap real (barrels `index.ts` compartidos), no del caso "sin overlap"
 * que se había asumido sin verificar (corrección documentada en §14g/§14i,
 * `fase-4-memory-engine.md`). Siguiente incremento: `ICandidateExtractor`
 * — si en el futuro aparece un caso real de relación conceptual sin ningún
 * overlap estructural y el extractor falla sistemáticamente en
 * encontrarla, esa sería la evidencia para reabrir la frontera de
 * `CommitReference`, no una ampliación especulativa hoy.
 *
 * `models/` tiene los tipos que viajan entre estas capas —
 * `MemorySearchCandidate` (retrieval) no es lo mismo que `MemoryCandidate`
 * del dominio (candidate engine), ver el JSDoc de `MemorySearchCandidate`.
 */
export * from "./models/index.js";
export * from "./ports/index.js";
export * from "./services/index.js";
