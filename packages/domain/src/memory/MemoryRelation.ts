import type { Entity } from "../shared/Entity.js";

/**
 * Cómo se relacionan dos memorias entre sí (Fase 4.1 §12), formando una
 * pequeña red de conocimiento. Ejemplo: Memory A ("Miller utiliza
 * PostgreSQL") `supersedes` → Memory B ("Miller utiliza SQL Server").
 */
export type MemoryRelationType = "supports" | "contradicts" | "supersedes" | "derived_from" | "related_to";

export interface MemoryRelation extends Entity {
  readonly sourceMemoryId: string;
  readonly targetMemoryId: string;
  readonly relationType: MemoryRelationType;
  readonly confidence: number;
  readonly createdAt: Date;
}
