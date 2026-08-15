/**
 * Qué tipo de información representa una memoria (Fase 4.1 §2).
 *
 * - fact:        información verificable ("Miller utiliza PostgreSQL").
 * - decision:    decisión arquitectónica ("Miller utiliza arquitectura modular").
 * - preference:  preferencia del desarrollador, no del proyecto
 *                ("Prefiere interfaces para desacoplar infraestructura").
 * - pattern:     patrón observado ("Repository + Service en 7/8 proyectos").
 * - experience:  experiencia pasada ("Se solucionó un problema de concurrencia...").
 * - knowledge:   conocimiento técnico adquirido ("Usa JWT con refresh tokens rotativos").
 */
export type MemoryType = "fact" | "decision" | "preference" | "pattern" | "experience" | "knowledge";
