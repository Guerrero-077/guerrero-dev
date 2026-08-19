import { relative, resolve, sep } from "node:path";
import type { PolicyDecision, ToolRequest } from "@guerrero-dev/domain";
import type { PolicyContext, PolicyRule } from "@guerrero-dev/application";

const READ_ONLY_TOOL_NAME = "read";

/**
 * Clave real del campo de `ToolRequest.input` (== `permission.asked.properties.metadata`
 * de OpenCode, ver `OpenCodeExecutionEngine.handlePermissionEvents()`) que trae la ruta
 * del archivo objetivo de una edición — **sin confirmar, a propósito**
 * (`docs/fase-6-developer-tools-map.md` §4/§8.3). Hay una hipótesis circunstancial ("file" o
 * "filePath", por analogía con el evento no relacionado `"file.edited"` del módulo `v2` del
 * SDK, `properties: { file: string }`) pero cero observación directa de un `permission.asked`
 * real de tipo `"edit"` — adivinar acá sería exactamente lo que este incremento decidió no
 * hacer. El valor centinela de abajo nunca va a coincidir con ninguna clave real, así que
 * `evaluateEdit()` deniega todo por fail-closed (`typeof targetPath !== "string"`) hasta que
 * alguien lo reemplace deliberadamente — no hay forma de que esta regla apruebe una edición
 * real por accidente mientras este valor siga sin tocar. Reemplazarlo por el nombre
 * confirmado en 6.1 (captura real contra `opencode serve` + Ollama) es el único cambio de
 * código que 6.1 debería requerir.
 */
export const EDIT_TARGET_PATH_METADATA_KEY = "UNCONFIRMED_PENDING_FASE_6_1_EVIDENCE";

/**
 * Deny-list real para `guerrero-dev` (`docs/fase-6-developer-tools-map.md` §8.1) — no
 * genérica. Rutas relativas a `PolicyContext.projectRootPath`, normalizadas con `/`.
 * `.git` y `.env`/`.env.local` cubren un prefijo de directorio/archivo (cualquier ruta que
 * empiece con esos segmentos); las migraciones y el lockfile son archivos exactos.
 *
 * Deliberadamente NO incluye toda la carpeta `migrations/` — una migración nueva, todavía
 * sin aplicar, sí debe poder crearse/editarse (ver CLAUDE.md: "nunca edites una migración
 * ya aplicada — agregá una nueva"). Esta lista hace cumplir esa regla ya escrita, no inventa
 * una nueva; si se agrega una migración real nueva, esta lista queda desactualizada a
 * propósito hasta que alguien la revise — no se genera dinámicamente sin evidencia de que
 * haga falta.
 */
const SENSITIVE_RELATIVE_PATHS: readonly string[] = [
  ".env",
  ".env.local",
  ".git",
  "pnpm-lock.yaml",
  "packages/infrastructure/src/database/migrations/0001_init.sql",
  "packages/infrastructure/src/database/migrations/0002_memory_tables.sql",
  "packages/infrastructure/src/database/migrations/0003_memory_embeddings_vector.sql",
  "packages/infrastructure/src/database/migrations/0004_project_profiles.sql",
];

/**
 * Segunda `PolicyRule` real del sistema (Fase 6.3, `docs/fase-6-developer-tools-map.md`
 * §8), sucesora de `AllowReadRule` (5.13/6n) — la reemplaza, no convive con ella:
 * `PolicyEvaluator.evaluate()` agrega con AND + early-exit-on-deny (ver `PolicyEvaluator.ts`),
 * así que dos allow-lists parciales registradas juntas se anulan mutuamente (misma
 * limitación de composición ya documentada en `AllowReadRule`). Por eso esta clase absorbe
 * TODO lo que `AllowReadRule` ya aprobaba (`"read"` + tools de Code Intelligence inyectadas
 * por constructor, idéntico contrato) y agrega una segunda categoría real: `"edit"`, con su
 * propia validación — no una allow-list ciega como la de lectura.
 *
 * **Por qué `"edit"` no puede ser una allow-list ciega como `"read"`**: `"read"` no muta el
 * workspace: aprobarla sin mirar `request.input` es seguro. `"edit"` sí muta — el caso real
 * casi-incidente de Fase 5.9e (el modelo intentó reescribir `package.json` con contenido
 * corrupto, denegado solo porque `PolicyEvaluator` era fail-closed sin ninguna regla) es
 * evidencia directa de que aprobar `edit` sin condiciones es un riesgo real, no hipotético.
 * `evaluateEdit()` exige: (a) que `request.input` traiga un path bajo
 * `EDIT_TARGET_PATH_METADATA_KEY` (si no, deniega — fail-closed, cubre tanto el caso real de
 * que OpenCode no lo mande como el caso, hoy vigente, de que la clave no esté confirmada);
 * (b) que el path resuelto quede dentro de `context.projectRootPath` — segunda capa de
 * defensa en profundidad además de `external_directory` (que ya gatea esto a nivel de
 * motor, capa separada, mismo criterio que `EXECUTION_TIMEOUT_MS`, Fase 5.9c); (c) que no
 * esté en `SENSITIVE_RELATIVE_PATHS`.
 *
 * **Estado real de alcanzabilidad en runtime, honesto y verificado, no asumido**: aunque
 * esta clase SÍ decide sobre `"edit"` en cuanto se registre en el composition root
 * (`PERMISSION.edit: "ask"` ya fuerza el evento real desde Fase 5.9b — confirmado en
 * `apps/cli/src/commands/agent.ts`), el agente `build` tiene la tool `edit` apagada vía
 * `DISABLED_TOOLS.edit: false` — el modelo no puede ni intentar invocarla todavía. Registrar
 * esta clase en el composition root es seguro (no cambia ningún comportamiento observable
 * mientras `DISABLED_TOOLS.edit` siga en `false`) y necesario para no perder la cobertura de
 * `"read"`/Code Intelligence que `AllowReadRule` ya daba. Reactivar `edit` de verdad
 * (`DISABLED_TOOLS.edit: true`) es Fase 6.4, posterior y separada — no parte de este cambio.
 */
export class AllowScopedMutationRule implements PolicyRule {
  readonly name = "allow-scoped-mutation";

  private readonly allowedReadOnlyTools: ReadonlySet<string>;

  constructor(additionalReadOnlyTools: readonly string[] = []) {
    this.allowedReadOnlyTools = new Set([READ_ONLY_TOOL_NAME, ...additionalReadOnlyTools]);
  }

  evaluate(request: ToolRequest, context: PolicyContext): PolicyDecision {
    if (this.allowedReadOnlyTools.has(request.toolName)) {
      return approve(
        request,
        `Herramienta "${request.toolName}": lectura sin efectos secundarios sobre el workspace, aprobada explícitamente por allow-scoped-mutation.`,
      );
    }

    if (request.toolName === "edit") {
      return this.evaluateEdit(request, context);
    }

    return deny(
      request,
      `Herramienta "${request.toolName}" fuera del alcance de allow-scoped-mutation (lectura: ${[...this.allowedReadOnlyTools].map((t) => `"${t}"`).join(", ")}; mutación: "edit"): denegado por defecto (fail-closed).`,
    );
  }

  private evaluateEdit(request: ToolRequest, context: PolicyContext): PolicyDecision {
    const targetPath = request.input[EDIT_TARGET_PATH_METADATA_KEY];

    if (typeof targetPath !== "string" || targetPath.length === 0) {
      return deny(
        request,
        `No se pudo determinar el archivo objetivo de "edit" (campo "${EDIT_TARGET_PATH_METADATA_KEY}" ausente o inválido en request.input): denegado por defecto (fail-closed).`,
      );
    }

    const resolvedTarget = resolve(context.projectRootPath, targetPath);

    if (!isPathWithinRoot(context.projectRootPath, resolvedTarget)) {
      return deny(request, `"${targetPath}" está fuera de projectRootPath: denegado.`);
    }

    if (isSensitivePath(context.projectRootPath, resolvedTarget)) {
      return deny(request, `"${targetPath}" está en la deny-list de rutas sensibles: denegado.`);
    }

    return approve(request, `Edición de "${targetPath}": dentro del proyecto y fuera de la deny-list.`);
  }
}

function approve(request: ToolRequest, reason: string): PolicyDecision {
  return {
    toolRequestId: request.id,
    allowed: true,
    riskLevel: "low",
    reason,
    decidedAt: new Date(),
  };
}

function deny(request: ToolRequest, reason: string): PolicyDecision {
  return {
    toolRequestId: request.id,
    allowed: false,
    riskLevel: "high",
    reason,
    decidedAt: new Date(),
  };
}

/**
 * Duplicado deliberado de `packages/infrastructure/src/filesystem/isPathWithinRoot.ts`
 * (Fase 5 unificada) — misma lógica exacta (`path.relative`, no comparación de prefijo de
 * string, para evitar el falso positivo `/repo/project` vs `/repo/project-other`).
 * `agent-core/package.json` solo depende de `application`/`domain`/`shared`; agregar
 * `@guerrero-dev/infrastructure` sería una dependencia nueva entre paquetes "hermanos" de
 * la capa de implementaciones (`CLAUDE.md`) por una función pura sin I/O (solo `node:path`)
 * — mismo criterio ya aplicado dentro de `domain/` entre `code/` y `project/`
 * (`CodeInvariants.isRelativeFilePath`: "las capacidades de domain/ no se importan entre
 * sí"). `root`/`target` deben venir ya resueltos vía `path.resolve`.
 */
function isPathWithinRoot(root: string, target: string): boolean {
  const rel = relative(root, target);

  if (rel === "") return true;
  if (rel.startsWith("..")) return false;

  return !isAbsoluteLike(rel);
}

function isAbsoluteLike(value: string): boolean {
  return value.startsWith(sep) || /^[a-zA-Z]:/.test(value);
}

/**
 * Compara `resolvedTarget` (ya resuelto) contra `SENSITIVE_RELATIVE_PATHS`, relativizado a
 * `projectRootPath` y normalizado a `/` (las entradas de la lista están en formato POSIX,
 * `path.relative` en Windows devuelve `\`). Coincidencia exacta de archivo, o de prefijo de
 * directorio (`.git` cubre `.git/config`, `.git/objects/...`, etc.).
 */
function isSensitivePath(projectRootPath: string, resolvedTarget: string): boolean {
  const relativePath = relative(projectRootPath, resolvedTarget).split(sep).join("/");

  return SENSITIVE_RELATIVE_PATHS.some(
    (sensitive) => relativePath === sensitive || relativePath.startsWith(`${sensitive}/`),
  );
}
