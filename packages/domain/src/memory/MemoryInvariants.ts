import type { MemoryScope } from "./MemoryScope.js";

const MIN_SCORE = 0;
const MAX_SCORE = 1;

/**
 * `confidence` vive en `0..1` (Fase 4.1 §5). No representa verdad absoluta,
 * pero fuera de este rango es un dato inválido, no una opinión discutible.
 */
export function isValidConfidence(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_SCORE && value <= MAX_SCORE;
}

/**
 * `importance` vive en `0..1` (Fase 4.1 §10) — distingue "el proyecto usa
 * TypeScript" de "el sistema depende de una decisión arquitectónica crítica".
 */
export function isValidImportance(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_SCORE && value <= MAX_SCORE;
}

/**
 * `global` no pertenece a ningún proyecto; `project` y `session` sí (Fase
 * 4.1 §3). Evita memorias de scope `project`/`session` sin `projectId`, o
 * memorias `global` contaminadas con un proyecto.
 */
export function isScopeConsistent(scope: MemoryScope, projectId: string | null): boolean {
  return scope === "global" ? projectId === null : projectId !== null;
}
