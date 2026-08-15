import type { Entity } from "../shared/Entity.js";
import type { MemoryScope } from "./MemoryScope.js";
import type { MemoryStatus } from "./MemoryStatus.js";
import type { MemoryType } from "./MemoryType.js";

/**
 * Una unidad de conocimiento persistida (Fase 4.1 §16). `confidence` no es
 * la verdad absoluta: por eso viaja siempre junto a `lastVerifiedAt`,
 * `source` (ver `MemorySource`) y `status`.
 *
 * Invariantes (ver `MemoryInvariants.ts`):
 * - `confidence` e `importance` están en el rango `0..1`.
 * - `scope === "global"` implica `projectId === null`; `"project"` y
 *   `"session"` requieren `projectId`.
 */
export interface Memory extends Entity {
  readonly projectId: string | null;
  readonly scope: MemoryScope;
  readonly type: MemoryType;
  readonly content: string;
  readonly status: MemoryStatus;
  readonly confidence: number;
  readonly importance: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastVerifiedAt: Date | null;
  readonly expiresAt: Date | null;
}
