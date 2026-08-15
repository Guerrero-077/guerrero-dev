/**
 * Ciclo de vida de una memoria (Fase 4.1 §4).
 *
 * ```text
 * candidate → active ─┬─→ superseded ─┐
 *                      └─→ invalidated ┴─→ archived
 * ```
 *
 * No se elimina información antigua inmediatamente: el sistema debe poder
 * responder "¿por qué Guerrero Dev cree esto?".
 */
export type MemoryStatus = "candidate" | "active" | "superseded" | "invalidated" | "archived";
