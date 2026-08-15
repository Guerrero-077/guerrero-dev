import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createPostgresPool,
  loadConfig,
  PostgresProjectRepository,
  runMigrations,
  type PgPool,
} from "@guerrero-dev/infrastructure";

/**
 * Test de integración (Fase 3.17): PostgreSQL real, sin mocks.
 *
 * Se salta si RUN_INTEGRATION_TESTS no está en "true" — así `pnpm test`
 * local no requiere Docker/Postgres levantado, pero CI sí lo corre (ver
 * .github/workflows/ci.yml).
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

describe.skipIf(!RUN)("PostgresProjectRepository (integration)", () => {
  let pool: PgPool;

  beforeAll(async () => {
    const config = loadConfig();
    pool = createPostgresPool(config);
    await runMigrations(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it("crea, busca y lista proyectos reales en PostgreSQL", async () => {
    const repo = new PostgresProjectRepository(pool);
    const rootPath = `/tmp/guerrero-test-${Date.now()}`;

    const created = await repo.create({ name: "test-project", rootPath });
    expect(created.id).toBeTruthy();

    const found = await repo.findById(created.id);
    expect(found?.rootPath).toBe(rootPath);

    const all = await repo.findAll();
    expect(all.some((p) => p.id === created.id)).toBe(true);
  });

  it("findById devuelve null si el proyecto no existe", async () => {
    const repo = new PostgresProjectRepository(pool);
    const found = await repo.findById("00000000-0000-0000-0000-000000000000");
    expect(found).toBeNull();
  });
});
