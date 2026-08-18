import type { AgentTask, ProjectProfile } from "@guerrero-dev/domain";
import type {
  IMemoryRetriever,
  IProjectIntelligenceProvider,
  MemorySearchResult,
} from "@guerrero-dev/application";

/**
 * Fase 5.8: primera integración real de Agent Core con Project
 * Intelligence. Fase 5.4a: segunda integración real, con Memory
 * (`IMemoryRetriever`). `agent-core` depende únicamente de puertos de
 * `application/common` — el `package.json` de este paquete no lista
 * `@guerrero-dev/infrastructure` como dependencia, así que no hay forma de
 * importar ninguna implementación concreta (Drizzle/Ollama) aquí, ni
 * siquiera por accidente.
 *
 * El formato de `systemPrompt` de abajo es deliberadamente provisional: el
 * mapa de Fase 5 (§8) dejó explícito que la forma final de convertir
 * `ProjectProfile`/memorias en texto depende de cómo responda un LLM real
 * (Fase 5.5), todavía no conectado. Esta clase demuestra que el dato fluye
 * de PostgreSQL al contexto — no resuelve prompt engineering.
 */
export interface BuiltContext {
  systemPrompt: string;
  messages: string[];
}

export class ContextBuilder {
  constructor(
    private readonly projectIntelligenceProvider: IProjectIntelligenceProvider,
    private readonly memoryRetriever: IMemoryRetriever,
  ) {}

  async build(task: AgentTask): Promise<BuiltContext> {
    const profile = await this.projectIntelligenceProvider.getProjectProfile(task.projectId);
    const memories = await this.memoryRetriever.search({
      text: task.instruction,
      projectId: task.projectId,
    });

    return {
      systemPrompt: this.buildSystemPrompt(task, profile, memories),
      messages: [task.instruction],
    };
  }

  private buildSystemPrompt(
    task: AgentTask,
    profile: ProjectProfile | null,
    memories: readonly MemorySearchResult[],
  ): string {
    const base = `Eres el agente de Guerrero Dev trabajando en el proyecto ${task.projectId}.`;
    const lines = [base];

    if (profile !== null) {
      // Set conserva el orden de primera aparición (no ordena alfabéticamente) —
      // el orden observable coincide con el que produjo ProjectProfileScanner
      // (5.7): workspace, luego manifiesto raíz, luego cada componente. Esto
      // deduplica exclusivamente la representación textual, nunca
      // profile.technologies en sí.
      const technologyNames = [...new Set(profile.technologies.map((technology) => technology.name))];
      if (technologyNames.length > 0) {
        lines.push("", `Tecnologías: ${technologyNames.join(", ")}.`);
      }

      if (profile.components.length > 0) {
        lines.push(
          "",
          "Componentes:",
          ...profile.components.map((component) => `- ${component.path} (${component.type})`),
        );
      }
    }

    if (memories.length > 0) {
      lines.push("", "Memorias relevantes:", ...memories.map((result) => `- ${result.memory.content}`));
    }

    return lines.join("\n");
  }
}
