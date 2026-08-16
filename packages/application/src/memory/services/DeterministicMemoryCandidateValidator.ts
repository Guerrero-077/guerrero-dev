import { isScopeConsistent, isValidConfidence, isValidImportance } from "@guerrero-dev/domain";
import type { MemoryCandidate } from "@guerrero-dev/domain";
import type { IMemoryCandidateValidator } from "../ports/IMemoryCandidateValidator.js";

/**
 * Implementación determinista de `IMemoryCandidateValidator` (Fase 4.7,
 * cierre de la subfase pendiente en §14e — ver `docs/fase-4-memory-engine.md`).
 *
 * Reutiliza los invariantes de dominio ya definidos en `MemoryInvariants.ts`
 * (`Memory.ts` §Invariantes) en vez de redefinir reglas de validación acá:
 * `confidence`/`importance` en `0..1`, y `scope` consistente con
 * `projectId` (`"global"` sin `projectId`, `"project"`/`"session"` con
 * `projectId`). No se agrega ninguna regla nueva que no esté ya
 * documentada en dominio — ese fue el criterio explícito para esta
 * implementación.
 *
 * Lanza en el primer invariante que falla; no acumula todos los errores
 * porque `MemoryCandidateEvaluator` solo necesita saber *si* el candidato
 * es válido para decidir el resto del pipeline, no la lista completa de
 * motivos (el mensaje de la excepción sí queda en `MemoryEvaluation.reason`
 * vía `MemoryCandidateEvaluator.rejected`).
 */
export class DeterministicMemoryCandidateValidator implements IMemoryCandidateValidator {
  validate(candidate: MemoryCandidate): void {
    if (!isValidConfidence(candidate.confidence)) {
      throw new Error(`confidence fuera de rango: ${candidate.confidence}`);
    }
    if (!isValidImportance(candidate.importance)) {
      throw new Error(`importance fuera de rango: ${candidate.importance}`);
    }
    if (!isScopeConsistent(candidate.scope, candidate.projectId)) {
      const projectIdLabel = candidate.projectId === null ? "null" : `"${candidate.projectId}"`;
      throw new Error(`scope "${candidate.scope}" inconsistente con projectId ${projectIdLabel}`);
    }
  }
}
