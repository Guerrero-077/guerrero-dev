import { describe, expect, it } from "vitest";
import type { MemoryCandidate } from "@guerrero-dev/domain";
import { NoopMemoryConflictDetector } from "./NoopMemoryConflictDetector.js";

function buildCandidate(overrides: Partial<MemoryCandidate> = {}): MemoryCandidate {
  return {
    type: "fact",
    scope: "global",
    projectId: null,
    content: "Miller utiliza PostgreSQL.",
    confidence: 0.8,
    importance: 0.6,
    source: { sourceType: "conversation", sourceReference: "chat-1" },
    ...overrides,
  };
}

describe("NoopMemoryConflictDetector", () => {
  it("siempre devuelve un array vacío, sin importar el candidato", async () => {
    const detector = new NoopMemoryConflictDetector();

    const conflicts = await detector.findConflicts(buildCandidate());

    expect(conflicts).toEqual([]);
  });

  it("no lanza ni depende de infraestructura externa", async () => {
    const detector = new NoopMemoryConflictDetector();

    await expect(
      detector.findConflicts(buildCandidate({ type: "decision", content: "Contradicción hipotética." })),
    ).resolves.toEqual([]);
  });
});
