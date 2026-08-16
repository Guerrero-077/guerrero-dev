import { randomUUID } from "node:crypto";
import type { ProjectProfile } from "@guerrero-dev/domain";
import { describe, expect, it } from "vitest";
import type { IProjectIntelligenceRepository } from "../../common/ports/IProjectIntelligenceRepository.js";
import { ProjectIntelligenceProvider } from "./ProjectIntelligenceProvider.js";

function fakeRepository(result: ProjectProfile | null): {
  repository: IProjectIntelligenceRepository;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    repository: {
      async findByProjectId(projectId) {
        calls.push(projectId);
        return result;
      },
      async upsert() {
        throw new Error("no usado en estos tests");
      },
    },
    calls,
  };
}

const SAMPLE_PROFILE: ProjectProfile = {
  id: randomUUID(),
  projectId: randomUUID(),
  schemaVersion: 1,
  scannedAt: new Date(),
  technologies: [],
  components: [],
  dependencies: [],
  structure: [],
  configuration: {},
};

describe("ProjectIntelligenceProvider", () => {
  it("getProjectProfile delega exactamente en repository.findByProjectId y devuelve lo mismo", async () => {
    const { repository, calls } = fakeRepository(SAMPLE_PROFILE);
    const provider = new ProjectIntelligenceProvider(repository);

    const result = await provider.getProjectProfile(SAMPLE_PROFILE.projectId);

    expect(calls).toEqual([SAMPLE_PROFILE.projectId]);
    expect(result).toBe(SAMPLE_PROFILE);
  });

  it("un proyecto sin perfil devuelve null, propagado tal cual", async () => {
    const { repository } = fakeRepository(null);
    const provider = new ProjectIntelligenceProvider(repository);

    const result = await provider.getProjectProfile(randomUUID());

    expect(result).toBeNull();
  });
});
