import type { FastifyInstance } from "fastify";

/**
 * Health checks (Fase 3.14).
 *
 * - `/health`: el proceso está corriendo. No toca dependencias.
 * - `/health/ready`: el proceso + PostgreSQL están disponibles (vía
 *   `fastify.pgPool`, decorado por `plugins/database.ts`).
 */
export function registerHealthRoutes(app: FastifyInstance): void {
  app.get("/health", async () => ({ status: "ok" }));
  app.get("/api/v1/health", async () => ({ status: "ok" }));

  app.get("/health/ready", async (_request, reply) => {
    const checks: Record<string, boolean> = {};

    try {
      await app.pgPool.query("SELECT 1");
      checks["database"] = true;
    } catch {
      checks["database"] = false;
    }

    const ready = Object.values(checks).every(Boolean);
    reply.code(ready ? 200 : 503);
    return { status: ready ? "ok" : "error", checks };
  });
}
