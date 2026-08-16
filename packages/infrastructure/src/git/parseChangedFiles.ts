/**
 * Parsea el stdout de `git show --format= --name-only <sha>` — una ruta
 * por línea, con una línea en blanco inicial (por `--format=` vacío,
 * que suprime el header de commit-info pero deja la línea en blanco que
 * normalmente lo separaría del cuerpo). Función pura y trivial, separada
 * de `parseCommitMetadata` porque parsea un formato completamente
 * distinto (líneas simples, no campos delimitados) — no porque falte
 * evidencia de que se puedan combinar.
 *
 * Un commit sin archivos tocados (p. ej. un commit vacío creado con
 * `git commit --allow-empty`) produce stdout vacío o solo líneas en
 * blanco — este parser devuelve `[]`, no lanza.
 */
export function parseChangedFiles(stdout: string): readonly string[] {
  return stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
