/**
 * Pesos del scoring híbrido (Fase 4.6). Deliberadamente NO hardcodeados
 * dentro de `MemoryRanker` como constantes de clase — el benchmark de
 * retrieval de Fase 4.6 necesita poder variarlos (y comparar
 * semantic-only vs. hybrid) sin recompilar nada.
 */
export interface MemoryRankingWeights {
  readonly semanticSimilarity: number;
  readonly projectRelevance: number;
  readonly confidence: number;
  readonly importance: number;
  readonly recency: number;
}

/**
 * Punto de partida para búsquedas dentro de un proyecto específico
 * (`MemorySearchQuery.projectId` presente). `projectRelevance` en 0: el
 * candidate retriever ya filtró por `project_id` en SQL, así que todas las
 * memorias candidatas son del mismo proyecto — sumar un 1.0 artificial a
 * todas por igual no aporta información para ordenar entre ellas.
 *
 * Provisional, no definitivo: a validar con el benchmark de retrieval de
 * Fase 4.6 (Recall@K / MRR, semantic-only vs. hybrid) antes de considerarlo
 * la config real.
 */
export const DEFAULT_PROJECT_RANKING_WEIGHTS: MemoryRankingWeights = {
  semanticSimilarity: 0.6,
  projectRelevance: 0,
  confidence: 0.15,
  importance: 0.15,
  recency: 0.1,
};

/**
 * Punto de partida para búsquedas globales (sin `projectId`, candidatos de
 * cualquier proyecto): acá `projectRelevance` sí aporta información — ver
 * `MemoryRanker.projectRelevance` para cómo se calcula por candidato.
 * Provisional, mismo criterio que `DEFAULT_PROJECT_RANKING_WEIGHTS`.
 */
export const DEFAULT_GLOBAL_RANKING_WEIGHTS: MemoryRankingWeights = {
  semanticSimilarity: 0.5,
  projectRelevance: 0.2,
  confidence: 0.15,
  importance: 0.1,
  recency: 0.05,
};
