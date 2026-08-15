import type { CommitSignal } from "../models/CommitSignal.js";
import type { CommitSnapshot } from "../models/CommitSnapshot.js";

/**
 * Convierte un `CommitSnapshot` crudo en un `CommitSignal` analítico
 * (Fase 4.8). Puede usar mensaje/diff/paths/extensiones/metadata del
 * commit, y commits recientes relacionados vía `git log` — nunca memoria
 * persistida (`IMemoryRepository`, `IMemoryCandidateRetriever`,
 * embeddings, pgvector). Ver el JSDoc de `CommitSignal` para el porqué de
 * ese límite.
 */
export interface ICommitAnalyzer {
  analyze(commit: CommitSnapshot): Promise<CommitSignal>;
}
