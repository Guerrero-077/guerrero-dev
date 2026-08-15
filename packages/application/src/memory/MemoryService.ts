import type { MemoryRecord } from "@guerrero-dev/domain";
import type { IMemoryStore, MemoryQuery } from "../common/ports/IMemoryStore.js";

/**
 * Caso de uso de memoria. Placeholder de Fase 3: depende de `IMemoryStore`,
 * pero la implementación real sobre pgvector llega en Fase 4.
 */
export class MemoryService {
  constructor(private readonly store: IMemoryStore) {}

  async remember(record: Omit<MemoryRecord, "id" | "createdAt">): Promise<MemoryRecord> {
    return this.store.save(record);
  }

  async recall(query: MemoryQuery): Promise<MemoryRecord[]> {
    return this.store.search(query);
  }
}
