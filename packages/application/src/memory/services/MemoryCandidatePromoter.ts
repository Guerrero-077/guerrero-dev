import { randomUUID } from "node:crypto";
import type { Memory, MemoryCandidate, MemorySource } from "@guerrero-dev/domain";
import type { MemoryEvaluation } from "../models/MemoryEvaluation.js";
import type { MemoryPromotionResult } from "../models/MemoryPromotionResult.js";
import type { IMemoryCandidatePromoter } from "../ports/IMemoryCandidatePromoter.js";
import type {
  IMemoryPromotionUnitOfWork,
  MemoryPromotionRepositories,
} from "../ports/IMemoryPromotionUnitOfWork.js";

/**
 * Ejecuta una `MemoryEvaluation` ya calculada contra persistencia real,
 * dentro de una única transacción (Fase 4.7). Traduce la decisión a
 * operaciones — no la toma: toda la política (aceptar, encontrar
 * duplicado/conflicto) ya vino resuelta en `MemoryCandidateEvaluator`.
 *
 * Dos reglas, ambas explícitamente acordadas antes de escribir esta clase:
 *
 * 1. **`duplicateOf` decide la operación de `Memory` con precedencia sobre
 *    `accepted`.** `accepted` es una señal de calidad del candidato
 *    (`MemoryCandidateEvaluator`), independiente de si ya existe una
 *    memoria casi idéntica. Si hay duplicado, siempre se actualiza la
 *    memoria existente — el candidato nunca "gana" o "pierde" un duplicado
 *    por score.
 * 2. **Las relaciones de conflicto solo se crean si el candidato produjo
 *    una `Memory` (creada o actualizada).** `MemoryRelation` exige
 *    `sourceMemoryId`, y un candidato rechazado sin duplicado nunca llega a
 *    tener un `id` de `Memory` propio — no hay origen válido para la
 *    relación. La señal de conflicto sigue disponible en `MemoryEvaluation`
 *    para logging/observabilidad, pero no se persiste como relación
 *    huérfana.
 */
export class MemoryCandidatePromoter implements IMemoryCandidatePromoter {
  constructor(private readonly unitOfWork: IMemoryPromotionUnitOfWork) {}

  async promote(candidate: MemoryCandidate, evaluation: MemoryEvaluation): Promise<MemoryPromotionResult> {
    return this.unitOfWork.runInTransaction(async (repositories) => {
      const memoryOperation = await this.applyMemoryOperation(candidate, evaluation, repositories);

      if (memoryOperation === null) {
        return { action: "rejected", memoryId: null, conflictRelationsCreated: [] };
      }

      const { action, memory } = memoryOperation;

      await this.addSource(candidate, memory, repositories);
      const conflictRelationsCreated = await this.createConflictRelations(evaluation, memory, repositories);

      return { action, memoryId: memory.id, conflictRelationsCreated };
    });
  }

  /**
   * Decide y ejecuta qué pasa con el registro `Memory`: `update` si hay
   * duplicado (con precedencia sobre `accepted`), `create` si se acepta y
   * no hay duplicado, o ningún registro (`null`) si se rechaza sin
   * duplicado.
   */
  private async applyMemoryOperation(
    candidate: MemoryCandidate,
    evaluation: MemoryEvaluation,
    repositories: MemoryPromotionRepositories,
  ): Promise<{ action: "created" | "updated"; memory: Memory } | null> {
    if (evaluation.duplicateOf !== null) {
      const existing = await repositories.memoryRepository.findById(evaluation.duplicateOf);
      if (!existing) {
        throw new Error(
          `MemoryEvaluation.duplicateOf apunta a "${evaluation.duplicateOf}", que no existe en IMemoryRepository`,
        );
      }

      const now = new Date();
      const updated = await repositories.memoryRepository.update({
        ...existing,
        confidence: evaluation.confidence,
        importance: evaluation.importance,
        lastVerifiedAt: now,
        updatedAt: now,
      });
      return { action: "updated", memory: updated };
    }

    if (!evaluation.accepted) {
      return null;
    }

    const now = new Date();
    const created = await repositories.memoryRepository.create({
      id: randomUUID(),
      projectId: candidate.projectId,
      scope: candidate.scope,
      type: candidate.type,
      content: candidate.content,
      status: "active",
      confidence: evaluation.confidence,
      importance: evaluation.importance,
      createdAt: now,
      updatedAt: now,
      lastVerifiedAt: now,
      expiresAt: null,
    });
    return { action: "created", memory: created };
  }

  private async addSource(
    candidate: MemoryCandidate,
    memory: Memory,
    repositories: MemoryPromotionRepositories,
  ): Promise<MemorySource> {
    return repositories.memorySourceRepository.add({
      id: randomUUID(),
      memoryId: memory.id,
      sourceType: candidate.source.sourceType,
      sourceReference: candidate.source.sourceReference,
      excerpt: candidate.source.excerpt ?? null,
      metadata: candidate.source.metadata ?? {},
      createdAt: new Date(),
    });
  }

  private async createConflictRelations(
    evaluation: MemoryEvaluation,
    memory: Memory,
    repositories: MemoryPromotionRepositories,
  ): Promise<readonly string[]> {
    const created: string[] = [];
    for (const conflictingMemoryId of evaluation.conflictsWith) {
      await repositories.memoryRelationRepository.create({
        id: randomUUID(),
        sourceMemoryId: memory.id,
        targetMemoryId: conflictingMemoryId,
        relationType: "contradicts",
        confidence: evaluation.confidence,
        createdAt: new Date(),
      });
      created.push(conflictingMemoryId);
    }
    return created;
  }
}
