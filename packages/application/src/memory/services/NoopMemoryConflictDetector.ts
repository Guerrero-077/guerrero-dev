import type { MemoryCandidate } from "@guerrero-dev/domain";
import type { IMemoryConflictDetector } from "../ports/IMemoryConflictDetector.js";

/**
 * Placeholder consciente de `IMemoryConflictDetector` (Fase 4.7, cierre de
 * la subfase pendiente en §14e): siempre devuelve `[]` — nunca reporta
 * conflictos.
 *
 * No es un descuido: detectar contradicción semántica real ("Clean
 * Architecture" vs. "arquitectura hexagonal", el ejemplo de §24-27) exige
 * interpretación que ninguna regla determinista documentada en
 * `docs/fase-4-memory-engine.md` cubre todavía, y "conflict resolution
 * avanzado" está explícitamente fuera de alcance de Fase 4 (§31). Escribir
 * una heurística de todos modos (p. ej. una lista de antónimos técnicos)
 * sin evidencia de que funciona sería inventar una regla nueva — exactamente
 * lo que esta fase evita.
 *
 * Con este placeholder el pipeline completo
 * (`MemoryCandidateEvaluator` -> `MemoryCandidatePromoter`) queda
 * conectado y testeable end-to-end ya, sin bloquearse en una decisión de
 * diseño (LLM vs. heurística vs. NLI) que todavía no se tomó. Reemplazar
 * esta clase por una implementación real de detección de conflictos es el
 * siguiente incremento pendiente sobre Candidate Engine, no parte de este
 * cierre — mismo criterio que `NoopExecutionEngine` en `execution/`.
 */
export class NoopMemoryConflictDetector implements IMemoryConflictDetector {
  async findConflicts(_candidate: MemoryCandidate): Promise<readonly string[]> {
    return [];
  }
}
