import type { Memory } from "@guerrero-dev/domain";

/**
 * Una memoria devuelta por retrieval semántico, antes del ranking híbrido
 * (Fase 4.6). Deliberadamente NO es el mismo tipo que `MemoryCandidate` del
 * dominio:
 *
 * - `MemoryCandidate` (domain, Fase 4.1 §8) = candidato a convertirse en
 *   memoria nueva (pipeline de creación: Candidate -> Deduplicate ->
 *   Conflict detection -> Confidence evaluation -> Persist).
 * - `MemorySearchCandidate` (application, Fase 4.6) = memoria ya existente,
 *   candidata a ser *recuperada* en una búsqueda.
 *
 * Reusar el mismo nombre para dos conceptos distintos habría sido
 * confuso — por eso el nombre distinto.
 */
export interface MemorySearchCandidate {
  readonly memory: Memory;
  readonly semanticSimilarity: number;
}
