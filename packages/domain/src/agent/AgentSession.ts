/**
 * Una sesión de agente: una conversación/ejecución con un motor de
 * ejecución (Cline SDK, OpenCode adapter, etc.) sobre un proyecto.
 */
export type AgentSessionStatus = "idle" | "running" | "waiting_for_approval" | "completed" | "failed";

export interface AgentSession {
  id: string;
  projectId: string;
  status: AgentSessionStatus;
  engine: string;
  modelName: string;
  createdAt: Date;
  updatedAt: Date;
}
