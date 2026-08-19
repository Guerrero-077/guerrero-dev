import type { PolicyDecision, ToolRequest } from "@guerrero-dev/domain";
import type { PolicyContext, PolicyRule } from "@guerrero-dev/application";

const READ_TOOL_NAME = "read";

/**
 * Primera `PolicyRule` concreta del sistema (backlog §7 ítem 6n): aprueba
 * `"read"` + cualquier tool de solo lectura adicional que se le inyecte por
 * constructor, y deniega explícitamente todo lo demás.
 *
 * Existe para cerrar la limitación documentada al cerrar 6c —
 * `PolicyEvaluator` se construye sin reglas, y sin reglas deniega todo
 * (fail-closed). Esta es la primera excepción explícita a ese default: la
 * lectura de archivos (y, desde 6n, herramientas de Code Intelligence de
 * solo lectura — ver `additionalAllowedTools`) no muta el workspace, no
 * ejecuta nada y no sale del proceso, así que es la única categoría que se
 * puede aprobar sin pedir confirmación humana con la evidencia disponible
 * hoy.
 *
 * **`additionalAllowedTools` (Fase 6n), por qué es un parámetro y no una
 * lista hardcodeada acá**: los cuatro tools de Code Intelligence
 * (`find_symbols_by_name`, etc.) viven en `@guerrero-dev/mcp`, un package
 * hermano de `agent-core` en la capa de "implementaciones" (ver
 * `CLAUDE.md`) — `agent-core` no puede depender de `mcp` sin violar esa
 * capa, y los nombres reales que hay que aprobar están prefijados con el
 * id que el composition root le puso al servidor en `Config.mcp`
 * (`code-intelligence_find_symbols_by_name`, no `find_symbols_by_name` a
 * secas), un detalle que tampoco le compete a esta clase. Por eso el
 * composition root real (`apps/cli/src/commands/agent.ts`) es quien arma
 * la lista completa (a partir de `CODE_INTELLIGENCE_TOOL_NAMES` +
 * `CODE_INTELLIGENCE_MCP_SERVER_ID`, ambos de `@guerrero-dev/mcp`/este
 * mismo archivo) y se la pasa a esta regla ya resuelta.
 *
 * **Por qué deniega explícitamente todo lo que no está en la allow-list,
 * en vez de "dejar pasar lo que no le compete"**: `PolicyEvaluator.evaluate()`
 * agrega las reglas con semántica AND y early exit — todas tienen que
 * aprobar, y la primera que deniega gana. Una regla que devolviera
 * `allowed: true` para herramientas que no le interesan sería, si fuera la
 * única registrada, equivalente a "aprobar todo": desactivaría el
 * fail-closed del motor en lugar de acotarlo. Bajo esta semántica, la
 * allow-list vive dentro de la regla, no en el motor.
 *
 * **Limitación de composición, conocida y deliberada** (leer antes de
 * escribir la regla #2):
 *
 * - Reglas *restrictoras* (deniegan un caso puntual y aprueban el resto —
 *   p. ej. "denegar `read` de rutas fuera de `projectRootPath`") componen
 *   bien con esta bajo AND: cada una recorta, ninguna amplía.
 * - Reglas *allow-list parciales* con este mismo patrón **NO** componen:
 *   registradas juntas se anulan mutuamente. Para habilitar una
 *   herramienta más, ampliá la allow-list de ESTA clase (vía
 *   `additionalAllowedTools`, o el literal `READ_TOOL_NAME` si es de
 *   verdad de solo lectura); no agregues una segunda regla allow. Ya
 *   aplicado una vez en 6n: las cuatro tools de Code Intelligence se
 *   sumaron acá, no en una `AllowCodeIntelligenceRule` separada.
 * - Soportar varias allow-lists independientes exigiría rediseñar la
 *   agregación de `IPolicyEngine`/`PolicyEvaluator` (modelo tipo IAM: deny
 *   explícito gana; sin deny, cualquier allow explícito gana; si nadie
 *   opina, fail-closed). Ese rediseño sigue fuera de alcance — dos
 *   allow-lists reales (lectura de archivos, Code Intelligence) ya
 *   conviven bien dentro de esta única regla, sin necesitarlo todavía.
 *
 * **Qué NO hace**: ignora `request.input` y `context` por completo. No
 * valida QUÉ se lee — leer `.env`, o un archivo fuera de
 * `context.projectRootPath`, pasa esta regla sin objeción. `"read"` es
 * inofensivo respecto de mutar el workspace, no respecto de filtrar
 * secretos. Acotar el alcance de la lectura es trabajo de una regla
 * restrictora futura, que sí compone bien con esta (ver arriba).
 *
 * La comparación es exacta y sensible a mayúsculas: `"Read"` o `"read "`
 * se deniegan. Normalizar sin un caso real que lo pida sería inventar una
 * regla que nadie pidió.
 *
 * **Alcanzable en el flujo real desde Fase 6n — corrección a lo escrito en
 * 5.13/6n originalmente**: se creía (basado en los tipos de
 * `@opencode-ai/sdk`, `Agent.permission`) que `"read"` nunca era una
 * categoría real de `Config.permission` y que esta regla, por lo tanto, no
 * decidía nada en runtime. Falso — mismo tipo de desfase tipos/binario que
 * ya había revelado 5.9d: el `GET /doc` real del binario
 * (`opencode-ai@1.18.18`) expone un schema de `Config.permission` mucho
 * más rico que el declarado en `types.gen.d.ts` (incluye `"read"`
 * explícito, y un `additionalProperties` que acepta cualquier nombre de
 * tool, incluidos los de un servidor MCP). Verificado real, en vivo:
 * forzando `permission: { read: "ask" }` contra `opencode serve` real, un
 * `read` real del modelo SÍ dispara `permission.asked` con
 * `properties.permission === "read"` — antes nunca se probó contra el
 * schema real, solo se asumió de los tipos. Mismo resultado para
 * `code-intelligence_find_symbols_by_name` forzando su propia entrada en
 * `permission`. `apps/cli/src/commands/agent.ts` ahora fuerza `"ask"` para
 * las cinco categorías que esta regla conoce y registra la regla real.
 */
export class AllowReadRule implements PolicyRule {
  readonly name = "allow-read";

  private readonly allowedTools: ReadonlySet<string>;

  constructor(additionalAllowedTools: readonly string[] = []) {
    this.allowedTools = new Set([READ_TOOL_NAME, ...additionalAllowedTools]);
  }

  evaluate(request: ToolRequest, _context: PolicyContext): PolicyDecision {
    if (!this.allowedTools.has(request.toolName)) {
      return {
        toolRequestId: request.id,
        allowed: false,
        riskLevel: "high",
        reason: `Herramienta "${request.toolName}" fuera de la allow-list de allow-read (${[...this.allowedTools].map((t) => `"${t}"`).join(", ")}): denegado por defecto (fail-closed).`,
        decidedAt: new Date(),
      };
    }

    return {
      toolRequestId: request.id,
      allowed: true,
      riskLevel: "low",
      reason: `Herramienta "${request.toolName}": lectura sin efectos secundarios sobre el workspace, aprobada explícitamente por allow-read.`,
      decidedAt: new Date(),
    };
  }
}
