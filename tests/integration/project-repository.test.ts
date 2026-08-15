import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createDrizzleClient,
  createPostgresPool,
  DrizzleProjectRepository,
  loadConfig,
  runMigrations,
  type PgPool,
} from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 3.15): PostgreSQL real, sin mocks, a través
 * de Drizzle.
 *
 * Se salta si RUN_INTEGRATION_TESTS no está en "true" — así `pnpm test`
 * local no requiere Docker/Postgres levantado, pero CI sí lo corre.
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

describe.skipIf(!RUN)("DrizzleProjectRepository (integration)", () => {
  let pool: PgPool;
  let repo: DrizzleProjectRepository;

  beforeAll(async () => {
    const config = loadConfig();
    pool = createPostgresPool(config);
    await runMigrations(pool);
    repo = new DrizzleProjectRepository(createDrizzleClient(pool));
  });

  afterAll(async () => {
    await pool.end();
  });

  it("crea, busca y lista proyectos reales en PostgreSQL", async () => {
    const now = new Date();
    const project = {
      id: randomUUID(),
      name: "test-project",
      path: `/tmp/guerrero-test-${Date.now()}`,
      createdAt: now,
      updatedAt: now,
    };

    const created = await repo.create(project);
    expect(created.id).toBe(project.id);

    const found = await repo.findById(created.id);
    expect(found?.path).toBe(project.path);

    const all = await repo.findAll();
    expect(all.some((p) => p.id === created.id)).toBe(true);
  });

  it("findById devuelve null si el proyecto no existe", async () => {
    const found = await repo.findById("00000000-0000-0000-0000-000000000000");
    expect(found).toBeNull();
  });
});
