/**
 * Una coincidencia literal dentro de un archivo `.ts` trackeado (Fase 6,
 * mapa §7) — independiente de `CodeSymbol`, no requiere que la
 * coincidencia corresponda a una declaración. `line` es 1-based. `text`
 * es el contenido completo de la línea donde ocurrió el match y puede
 * ser vacío.
 */
export interface LiteralMatch {
  readonly filePath: string;
  readonly line: number;
  readonly text: string;
}
