/**
 * infrastructure/code-intelligence
 *
 * `TsMorphCodeAnalyzer` (Fase 6.3): implementación real de `ICodeAnalyzer`
 * vía `ts-morph`, encapsulado aquí en su totalidad — no forma parte de
 * los contratos de dominio ni aplicación (mapa §9). `LiteralCodeSearch`
 * (Fase 6.4): implementación real de `ICodeLiteralSearch`, texto plano
 * sin AST ni `ts-morph`. `extractSymbols`/`extractEdges`/
 * `findLiteralMatches` son helpers internos, no se exponen en este
 * barrel — mismo criterio que `parseTrackedFiles`/`parseCommitList` en
 * infrastructure/git.
 */
export * from "./LiteralCodeSearch.js";
export * from "./TsMorphCodeAnalyzer.js";
export * from "./TsMorphCodeAnalyzerError.js";
