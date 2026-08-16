import type { Entity } from "../shared/Entity.js";
import type { ProjectComponent } from "./ProjectComponent.js";
import type { ProjectDependency } from "./ProjectDependency.js";
import type { Technology } from "./Technology.js";

/**
 * Último snapshot derivado conocido de un proyecto (Fase 5, mapa §3). NO es
 * la verdad absoluta del proyecto — es lo que se pudo determinar al momento
 * de `scannedAt`. Todo lo que contiene es reconstruible re-escaneando; por
 * eso no tiene `createdAt`/`updatedAt` propios ni `MemoryStatus`: un
 * re-scan reemplaza el perfil entero (UPSERT, ver §5/§6 del mapa), no
 * versiona su historia.
 *
 * `configuration` queda deliberadamente sin tipar más allá de
 * `Record<string, unknown>`: el mapa (§3) no define todavía un contrato de
 * campos, y tiparlo ahora adelantaría decisiones de 5.4/5.5. El scanner
 * decide qué claves existen cuando llegue esa subfase.
 */
export interface ProjectProfile extends Entity {
  readonly projectId: string;
  readonly schemaVersion: number;
  readonly scannedAt: Date;
  readonly technologies: readonly Technology[];
  readonly components: readonly ProjectComponent[];
  readonly dependencies: readonly ProjectDependency[];
  readonly structure: readonly string[];
  readonly configuration: Record<string, unknown>;
}
