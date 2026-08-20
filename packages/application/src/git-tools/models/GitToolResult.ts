import type { GitLogEntry, GitStatusEntry } from "../ports/IGitWorkingTreeSource.js";

/** Resultado de `GitToolHandler.handle()`, discriminado por `toolName`. */
export type GitToolResult =
  | { readonly toolName: "git_status"; readonly entries: readonly GitStatusEntry[] }
  | { readonly toolName: "git_diff"; readonly diff: string }
  | { readonly toolName: "git_log"; readonly entries: readonly GitLogEntry[] };
