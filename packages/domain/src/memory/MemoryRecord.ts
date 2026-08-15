/**
 * Tipos base del sistema de memoria (Fase 4, aún no implementado). Se
 * definen aquí para que `application`/`memory` tengan un contrato estable
 * desde ya, sin acoplar todavía a pgvector.
 */
export type MemoryKind = "fact" | "decision" | "pattern" | "preference";

export interface MemoryRecord {
  id: string;
  projectId?: string;
  kind: MemoryKind;
  content: string;
  embedding?: number[];
  createdAt: Date;
  metadata?: Record<string, unknown>;
}
