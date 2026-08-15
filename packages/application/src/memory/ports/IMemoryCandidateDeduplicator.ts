import type { MemoryCandidate } from "@guerrero-dev/domain";
import type { MemoryDuplicateMatch } from "../models/MemoryDuplicateMatch.js";

/**
 * Búsqueda de duplicados de un `MemoryCandidate` contra memorias existentes
 * (Fase 4.7). Necesita acceso a memoria ya persistida — a diferencia de
 * `IMemoryCandidateValidator`, no es puro.
 *
 * Separado de `IMemoryConflictDetector` a propósito: duplicado ("Usamos
 * PostgreSQL" vs. "Usamos PostgreSQL") y conflicto ("Usamos PostgreSQL" vs.
 * "Usamos SQL Server") son fenómenos distintos, no una única búsqueda
 * semántica genérica.
 */
export interface IMemoryCandidateDeduplicator {
  findDuplicate(candidate: MemoryCandidate): Promise<MemoryDuplicateMatch | null>;
}
