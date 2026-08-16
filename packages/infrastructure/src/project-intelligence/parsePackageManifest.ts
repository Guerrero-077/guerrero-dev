import type { PackageManifest } from "@guerrero-dev/application";
import { ManifestReaderError } from "./ManifestReaderError.js";

const STRING_RECORD_FIELDS = ["dependencies", "devDependencies", "engines"] as const;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return isPlainObject(value) && Object.values(value).every((entry) => typeof entry === "string");
}

/**
 * Parsea el contenido crudo de un `package.json` a `PackageManifest` (Fase
 * 5.4). Valida únicamente la forma que las reglas de detección consumen —
 * no un esquema completo del formato `package.json` (no valida `name`,
 * `scripts`, `exports`, etc., porque ninguna regla los necesita).
 *
 * `dependencies`/`devDependencies`/`engines` ausentes son válidos (default
 * `{}` — significa "esta regla no aplica", no un error). Presentes pero
 * con una forma inesperada (no un objeto de string→string) sí son
 * `invalid_manifest`: el manifiesto existe pero no es lo que decía ser.
 */
export function parsePackageManifest(raw: string): PackageManifest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new ManifestReaderError("invalid_manifest", "El contenido no es JSON válido.", error);
  }

  if (!isPlainObject(parsed)) {
    throw new ManifestReaderError("invalid_manifest", "El manifiesto no es un objeto JSON.");
  }

  for (const field of STRING_RECORD_FIELDS) {
    const value = parsed[field];
    if (value !== undefined && !isStringRecord(value)) {
      throw new ManifestReaderError("invalid_manifest", `"${field}" no es un objeto de string a string.`);
    }
  }

  const packageManager = parsed["packageManager"];
  if (packageManager !== undefined && typeof packageManager !== "string") {
    throw new ManifestReaderError("invalid_manifest", `"packageManager" no es un string.`);
  }

  return {
    dependencies: isStringRecord(parsed["dependencies"]) ? parsed["dependencies"] : {},
    devDependencies: isStringRecord(parsed["devDependencies"]) ? parsed["devDependencies"] : {},
    engines: isStringRecord(parsed["engines"]) ? parsed["engines"] : {},
    packageManager: typeof packageManager === "string" ? packageManager : null,
  };
}
