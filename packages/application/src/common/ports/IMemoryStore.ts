import type { MemoryKind, MemoryRecord } from "@guerrero-dev/domain";

/**
 * Contrato del almacén de memoria (Fase 4, todavía no implementado).
 * Definido ya para que otros packages puedan depender de la interfaz sin
 * esperar a la implementación sobre PostgreSQL + pgvector.
 */
export interface MemoryQuery {
  projectId?: string;
  kind?: MemoryKind;
  text: string;
  topK?: number;
}

export interface IMemoryStore {
  save(record: Omit<MemoryRecord, "id" | "createdAt">): Promise<MemoryRecord>;

  search(query: MemoryQuery): Promise<MemoryRecord[]>;

  delete(id: string): Promise<void>;
}
