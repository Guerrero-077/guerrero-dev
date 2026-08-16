import { randomUUID } from "node:crypto";
import type { ProjectProfile } from "@guerrero-dev/domain";
import {
  createDrizzleClient,
  createPostgresPool,
  DrizzleProjectIntelligenceRepository,
  DrizzleProjectRepository,
  loadConfig,
  runMigrations,
  type PgPool,
} from "@guerrero-dev/infrastructure";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test de integración (Fase 5.6): PostgreSQL real, sin mocks, a través de
 * Drizzle — mismo patrón que `project-repository.test.ts`/
 * `memory-repository.test.ts`. Se salta si RUN_INTEGRATION_TESTS no está
 * en "true".
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

function buildProfile(projectId: string, overrides: Partial<ProjectProfile> = {}): ProjectProfile {
  return {
    id: randomUUID(),
    projectId,
    schemaVersion: 1,
    scannedAt: new Date(),
    technologies: [
      {
        name: "TypeScript",
        category: "language",
        sourceFile: "package.json",
        evidence: "devDependencies.typescript",
      },
    ],
    components: [{ name: "api", path: "apps/api", type: "app" }],
    dependencies: [{ componentPath: "apps/api", name: "fastify", versionRange: "^5.2.0" }],
    structure: ["apps", "apps/api"],
    configuration: { hasCI: true },
    ...overrides,
  };
}

describe.skipIf(!RUN)("DrizzleProjectIntelligenceRepository (integration)", () => {
  let pool: PgPool;
  let repo: DrizzleProjectIntelligenceRepository;
  let projectId: string;

  beforeAll(async () => {
    const config = loadConfig();
    pool = createPostgresPool(config);
    await runMigrations(pool);
    const db = createDrizzleClient(pool);
    repo = new DrizzleProjectIntelligenceRepository(db);

    const projectRepo = new DrizzleProjectRepository(db);
    const now = new Date();
    const project = await projectRepo.create({
      id: randomUUID(),
      name: "project-intelligence-test",
      path: `/tmp/guerrero-pi-test-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await pool.end();
  });

  it("upsert() inserta la primera vez y findByProjectId recupera un perfil idéntico, con JSONB intacto", async () => {
    const profile = buildProfile(projectId);

    const created = await repo.upsert(profile);
    expect(created.id).toBe(profile.id);

    const found = await repo.findByProjectId(projectId);
    expect(found).toEqual(profile);
  });

  it("un segundo upsert() sobre el mismo projectId actualiza la fila existente, no crea una segunda, y conserva el id original", async () => {
    const first = await repo.upsert(buildProfile(projectId, { technologies: [] }));

    const secondAttempt = buildProfile(projectId, {
      id: randomUUID(),
      technologies: [
        {
          name: "Fastify",
          category: "framework",
          sourceFile: "apps/api/package.json",
          evidence: "dependencies.fastify",
        },
      ],
    });
    const second = await repo.upsert(secondAttempt);

    // El id se conserva: un re-scan no crea otra identidad de ProjectProfile.
    expect(second.id).toBe(first.id);
    expect(second.id).not.toBe(secondAttempt.id);

    const found = await repo.findByProjectId(projectId);
    expect(found?.id).toBe(first.id);
    expect(found?.technologies).toEqual(secondAttempt.technologies);
  });

  it("scannedAt se reemplaza en cada scan, confirmando que el perfil anterior queda reemplazado", async () => {
    const firstScan = new Date("2026-01-01T00:00:00.000Z");
    const secondScan = new Date("2026-06-01T00:00:00.000Z");

    await repo.upsert(buildProfile(projectId, { scannedAt: firstScan }));
    await repo.upsert(buildProfile(projectId, { scannedAt: secondScan }));

    const found = await repo.findByProjectId(projectId);
    expect(found?.scannedAt.toISOString()).toBe(secondScan.toISOString());
  });

  it("findByProjectId devuelve null si no hay perfil para ese proyecto", async () => {
    const found = await repo.findByProjectId(randomUUID());
    expect(found).toBeNull();
  });
});
