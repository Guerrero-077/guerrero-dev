import type { IMemoryPromotionUnitOfWork, MemoryPromotionRepositories } from "@guerrero-dev/application";
import type { DrizzleClient } from "../client.js";
import { DrizzleMemoryRelationRepository } from "../repositories/DrizzleMemoryRelationRepository.js";
import { DrizzleMemoryRepository } from "../repositories/DrizzleMemoryRepository.js";
import { DrizzleMemorySourceRepository } from "../repositories/DrizzleMemorySourceRepository.js";

/**
 * `IMemoryPromotionUnitOfWork` sobre `db.transaction()` de Drizzle (Fase
 * 4.7): construye `DrizzleMemoryRepository`/`DrizzleMemorySourceRepository`/
 * `DrizzleMemoryRelationRepository` nuevos, atados al cliente transaccional
 * (`tx`) en vez del `db` normal — cualquier INSERT/UPDATE que hagan esos
 * tres repos dentro de `work` queda en la misma transacción, y si `work`
 * lanza, Drizzle hace `ROLLBACK` automáticamente y ninguno de los tres
 * escribió nada.
 *
 * No lleva lógica de promoción — eso es responsabilidad exclusiva de
 * `MemoryCandidatePromoter`, que recibe esta clase por su puerto
 * (`IMemoryPromotionUnitOfWork`) sin conocer Drizzle.
 */
export class DrizzleMemoryPromotionUnitOfWork implements IMemoryPromotionUnitOfWork {
  constructor(private readonly db: DrizzleClient) {}

  async runInTransaction<T>(work: (repositories: MemoryPromotionRepositories) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      const repositories: MemoryPromotionRepositories = {
        memoryRepository: new DrizzleMemoryRepository(tx),
        memorySourceRepository: new DrizzleMemorySourceRepository(tx),
        memoryRelationRepository: new DrizzleMemoryRelationRepository(tx),
      };
      return work(repositories);
    });
  }
}
