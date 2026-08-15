import type { MemorySource } from "@guerrero-dev/domain";

/** Puerto de persistencia de evidencia (`MemorySource`) — Fase 4.3 §10. */
export interface IMemorySourceRepository {
  add(source: MemorySource): Promise<MemorySource>;

  findByMemory(memoryId: string): Promise<MemorySource[]>;
}
