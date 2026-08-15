/** Solicitud de una herramienta hecha por el LLM dentro de una sesión. */
export interface ToolRequest {
  id: string;
  sessionId: string;
  toolName: string;
  input: Record<string, unknown>;
  requestedAt: Date;
}
