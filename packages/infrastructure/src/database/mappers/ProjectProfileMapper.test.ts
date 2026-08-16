import { randomUUID } from "node:crypto";
import type { ProjectComponent, ProjectDependency, ProjectProfile, Technology } from "@guerrero-dev/domain";
import { describe, expect, it } from "vitest";
import { ProjectProfileMapper, type ProjectProfileRow } from "./ProjectProfileMapper.js";

const TECHNOLOGIES: readonly Technology[] = [
  {
    name: "TypeScript",
    category: "language",
    sourceFile: "package.json",
    evidence: "devDependencies.typescript",
  },
  {
    name: "Fastify",
    category: "framework",
    sourceFile: "apps/api/package.json",
    evidence: "dependencies.fastify",
  },
];

const COMPONENTS: readonly ProjectComponent[] = [
  { name: "api", path: "apps/api", type: "app" },
  { name: "domain", path: "packages/domain", type: "package" },
];

const DEPENDENCIES: readonly ProjectDependency[] = [
  { componentPath: "apps/api", name: "fastify", versionRange: "^5.2.0" },
];

const STRUCTURE: readonly string[] = ["apps", "apps/api", "packages", "packages/domain"];

const CONFIGURATION: Record<string, unknown> = { hasCI: true };

function buildProfile(): ProjectProfile {
  return {
    id: randomUUID(),
    projectId: randomUUID(),
    schemaVersion: 1,
    scannedAt: new Date("2026-08-16T12:00:00.000Z"),
    technologies: TECHNOLOGIES,
    components: COMPONENTS,
    dependencies: DEPENDENCIES,
    structure: STRUCTURE,
    configuration: CONFIGURATION,
  };
}

/** Simula exactamente lo que Drizzle devuelve tras un SELECT/RETURNING real contra `project_profiles`. */
function buildRow(profile: ProjectProfile): ProjectProfileRow {
  return {
    id: profile.id,
    projectId: profile.projectId,
    schemaVersion: profile.schemaVersion,
    scannedAt: profile.scannedAt,
    technologies: profile.technologies,
    components: profile.components,
    dependencies: profile.dependencies,
    structure: profile.structure,
    configuration: profile.configuration,
  };
}

describe("ProjectProfileMapper", () => {
  it("toRow produce una fila con exactamente los mismos campos que el ProjectProfile de dominio", () => {
    const profile = buildProfile();

    expect(ProjectProfileMapper.toRow(profile)).toEqual({
      id: profile.id,
      projectId: profile.projectId,
      schemaVersion: 1,
      scannedAt: profile.scannedAt,
      technologies: TECHNOLOGIES,
      components: COMPONENTS,
      dependencies: DEPENDENCIES,
      structure: STRUCTURE,
      configuration: CONFIGURATION,
    });
  });

  it("toDomain produce un ProjectProfile equivalente a partir de una fila ya deserializada", () => {
    const profile = buildProfile();

    expect(ProjectProfileMapper.toDomain(buildRow(profile))).toEqual(profile);
  });

  it("round-trip toRow -> toDomain preserva technologies[]/components[]/dependencies[]/structure[]/configuration sin alterar su forma", () => {
    const profile = buildProfile();

    const roundTripped = ProjectProfileMapper.toDomain(buildRow(profile));

    expect(roundTripped.technologies).toEqual(TECHNOLOGIES);
    expect(roundTripped.components).toEqual(COMPONENTS);
    expect(roundTripped.dependencies).toEqual(DEPENDENCIES);
    expect(roundTripped.structure).toEqual(STRUCTURE);
    expect(roundTripped.configuration).toEqual(CONFIGURATION);
  });

  it("round-trip con arrays vacíos y configuration vacío no pierde ni inventa datos", () => {
    const profile: ProjectProfile = {
      ...buildProfile(),
      technologies: [],
      components: [],
      dependencies: [],
      structure: [],
      configuration: {},
    };

    const roundTripped = ProjectProfileMapper.toDomain(buildRow(profile));

    expect(roundTripped).toEqual(profile);
  });
});
