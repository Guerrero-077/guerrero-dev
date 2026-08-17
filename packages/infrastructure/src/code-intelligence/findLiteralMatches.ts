import type { LiteralMatch } from "@guerrero-dev/domain";

const LINE_SPLIT_PATTERN = /\r\n|\n/;

/**
 * Localiza coincidencias literales de `query` como substring exacto,
 * case-sensitive, dentro de `content` (Fase 6, mapa §7). Un `LiteralMatch`
 * por línea que contiene la coincidencia, sin importar cuántas veces
 * aparece `query` en esa línea — el modelo no tiene columna ni conteo de
 * ocurrencias (congelado en la adenda de 6.1). `query === ""` coincide
 * con toda línea — semántica natural de `String.prototype.includes("")`,
 * comportamiento documentado, no un caso especial que se rechace.
 *
 * Separador de línea `\r\n|\n`: evita comportamiento dependiente del
 * sistema operativo. Un `\r` aislado (sin `\n` siguiente) no se trata
 * como salto de línea — comportamiento natural de `String.prototype.split`
 * con este patrón, sin soporte adicional inventado.
 */
export function findLiteralMatches(content: string, filePath: string, query: string): LiteralMatch[] {
  const lines = content.split(LINE_SPLIT_PATTERN);
  const matches: LiteralMatch[] = [];

  lines.forEach((text, index) => {
    if (text.includes(query)) {
      matches.push({ filePath, line: index + 1, text });
    }
  });

  return matches;
}
