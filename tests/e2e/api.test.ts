import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { createPostgresPool, loadConfig, runMigrations, type PgPool } from "@guerrero-dev/infrastructure";
import { buildServer } from "@guerrero-dev/api/server";

/**
 * Test e2e (Fase 3.15): API + PostgreSQL real, sin abrir un puerto TCP
 * (usa `app.inject()`). Igual que los tests de integración, se salta sin
 * RUN_INTEGRATION_TESTS=true.
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

describe.skipIf(!RUN)("API (e2e)", () => {
  let pool: PgPool;
  let app: FastifyInstance;

  beforeAll(async () => {
    const config = loadConfig();
    pool = createPostgresPool(config);
    await runMigrations(pool);
    app = await buildServer({ pool });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it("GET /health responde ok sin tocar la base de datos", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("GET /health/ready reporta database:true con PostgreSQL arriba", async () => {
    const res = await app.inject({ method: "GET", url: "/health/ready" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ status: "ok", checks: { database: true } });
  });

  it("POST /api/v1/projects crea y GET /api/v1/projects lo lista", async () => {
    const path = `/tmp/e2e-${Date.now()}`;
    const create = await app.inject({
      method: "POST",
      url: "/api/v1/projects",
      payload: { name: "e2e-project", path },
    });
    expect(create.statusCode).toBe(201);
    expect(create.json().project.path).toBe(path);

    const list = await app.inject({ method: "GET", url: "/api/v1/projects" });
    expect(list.statusCode).toBe(200);
    expect(list.json().projects.some((p: { path: string }) => p.path === path)).toBe(true);
  });

  it("POST /api/v1/projects sin path devuelve 400", async () => {
    const res = await app.inject({ method: "POST", url: "/api/v1/projects", payload: { name: "sin-path" } });
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/v1/sessions responde (placeholder, sin persistencia)", async () => {
    const res = await app.inject({ method: "GET", url: "/api/v1/sessions" });
    expect(res.statusCode).toBe(200);
    expect(res.json().sessions).toEqual([]);
  });
});
