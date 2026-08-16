/**
 * Forma mínima de `package.json` que `DeterministicTechnologyDetector`
 * (Fase 5.4) necesita — no un esquema completo del formato. Deliberadamente
 * mínimo, mismo criterio que `CommitSnapshot` (Fase 4.8): las reglas reales
 * guían qué campos se agregan después, no una lista especulativa.
 *
 * Todos los campos tienen default seguro (`{}`/`null`) cuando el manifiesto
 * no los declara — su ausencia no es un error, es evidencia de que esa
 * regla no aplica.
 */
export interface PackageManifest {
  readonly dependencies: Readonly<Record<string, string>>;
  readonly devDependencies: Readonly<Record<string, string>>;
  readonly engines: Readonly<Record<string, string>>;
  readonly packageManager: string | null;
}
