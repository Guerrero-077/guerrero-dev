import type { IMemoryRelationRepository } from "../../common/ports/IMemoryRelationRepository.js";
import type { IMemoryRepository } from "../../common/ports/IMemoryRepository.js";
import type { IMemorySourceRepository } from "../../common/ports/IMemorySourceRepository.js";

/**
 * Los tres repositorios que `IMemoryCandidatePromoter` necesita, atados a
 * una misma transacción — no instancias sueltas, sino las que
 * `IMemoryPromotionUnitOfWork.runInTransaction` construyó para ese `work`
 * específico.
 */
export interface MemoryPromotionRepositories {
  readonly memoryRepository: IMemoryRepository;
  readonly memorySourceRepository: IMemorySourceRepository;
  readonly memoryRelationRepository: IMemoryRelationRepository;
}

/**
 * Frontera transaccional angosta para la promoción de candidatos (Fase
 * 4.7): `Memory` + `MemorySource` + `MemoryRelation` deben persistirse
 * atómicamente — o las tres, o ninguna. No es un `ITransactionManager`
 * genérico a propósito: generalizarlo ahora, sin un segundo caso de uso
 * real que lo necesite, sería diseño anticipado. Si en el futuro aparece
 * otro flujo que necesite la misma garantía sobre otra combinación de
 * repositorios, ahí se evalúa generalizar.
 *
 * El `UnitOfWork` es dueño únicamente de la transacción, no de las reglas
 * de promoción — `work` recibe los repositorios ya atados a la
 * transacción y decide qué hacer con ellos; `runInTransaction` no sabe
 * nada de `MemoryCandidate`/`MemoryEvaluation`.
 */
export interface IMemoryPromotionUnitOfWork {
  runInTransaction<T>(work: (repositories: MemoryPromotionRepositories) => Promise<T>): Promise<T>;
}
