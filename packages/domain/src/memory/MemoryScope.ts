/**
 * A qué pertenece una memoria (Fase 4.1 §3). Evita contaminar un proyecto
 * con información de otro.
 *
 * - global:  válida para todo Guerrero Dev ("Prefiere soluciones desacopladas").
 * - project: válida solo dentro de un proyecto ("Miller utiliza PostgreSQL").
 * - session: válida solo durante la sesión de trabajo actual
 *            ("Estamos modificando ProjectRepository").
 */
export type MemoryScope = "global" | "project" | "session";
