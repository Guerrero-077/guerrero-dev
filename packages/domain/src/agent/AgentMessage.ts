/**
 * Un mensaje dentro de una AgentSession — del usuario, del asistente, o de
 * una herramienta (resultado de ejecutar un ToolRequest).
 */
export type AgentMessageRole = "user" | "assistant" | "tool" | "system";

export interface AgentMessage {
  id: string;
  sessionId: string;
  role: AgentMessageRole;
  content: string;
  createdAt: Date;
}
