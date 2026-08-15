import type { Entity } from "../shared/Entity.js";

/**
 * Procedencia de una afirmación (Fase 4.1 §6-7). Jerarquía de confiabilidad
 * inicial (de más a menos confiable) — no implica que la fuente de mayor
 * jerarquía "siempre tenga razón", implica que el sistema conoce la
 * procedencia de cada afirmación:
 *
 * ```text
 * repository / file / commit / test  (código y tests)
 *              ↑
 *         configuration
 *              ↑
 *         conversation      (afirmación explícita del usuario)
 *              ↑
 *      agent_observation    (inferencia del agente)
 * ```
 *
 * `manual` cubre memorias cargadas a mano (fuera de este flujo).
 */
export type MemorySourceType =
  "repository" | "file" | "commit" | "conversation" | "test" | "agent_observation" | "manual";

/**
 * Evidencia persistida que respalda una `Memory` ya existente.
 */
export interface MemorySource extends Entity {
  readonly memoryId: string;
  readonly sourceType: MemorySourceType;
  readonly sourceReference: string;
  readonly excerpt: string | null;
  readonly metadata: Record<string, unknown>;
  readonly createdAt: Date;
}

/**
 * Evidencia todavía sin `Memory` asociada — es lo que trae un
 * `MemoryCandidate` antes de persistirse (Fase 4.1 §18).
 */
export interface MemorySourceInput {
  readonly sourceType: MemorySourceType;
  readonly sourceReference: string;
  readonly excerpt?: string;
  readonly metadata?: Record<string, unknown>;
}
