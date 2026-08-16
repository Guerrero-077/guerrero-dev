/**
 * Cerrado a lo que hoy tiene evidencia real en este repo (Fase 5, mapa
 * §11: `apps/api`, `packages/domain`, etc.). Se amplía cuando aparezca un
 * tercer tipo con evidencia, no antes — mismo criterio que `MemoryScope`.
 */
export type ProjectComponentType = "app" | "package";

/** Un sub-proyecto dentro de un monorepo (Fase 5, mapa §3). */
export interface ProjectComponent {
  readonly name: string;
  readonly path: string;
  readonly type: ProjectComponentType;
}
