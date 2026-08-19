import type { PolicyDecision, ToolRequest } from "@guerrero-dev/domain";
import type { PolicyContext, PolicyRule } from "@guerrero-dev/application";

const READ_TOOL_NAME = "read";

/**
 * Primera `PolicyRule` concreta del sistema (backlog §7 ítem 6n): aprueba
 * la herramienta `"read"` y deniega explícitamente cualquier otra.
 *
 * Existe para cerrar la limitación documentada al cerrar 6c —
 * `PolicyEvaluator` se construye sin reglas, y sin reglas deniega todo
 * (fail-closed). Esta es la primera excepción explícita a ese default: la
 * lectura de archivos no muta el workspace, no ejecuta nada y no sale del
 * proceso, así que es la única categoría que se puede aprobar sin pedir
 * confirmación humana con la evidencia disponible hoy.
 *
 * **Por qué deniega explícitamente todo lo que no es `"read"`, en vez de
 * "dejar pasar lo que no le compete"**: `PolicyEvaluator.evaluate()` agrega
 * las reglas con semántica AND y early exit — todas tienen que aprobar, y
 * la primera que deniega gana. Una regla que devolviera `allowed: true`
 * para herramientas que no le interesan sería, si fuera la única
 * registrada, equivalente a "aprobar todo": desactivaría el fail-closed del
 * motor en lugar de acotarlo. Bajo esta semántica, la allow-list vive
 * dentro de la regla, no en el motor.
 *
 * **Limitación de composición, conocida y deliberada** (leer antes de
 * escribir la regla #2):
 *
 * - Reglas *restrictoras* (deniegan un caso puntual y aprueban el resto —
 *   p. ej. "denegar `read` de rutas fuera de `projectRootPath`") componen
 *   bien con esta bajo AND: cada una recorta, ninguna amplía.
 * - Reglas *allow-list parciales* con este mismo patrón (p. ej. un
 *   `AllowGlobRule` que apruebe `"glob"` y deniegue el resto) **NO**
 *   componen: registradas juntas se anulan mutuamente — un pedido de
 *   `"glob"` sería denegado por esta regla por no ser `"read"`, aunque la
 *   otra lo aprobara. Para habilitar una herramienta más, ampliá la
 *   allow-list de ESTA clase; no agregues una segunda regla allow.
 * - Soportar varias allow-lists independientes exigiría rediseñar la
 *   agregación de `IPolicyEngine`/`PolicyEvaluator` (modelo tipo IAM: deny
 *   explícito gana; sin deny, cualquier allow explícito gana; si nadie
 *   opina, fail-closed). Ese rediseño está fuera del alcance de este
 *   incremento y no se hace sin un segundo caso real que lo justifique.
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
 * **No es alcanzable en el flujo real de `agent run` todavía, y no se
 * registra en el composition root en este incremento** (verificado, no
 * asumido): `OpenCodeExecutionEngine.handlePermissionEvents()` solo produce
 * `toolName` con las categorías de permiso de OpenCode (`"edit"`,
 * `"bash"`, `"webfetch"`, `"external_directory"`) — nunca `"read"` —, y el
 * bucle de política de `AgentOrchestrator.run()` está muerto con el motor
 * OpenCode porque `ToolSelector.selectToolSteps()` siempre filtra a `[]`
 * (los steps de `OpenCodeExecutionEngine.plan()` no llevan `toolRequest`).
 * Registrarla hoy en `apps/cli/src/commands/agent.ts` sería seguro pero
 * inútil: no cambiaría ninguna decisión real, y sugeriría una cobertura de
 * lectura que no existe. Queda como base para cuando el motor exponga tool
 * calls granulares — momento en el que además habrá que decidir cuál es el
 * vocabulario canónico de `toolName` (categorías de OpenCode vs. nombres
 * internos como `"read"`), hoy divergentes.
 */
export class AllowReadRule implements PolicyRule {
  readonly name = "allow-read";

  evaluate(request: ToolRequest, _context: PolicyContext): PolicyDecision {
    if (request.toolName !== READ_TOOL_NAME) {
      return {
        toolRequestId: request.id,
        allowed: false,
        riskLevel: "high",
        reason: `Herramienta "${request.toolName}" fuera de la allow-list de allow-read (solo "${READ_TOOL_NAME}"): denegado por defecto (fail-closed).`,
        decidedAt: new Date(),
      };
    }

    return {
      toolRequestId: request.id,
      allowed: true,
      riskLevel: "low",
      reason: `Herramienta "${READ_TOOL_NAME}": lectura sin efectos secundarios sobre el workspace, aprobada explícitamente por allow-read.`,
      decidedAt: new Date(),
    };
  }
}
