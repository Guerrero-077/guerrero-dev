import type { FastifyInstance } from "fastify";
import type { PgPool } from "@guerrero-dev/infrastructure";

/**
 * Health checks (Fase 3.14).
 *
 * - `/health`: el proceso está corriendo. No toca dependencias.
 * - `/health/ready`: el proceso + PostgreSQL (y en el futuro, otras
 *   dependencias requeridas) están disponibles.
 */
export function registerHealthRoutes(app: FastifyInstance, pool: PgPool): void {
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/v1/health", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    const checks: Record<string, boolean> = {};

    try {
      await pool.query("SELECT 1");
      checks["database"] = true;
    } catch {
      checks["database"] = false;
    }

    const ready = Object.values(checks).every(Boolean);
    reply.code(ready ? 200 : 503);
    return { status: ready ? "ok" : "error", checks };
  });
}
