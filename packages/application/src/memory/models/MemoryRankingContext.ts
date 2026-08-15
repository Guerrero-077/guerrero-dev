import type { MemoryRankingWeights } from "./MemoryRankingWeights.js";

/**
 * Punto de partida para el decay exponencial de recencia — a validar con
 * datos reales, no una constante definitiva. Ver `MemoryRanker.recency`.
 */
export const DEFAULT_RECENCY_HALF_LIFE_DAYS = 180;

/**
 * Contexto que `MemoryRanker` necesita para puntuar candidatos más allá de
 * lo que ya trae cada `MemorySearchCandidate` (Fase 4.6).
 *
 * `projectId`, si está presente, es el proyecto de referencia para calcular
 * `projectRelevance` por candidato — no necesariamente el mismo valor que
 * el `projectId` que se usó como filtro SQL en `MemorySemanticQuery` (una
 * búsqueda global sin filtro duro igual puede tener un proyecto de
 * "contexto actual" para puntuar relevancia relativa).
 *
 * `now`, opcional: inyectar la fecha permite tests deterministas del decay
 * de recencia sin mockear `Date` globalmente.
 */
export interface MemoryRankingContext {
  readonly weights: MemoryRankingWeights;
  readonly projectId?: string;
  readonly recencyHalfLifeDays: number;
  readonly now?: Date;
}
