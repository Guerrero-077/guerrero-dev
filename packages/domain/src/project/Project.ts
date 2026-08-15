/**
 * Un proyecto de código sobre el que Guerrero Dev opera: una carpeta local
 * (o repo) que el agente puede leer, indexar y modificar.
 */
export interface Project {
  id: string;
  name: string;
  rootPath: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectSummary {
  id: string;
  name: string;
  rootPath: string;
}
