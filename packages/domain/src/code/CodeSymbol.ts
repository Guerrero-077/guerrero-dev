export type CodeSymbolKind = "function" | "class" | "interface" | "type" | "const" | "method";

/**
 * Un símbolo estructural extraído de un archivo `.ts` (Fase 6, mapa §6).
 * `line`/`endLine` son 1-based e inclusivos, y cubren la declaración
 * completa. `containerName` es `null` para símbolos de nivel superior y
 * el nombre del contenedor (clase u objeto literal) para `method`.
 */
export interface CodeSymbol {
  readonly name: string;
  readonly kind: CodeSymbolKind;
  readonly filePath: string;
  readonly line: number;
  readonly endLine: number;
  readonly exported: boolean;
  readonly containerName: string | null;
}
