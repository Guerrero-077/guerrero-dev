import { relative, resolve, sep } from "node:path";
import type { PolicyDecision, ToolRequest } from "@guerrero-dev/domain";
import type { PolicyContext, PolicyRule } from "@guerrero-dev/application";

const READ_ONLY_TOOL_NAME = "read";

/**
 * Clave real del campo de `ToolRequest.input` (== `permission.asked.properties.metadata`
 * de OpenCode, ver `OpenCodeExecutionEngine.handlePermissionEvents()`) que trae la ruta del
 * archivo objetivo de una edición — **confirmada (Fase 6.1), no adivinada**: el string
 * literal `metadata:{filepath:...}` (minúscula, sin camelCase) aparece en el propio código
 * de `node_modules/opencode-ai/bin/opencode.exe` (v1.18.18, el mismo binario que
 * `createOpencodeServer()` levanta) en los tres sitios que emiten un permiso de categoría
 * `"edit"` (tools `edit`, `write`, `apply_patch`) — corroborado además por una tool call
 * real persistida en `~/.local/share/opencode/opencode.db` con
 * `input: {oldString, filePath: "/ruta/real/package.json", newString}`. El valor real que
 * llega a `metadata.filepath` es siempre absoluto (`opencode` lo resuelve contra su propio
 * `directory` antes de pedir el permiso), consistente con `resolve()` más abajo.
 *
 * `filePath` (camelCase) es el nombre del PARÁMETRO que el modelo completa al invocar la
 * tool — no el nombre de la clave de `metadata`. Por eso el test que deniega `filePath` en
 * `request.input` (casing distinto) documenta una diferencia real, no un capricho de
 * mayúsculas.
 */
export const EDIT_TARGET_PATH_METADATA_KEY = "filepath";

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
 * §8), sucesora de `AllowReadRule` (5.13/6n, eliminada de este repo en 6.3 — ver
 * `docs/roadmap-maestro.md` para el historial) — la reemplaza, no convive con ella:
 * `PolicyEvaluator.evaluate()` agrega con AND + early-exit-on-deny (ver
 * `PolicyEvaluator.ts:17-33`), así que dos allow-lists parciales registradas juntas se
 * anulan mutuamente. Por eso esta clase absorbe TODO lo que `AllowReadRule` ya aprobaba
 * (`"read"` + tools de Code Intelligence inyectadas por constructor, idéntico contrato) y
 * agrega una segunda categoría real: `"edit"`, con su propia validación — no una allow-list
 * ciega como la de lectura.
 *
 * **Por qué `"edit"` no puede ser una allow-list ciega como `"read"`**: `"read"` no muta el
 * workspace: aprobarla sin mirar `request.input` es seguro. `"edit"` sí muta — el caso real
 * casi-incidente de Fase 5.9e (el modelo intentó reescribir `package.json` con contenido
 * corrupto, denegado solo porque `PolicyEvaluator` era fail-closed sin ninguna regla) es
 * evidencia directa de que aprobar `edit` sin condiciones es un riesgo real, no hipotético.
 * `evaluateEdit()` exige: (a) que `request.input` traiga un path bajo
 * `EDIT_TARGET_PATH_METADATA_KEY` (si no, deniega — fail-closed); (b) que NO sea una lista de
 * varios archivos (ver guarda de `apply_patch` más abajo); (c) que el path resuelto quede
 * dentro de `context.projectRootPath` — segunda capa de defensa en profundidad además de
 * `external_directory` (que ya gatea esto a nivel de motor, capa separada, mismo criterio
 * que `EXECUTION_TIMEOUT_MS`, Fase 5.9c); (d) que no esté en `SENSITIVE_RELATIVE_PATHS`.
 *
 * **Riesgo real encontrado en Fase 6.1, cerrado acá**: el binario real (ver JSDoc de
 * `EDIT_TARGET_PATH_METADATA_KEY`) muestra que `edit`, `write` y `apply_patch` piden permiso
 * bajo la MISMA categoría `"edit"` — `apply_patch` (multi-archivo) manda
 * `metadata.filepath` como una lista unida por coma (`"a.ts, b.ts"`) más un campo
 * `metadata.files`. Sin guarda, un `filepath` así resolvería como un solo path "raro" pero
 * técnicamente dentro del root, y esta regla aprobaría un patch multi-archivo sin haberlo
 * decidido — `evaluateEdit()` deniega explícitamente cualquier `request.input.files` (array)
 * o `filepath` con `", "`, aunque `write`/`apply_patch` estén denegadas hoy en
 * `apps/cli/src/commands/agent.ts` (`BUILD_AGENT_PERMISSION`): esta regla no debe depender de
 * esa otra capa para estar segura.
 *
 * **Estado real de alcanzabilidad en runtime**: esta clase decide sobre `"edit"` en cuanto
 * se registra en el composition root (`PERMISSION.edit: "ask"` fuerza el evento real desde
 * Fase 5.9b) — el estado actual de si la tool `edit` está habilitada para el modelo vive en
 * `BUILD_AGENT_PERMISSION` (`apps/cli/src/commands/agent.ts`), no acá; no se repite ese valor
 * en este archivo para no desincronizarse de nuevo (ya pasó una vez con `BUILD_AGENT_TOOLS`,
 * ver Fase 6.1 en `docs/roadmap-maestro.md`).
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

    // `apply_patch` (multi-archivo) pide permiso bajo la misma categoría "edit" y manda
    // metadata.filepath como una lista unida por coma más un metadata.files real — ver JSDoc
    // de la clase. Sin esta guarda, un patch multi-archivo pasaría como si fuera un único
    // path "raro" pero contenido en el proyecto.
    if (Array.isArray(request.input["files"]) || targetPath.includes(", ")) {
      return deny(
        request,
        `"${targetPath}" aparenta ser una lista de archivos (apply_patch), no un único path: denegado — esta regla solo evalúa ediciones de un archivo por vez.`,
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
