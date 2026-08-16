import { isAbsolute, relative, sep } from "node:path";

/**
 * Verifica que `target` (ya resuelto vía `path.resolve`) permanezca dentro
 * del árbol de `root` (también resuelto). Función pura, sin I/O — capa de
 * defensa en profundidad independiente de `isRelativePath` (dominio, 5.1):
 * aunque `isRelativePath` ya rechaza cualquier segmento `..` antes de
 * llegar aquí, esta verificación no asume eso — comprueba la contención
 * real después de la resolución.
 *
 * Deliberadamente NO usa `target.startsWith(root)`: esa comparación de
 * prefijo de string acepta falsos positivos como
 * `root = "/repo/project"`, `target = "/repo/project-other/file.txt"`
 * (mismo prefijo de caracteres, directorio distinto). `path.relative`
 * respeta el límite real del directorio, en Windows y POSIX por igual.
 */
export function isPathWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target);

  if (rel === "") {
    return true;
  }

  if (isAbsolute(rel)) {
    return false;
  }

  return rel !== ".." && !rel.startsWith(`..${sep}`);
}
