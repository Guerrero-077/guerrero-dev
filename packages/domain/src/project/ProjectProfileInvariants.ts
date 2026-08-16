import type { ProjectComponent, ProjectComponentType } from "./ProjectComponent.js";
import type { Technology, TechnologyCategory } from "./Technology.js";

const KNOWN_SCHEMA_VERSIONS: readonly number[] = [1];

const TECHNOLOGY_CATEGORIES: readonly TechnologyCategory[] = [
  "language",
  "framework",
  "runtime",
  "package_manager",
];

const COMPONENT_TYPES: readonly ProjectComponentType[] = ["app", "package"];

const WINDOWS_DRIVE_PATTERN = /^[A-Za-z]:/;

/** `schemaVersion` conocido — no implica historial, solo forma válida (Fase 5, mapa §3a). */
export function isKnownSchemaVersion(value: number): boolean {
  return KNOWN_SCHEMA_VERSIONS.includes(value);
}

/**
 * Ruta relativa canónica respecto al root (Fase 5, mapa §4 — contrato
 * congelado para 5.2): no vacía, separador exclusivamente `/`, no absoluta
 * POSIX, no absoluta Windows, sin unidad de disco, sin segmentos `..`.
 * Invariante puramente sintáctica — no toca el filesystem.
 */
export function isRelativePath(value: string): boolean {
  if (value.length === 0) return false;
  if (value.includes("\\")) return false;
  if (value.startsWith("/")) return false;
  if (WINDOWS_DRIVE_PATTERN.test(value)) return false;
  return !value.split("/").includes("..");
}

/** `name`/`category` no vacíos + `sourceFile`/`evidence` no vacíos (Fase 5, mapa §3b — obligatorio). */
export function isValidTechnology(technology: Technology): boolean {
  return (
    technology.name.trim().length > 0 &&
    TECHNOLOGY_CATEGORIES.includes(technology.category) &&
    technology.evidence.trim().length > 0 &&
    isRelativePath(technology.sourceFile)
  );
}

/** `name` no vacío + `path` relativo (`isRelativePath`) + `type` conocido. */
export function isValidComponent(component: ProjectComponent): boolean {
  return (
    component.name.trim().length > 0 &&
    COMPONENT_TYPES.includes(component.type) &&
    isRelativePath(component.path)
  );
}
