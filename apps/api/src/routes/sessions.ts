import type { FastifyInstance } from "fastify";

/**
 * Placeholder (Fase 3.15): AgentSession todavía no persiste en
 * PostgreSQL ni está conectada a un ExecutionEngine real. Devuelve una
 * lista vacía para que el endpoint exista y el CLI/API contract quede
 * fijado desde ya.
 */
export function registerSessionRoutes(app: FastifyInstance): void {
  app.get("/api/v1/sessions", async () => ({
    sessions: [],
    note: "Sin persistencia todavía — agent-core/execution llegan en Fase 7.",
  }));
}
