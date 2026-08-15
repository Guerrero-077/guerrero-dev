/**
 * Referencia a un commit encontrado por `ICommitAnalyzer` mediante una
 * heurística estructural barata sobre Git — NO una relación semántica
 * confirmada (`reinforces`/`supersedes`/etc., ver
 * `docs/benchmarks/candidate-detection/taxonomy.md`). Un `CommitReference`
 * es un candidato de contexto histórico; determinar si la relación es real
 * y de qué tipo es trabajo de `ICandidateExtractor`, no de `ICommitAnalyzer`.
 *
 * Frontera explícita para qué heurísticas producen un `CommitReference`
 * (decisión congelada, ver §14f/14g de `fase-4-memory-engine.md`):
 *
 * Sí — relación estructural observable en Git, sin interpretación:
 * - overlap de `touchedPaths` (mismo archivo tocado antes)
 * - overlap de directorio (mismo directorio, archivo distinto)
 * - continuidad de archivo renombrado (`git log --follow`)
 *
 * No — señales que sugieren relación pero no la demuestran técnicamente,
 * y que mezclarían "estructura observable" con "significado arquitectónico"
 * dentro del analyzer:
 * - mismo autor
 * - ventana temporal (commits cercanos en el tiempo)
 * - feature adivinada desde nombres de carpeta
 * - vocabulario compartido del mensaje de commit
 *
 * El caso que originalmente motivó esta distinción (`bf7f9fb` refuerza a
 * `96f2719` sin compartir paths) resultó, al verificarlo contra Git real,
 * ser falso: ambos comparten paths exactos (barrels `index.ts` que
 * `bf7f9fb` actualiza) — la heurística de path overlap sí lo encuentra
 * (ver §14g/§14i, `fase-4-memory-engine.md`). La decisión de no ampliar
 * esta lista con señales no-estructurales se mantiene por sus propios
 * méritos, no por ese ejemplo: si en el futuro aparece un caso real de
 * relación conceptual sin ningún overlap estructural y el
 * `CandidateExtractor` falla sistemáticamente en encontrarla, esa sería la
 * evidencia que justificaría una segunda fuente de contexto histórico —
 * no una ampliación especulativa de `ICommitAnalyzer` hoy.
 */
export interface CommitReference {
  readonly sha: string;
}
