/**
 * infrastructure/code-intelligence
 *
 * `TsMorphCodeAnalyzer` (Fase 6.3): implementación real de `ICodeAnalyzer`
 * vía `ts-morph`, encapsulado aquí en su totalidad — no forma parte de
 * los contratos de dominio ni aplicación (mapa §9). `extractSymbols`/
 * `extractEdges` son helpers internos, no se exponen en este barrel —
 * mismo criterio que `parseTrackedFiles`/`parseCommitList` en
 * infrastructure/git.
 */
export * from "./TsMorphCodeAnalyzer.js";
export * from "./TsMorphCodeAnalyzerError.js";
