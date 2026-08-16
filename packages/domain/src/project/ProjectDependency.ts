/**
 * Declarada, no resuelta transitivamente (Fase 5, mapa §4/§5). No lleva
 * `evidence`: el requisito de evidencia obligatoria (§3b) aplica solo a
 * `Technology`, no se extiende aquí sin que el mapa lo pida.
 */
export interface ProjectDependency {
  readonly componentPath: string;
  readonly name: string;
  readonly versionRange: string;
}
