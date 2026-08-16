/**
 * Lectura puntual de un archivo de texto dentro de un proyecto (Fase 5,
 * mapa §4/§8a). Deliberadamente angosto: no lista directorios, no hace
 * `watch`, no descubre archivos por sí mismo, no interpreta el contenido
 * (JSON/YAML/etc. es responsabilidad de 5.4/5.5). Qué archivo leer lo
 * decide siempre el llamador (`ProjectProfileScanner`, 5.7).
 *
 * `repoRoot` es parámetro del método, no del constructor — mismo criterio
 * que `IGitTrackedFilesSource` (5.2): el adapter no tiene estado, se
 * reutiliza contra N proyectos.
 */
export interface IFileReader {
  /**
   * Contenido UTF-8 de `relativePath` dentro de `repoRoot`. `relativePath`
   * debe cumplir el contrato de ruta relativa de 5.1 (`isRelativePath`) y,
   * una vez resuelto contra `repoRoot`, permanecer dentro de ese árbol —
   * ambas cosas se verifican antes de tocar el filesystem. Lanza
   * `FileReaderError` ante cualquier fallo; nunca devuelve `null` ni `""`
   * como sustituto de un error.
   */
  readFile(repoRoot: string, relativePath: string): Promise<string>;
}
