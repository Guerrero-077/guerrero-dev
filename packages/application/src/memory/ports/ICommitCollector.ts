import type { CommitSnapshot } from "../models/CommitSnapshot.js";

/**
 * Convierte un commit real de Git (identificado por `sha`) en el
 * `CommitSnapshot` que ya consume `ICommitAnalyzer` (Fase 4.8).
 *
 * Decisión arquitectónica nueva, no una que el diseño original de 4.8
 * hubiera especificado: el único rastro previo de esta pieza era el
 * nombre "Commit Collector" en el JSDoc de `CommitSnapshot.ts`, sin
 * puerto ni sección de diseño propia. Se agrega ahora porque sin ella
 * ninguna implementación real de `ICommitAnalyzer`/`ICommitNoiseFilter`/
 * `ICandidateExtractor` puede alimentarse de un commit real — hasta este
 * punto todos los tests (unitarios y golden dataset) construían
 * `CommitSnapshot`/`CommitSignal` a mano.
 *
 * Deliberadamente angosto, mismo criterio que `IGitHistorySource`
 * (§14h, `docs/fase-4-memory-engine.md`): una sola responsabilidad —
 * traducir `Git -> CommitSnapshot`, sin decidir nada sobre ruido, riesgo,
 * ni candidatas, y sin consultar memoria persistida.
 */
export interface ICommitCollector {
  collect(sha: string): Promise<CommitSnapshot>;
}
