export type TechnologyCategory = "language" | "framework" | "runtime" | "package_manager";

/**
 * Una tecnología detectada, con su evidencia (Fase 5, mapa §3b — requisito
 * contractual, no opcional). No debe existir un `Technology` sin
 * `sourceFile`/`evidence` válidos: ninguna afirmación sin origen trazable.
 */
export interface Technology {
  readonly name: string;
  readonly category: TechnologyCategory;
  readonly sourceFile: string;
  readonly evidence: string;
}
