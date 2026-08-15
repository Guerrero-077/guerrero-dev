import type { Entity } from "../shared/Entity.js";

/**
 * Un proyecto de código sobre el que Guerrero Dev opera: una carpeta local
 * (o repo) que el agente puede leer, indexar y modificar.
 */
export interface Project extends Entity {
  readonly name: string;
  readonly path: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}
