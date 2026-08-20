# Fase 6 (numeración unificada) — Developer Tools: Mapa (diseño, sin código)

**Estado:** Propuesta inicial, no congelada — primera ronda, pendiente de
revisión de Santiago.
**No es la misma "Fase 6" que `docs/fase-6-code-intelligence-map.md`.**
Ese documento es la Fase 6 *real* del repo (Code Intelligence, CLOSED,
corresponde a la Fase 4 de la numeración unificada). Este documento es
la Fase 6 de `docs/roadmap-maestro.md` (numeración unificada) —
Developer Tools, ⛔ no iniciada. Ver tabla de correspondencia en
`roadmap-maestro.md` §5 si hay dudas sobre cuál "Fase 6" aplica en cada
contexto.
**Precede a:** ningún cierre existente de esta fase (no hay código
todavía). No modifica `docs/fase-7-cline-opencode-integration-closure.md`
ni ningún cierre de Fase 5 unificada.
**Origen:** auditoría solicitada explícitamente ("auditar Fase 6
(Developer Tools)"), con aprobación para diseñar el alcance real antes
de escribir código, en vez de saltar directo a una `PolicyRule` sin
evidencia suficiente para acotarla con seguridad.
**Actualización real (Fase 6.3/6.1, `docs/roadmap-maestro.md` ítems 8b/8c):**
`AllowScopedMutationRule` ya está implementada con la evidencia real de
§8 (`EDIT_TARGET_PATH_METADATA_KEY = "filepath"`, confirmado contra el
binario). El bloqueo real de por qué `edit` nunca se disparaba resultó
NO ser el modelo — es que `edit` nunca llega al catálogo real de tools
que se le manda, y el único mecanismo que lo agrega
(`SessionPromptData.body.tools`) bypassea `Config.permission` por
completo (verificado real: un archivo se editó sin ningún
`permission.asked`). Ver 8c para el detalle completo — este documento
no se reescribe, queda como registro del diseño original.

---

## 0. Punto de partida real

Verificado contra el código de la rama `claude/fase-5-doc-verification-zbeh3d`
en `56682cc` (post-cierre de Fase 5 unificada, incluye 6n/6r):

```text
packages/agent-core/src/rules/AllowReadRule.ts   única PolicyRule real, allow-list de
                                                  herramientas SIN efectos secundarios
                                                  (read + 4 tools de Code Intelligence)
packages/agent-core/src/PolicyEvaluator.ts       agrega con AND + early-exit-on-deny;
                                                  sin reglas, deniega todo (fail-closed)
apps/cli/src/commands/agent.ts DISABLED_TOOLS    bash/edit/write/webfetch/websearch/
                                                  apply_patch apagadas para el agente build
packages/infrastructure/src/git/                 100% lectura (Memory Engine); cero
                                                  operaciones de escritura (commit/branch/push)
packages/execution/                               NoopExecutionEngine + OpenCodeExecutionEngine;
                                                  ningún tool propio de Guerrero — todo
                                                  edit/bash/webfetch lo aporta OpenCode
```

Cero código de Developer Tools existe hoy. Lo único reutilizable es el
mecanismo de `PolicyRule`/`PolicyEvaluator` (Fase 1/5.13) y el puente
`OpenCodeExecutionEngine.handlePermissionEvents()` (Fase 5.5b/5.9d/6r) que
ya intercepta *cualquier* categoría de `permission.asked` real y la pasa
por `IPolicyEngine.evaluate()` — el wiring de transporte ya está resuelto
para cualquier tool futura, confirmado por el propio roadmap (§3, Fase 6:
"ya no es un problema de wiring").

## 1. Objetivo de Fase 6

Que el agente pueda **actuar sobre el sistema** (no solo leer/entender,
que es Project Intelligence + Code Intelligence, Fases 3-4 unificadas) —
edición de archivos, ejecución de terminal, tooling de git — bajo
permisos explícitos, con `IPolicyEngine` fail-closed como garantía real,
no aspiracional.

Frontera con Code Intelligence, ya fijada en `roadmap-maestro.md` §3 y
reconfirmada acá:

```text
Code Intelligence → ¿qué existe y qué significa?
Developer Tools   → haz X sobre el sistema
```

## 2. Decisión arquitectónica central: ¿tools propias o reactivar las de OpenCode?

**No es una pregunta abierta — ya está resuelta por ADR 0002, y esta
sección solo hace explícita esa consecuencia para Fase 6.**

ADR 0002 rechazó explícitamente "construir un motor de ejecución propio
desde cero" (`docs/adr/0002-agent-engine-abstraction.md` §"Alternativas
rechazadas") y delegó tool-calling/planificación al motor externo
(OpenCode). OpenCode **ya expone** `edit`, `write`, `apply_patch`,
`bash`, `webfetch` como tools reales del agente `build` — hoy apagadas a
propósito vía `DISABLED_TOOLS`, no ausentes. Construir puertos propios
(`IGitTool`/`ITerminalTool`/`IFileEditTool` en `application` + adapters
en `infrastructure`, al estilo de Memory/Project Intelligence) duplicaría
lo que el motor ya resuelve, y violaría el mismo principio que rechazó
`ClineExecutionEngine` custom: no reinventar lo que un SDK maduro ya
cubre sin evidencia de que haga falta.

**Decisión propuesta:** Fase 6 = reactivar selectivamente las tools que
OpenCode ya trae, cada una detrás de una `PolicyRule` real que las
apruebe con criterio — no construir tooling propio. Si en el futuro
aparece evidencia real de que se necesita una operación de git
estructurada que OpenCode no cubre (p. ej. un commit con metadata
específica del repo, no delegable a un `bash: "git commit ..."`
genérico), se audita esa necesidad puntual entonces — no se adivina acá.

## 3. Categorías de permiso reales disponibles hoy

Confirmado, dos fuentes distintas de evidencia real (no solo tipos npm,
mismo rigor que 5.9d/6r):

```text
Agent.permission (SDK types, @opencode-ai/sdk@1.18.18):
  edit, bash (mapa por patrón de comando), webfetch, doom_loop, external_directory

Config.permission real (GET /doc del binario, hallazgo de 6r):
  read, glob, grep, bash, task, external_directory, lsp, skill,
  + additionalProperties (acepta cualquier nombre de tool, incluidos MCP)
```

`edit` no aparece en la lista explícita de `Config.permission` que 6r
verificó en vivo — pero SÍ se observó como `permission.asked` real con
`properties.permission === "edit"` en Fase 5.9e (el intento del modelo
de reescribir `package.json`, denegado correctamente por fail-closed).
Combinando ambas evidencias: `edit` es una categoría real, alcanzable
hoy vía `Config.permission.edit` o el catch-all `additionalProperties`
— no hace falta reverificarlo, ya hay una captura real de un evento
`edit` genuino.

**Corroboración estática adicional, encontrada en esta auditoría** (sin
infraestructura real disponible en este entorno — sin Ollama, sin
binario `opencode`, sin caché de `opencode-ai` en el store de pnpm; esto
es lectura de tipos, no verificación en vivo, mismo nivel de evidencia
que ya se sabe insuficiente por sí solo, ver 5.9d/6r): el módulo `v2` de
`@opencode-ai/sdk` (`dist/v2/gen/types.gen.d.ts`, no usado en
producción — ADR 0003 lo descarta por inestable) declara un
`PermissionConfig` explícito con `edit`, `read`, `glob`, `grep`, `list`,
`bash`, `task`, `external_directory`, `todowrite`, `question`,
`webfetch`, `websearch`, `lsp`, `doom_loop`, `skill` — un set más amplio
que el que 6r llegó a verificar en vivo (solo necesitaba `read` +
Code Intelligence). Y su `PermissionRequest` (línea 2029-2042) declara
`{id, sessionID, permission, patterns, metadata, always, tool}` —
**coincide campo por campo** con la forma real que 5.9d/6r capturaron en
vivo contra el binario para el módulo raíz (`permission.asked`), pese a
ser un módulo distinto. Esto no prueba nada sobre el contenido de
`metadata` para `edit` (sigue siendo `{[key: string]: unknown}` incluso
acá, sin tipar), pero sube la confianza en que la forma de nivel
superior (§4) es estable entre módulos — reduce el riesgo de sorpresas
en 6.1 al capturar el evento real, no lo elimina.

Dato circunstancial, no evidencia directa: el mismo archivo `v2` declara
un evento no relacionado, `"file.edited"`, con `properties: { file:
string }` — sugiere que en algún punto del código real de OpenCode se
modela un archivo editado como un string plano bajo la clave `file`.
Es una hipótesis razonable para el nombre de campo que podría aparecer en
`metadata` de un `permission.asked` de tipo `edit` (p. ej. `file` o
`filePath`) — **no confirmada, no usable para escribir código todavía**;
6.1 sigue siendo obligatorio antes de asumir cualquier nombre de campo
real.

**No existe una categoría de permiso "git" separada.** Cualquier
operación de git pasaría por `bash` (`git commit`, `git checkout`, `git
push`, ...) — la "visión original" de 3 categorías (git tools / edición
/ terminal) es, en esta arquitectura concreta, 2 categorías técnicas
reales (`edit`, `bash`), con git como un subconjunto de comandos dentro
de `bash`. Esto matiza (no contradice) el objetivo de Fase 6 en §1.

## 4. Evidencia que falta — bloqueante para escribir cualquier `PolicyRule` de mutación

Verificado que **no está disponible en este entorno** (job en background,
sin Ollama ni binario `opencode` instalados, sin GPU): la forma real de
`permission.asked.properties.metadata` para `edit` y de `.patterns` para
`bash`. Fase 5.9e solo capturó que el evento `edit` existe, no qué trae
adentro (esa sesión lo denegó sin loguear el payload completo). 6r sí
capturó eventos reales, pero solo para `read` y las tools de Code
Intelligence — ninguno mutante.

Sin esto, una `PolicyRule` para `edit` no puede validar QUÉ se edita
(¿`metadata.filePath`? ¿algo distinto?) — exactamente el mismo problema
que ya reconoce `AllowReadRule` para lectura ("no valida QUÉ se lee"),
pero mucho más grave acá: `read` sin validar es inofensivo (no muta
nada); `edit` sin validar puede corromper cualquier archivo dentro del
proyecto al que OpenCode ya tenga acceso — el caso real casi-incidente
de 5.9e (intento de corromper `package.json`) es evidencia directa de
que el modelo SÍ intenta ediciones erróneas, no solo hipotéticas.

**Cómo capturarla** (mismo método ya usado en 5.9d/6r, requiere máquina
con Ollama + `opencode serve` real — la de Santiago):

```text
1. Levantar `opencode serve` a mano con permission: { edit: "ask", bash: "ask" }
   explícito (mismo patrón que 6r usó para "read").
2. Disparar una instrucción real que dispare una edición real
   (p. ej. "agregá un comentario a package.json").
3. Loguear el evento `permission.asked` crudo completo (no solo el tipo)
   antes de responder — capturar properties.metadata y properties.patterns.
4. Repetir para bash con un comando real (p. ej. "corré git status").
5. Documentar la forma real encontrada en roadmap-maestro.md, mismo
   formato que 5.9d/6r (evidencia citada, no asumida).
```

## 5. Problema de composición de `PolicyEvaluator` — por qué no alcanza con "una regla más"

`PolicyEvaluator.evaluate()` agrega con AND + early-exit-on-deny (ver
`PolicyEvaluator.ts:17-33`). `AllowReadRule` ya es, por diseño explícito
documentado en su propio JSDoc, la única allow-list que puede existir
bajo este modelo — dos allow-lists parciales registradas juntas se
anulan mutuamente (`request` que no está en la lista de la regla A es
denegado por A, aunque la regla B sí lo aprobara).

Sumar `edit`/`bash` a dentro de `AllowReadRule` (ampliar su
`additionalAllowedTools`) **no es válido**: rompe el invariante que el
propio nombre y JSDoc de esa clase garantizan ("herramientas SIN efectos
secundarios sobre el workspace"). Un caller que confíe en ese invariante
(nadie hoy, pero es el contrato documentado) se rompería en silencio.

Dos caminos reales, ninguno trivial, y esta es la decisión de diseño que
falta tomar **antes** de escribir código de Fase 6:

- **(a) Mantener el modelo AND actual.** Una única `PolicyRule` nueva
  (p. ej. `AllowScopedMutationRule`) que conozca TANTO las tools seguras
  de solo lectura (duplicando la lista de `AllowReadRule`) COMO las de
  mutación con su propia validación — y se usa en vez de `AllowReadRule`,
  no además. Mantiene el modelo simple, pero cada nueva categoría de tool seguirá
  forzando a tocar la misma clase (ya pasó una vez, 6n, con Code
  Intelligence).
- **(b) Rediseñar la agregación de `IPolicyEngine`** a un modelo tipo IAM
  (deny explícito gana; sin deny, cualquier allow explícito gana; sin
  ninguna opinión, fail-closed) — señalado como "fuera de alcance sin un
  segundo caso real que lo justifique" en 5.13/6n/6r. Con `edit`/`bash`
  como categorías de mutación genuinamente distintas de lectura, este
  podría ser ese segundo caso — pero es un cambio de contrato de
  `PolicyRule`/`IPolicyEngine` (puerto de `application`, agregación
  fail-closed), no una ampliación incremental; necesita su propia
  auditoría, tests de regresión sobre `AllowReadRule`/`PolicyEvaluator`
  existentes, y una decisión explícita — no se resuelve como efecto
  colateral de aprobar `edit`.

**Recomendación de este mapa:** empezar con (a) para el primer
incremento real (una sola `PolicyRule` de mutación, acotada, que
reemplace a `AllowReadRule` en el composition root). Revisar (b) recién
si aparece un tercer caso real que también lo necesite — mismo criterio
de "no construir sin evidencia" que gobernó toda la Fase 4.x-6.x.

## 6. Superficie de riesgo por tool — no son equivalentes

```text
edit / write / apply_patch   Mutación acotada a archivos individuales dentro
                              del proyecto (external_directory ya gatea salir
                              del projectRootPath, capa separada). Riesgo real
                              ya observado: corrupción de contenido (5.9e).

bash                          Ejecución arbitraria de comandos — orden de
                              magnitud más riesgoso. `patterns` (visto en el
                              evento real de 6r) sugiere que OpenCode ya
                              declara qué comando se va a correr antes de
                              pedir permiso, lo cual habilita en principio una
                              allow-list de patrones (p. ej. `git status`,
                              `git diff`, `git log` seguros; `rm`, `git push
                              --force`, cualquier redirección de shell,
                              explícitamente fuera). Sin evidencia real de la
                              forma de `patterns` todavía (§4) — no se puede
                              diseñar esa allow-list con esta info.

git (via bash)                Subconjunto de bash. Los comandos de solo
                              lectura (status/diff/log/show) son de riesgo
                              similar a `edit` acotado; los de escritura
                              (commit/push/reset --hard/checkout -- .) son de
                              riesgo alto — corresponden más a "autonomous
                              workflows" (Fase 7 unificada) que a un primer
                              incremento de Developer Tools.
```

`bash` queda **fuera del primer incremento propuesto** — la superficie
de riesgo (ejecución arbitraria) no es comparable a `edit`, y no hay
todavía ni la evidencia de `patterns` ni una allow-list de comandos
diseñada. Se retoma cuando haya evidencia real de necesidad, mismo
criterio que Fase 8/9 en `roadmap-maestro.md`.

**Alternativa considerada y descartada**: `Agent.permission.bash` (tipo
real, ver `types.gen.d.ts:1409-1411`) ya acepta un mapa
`{ [patrónDeComando: string]: "ask" | "allow" | "deny" }` — en teoría
alcanzaría con declarar ahí qué patrones de `git`/etc. se auto-aprueban,
sin escribir ninguna `PolicyRule` nueva. Se descarta: cualquier patrón
marcado `"allow"` ahí se resuelve *dentro de OpenCode*, sin emitir
`permission.asked` — exactamente la misma categoría de brecha que 5.9b
ya encontró y cerró para `webfetch` (aprobación real sin que
`IPolicyEngine` la viera). Mantener todo `bash` en `"ask"` (ya así,
Fase 5.9b) y decidir el patrón dentro de la `PolicyRule` — no en la
config de OpenCode — es la única forma de que `IPolicyEngine` siga
siendo la única fuente de verdad de qué se aprobó y por qué.

## 7. Subfases propuestas (todavía no autorizadas para implementación)

```text
6.1  Captura real de evidencia (máquina de Santiago): forma de
     permission.asked.properties.metadata para "edit" — bloqueante para 6.3.

6.2  Decisión de diseño (sin código): confirmar el camino (a) de §5 —
     una PolicyRule de mutación que reemplaza a AllowReadRule en el
     composition root, con su propia allow-list de tools seguras
     duplicada — o revisar si ya hay evidencia para (b).

6.3  PolicyRule real para "edit", acotada con la evidencia de 6.1 —
     forma propuesta completa en §8 (clase, deny-list, cambio de
     composition root); solo falta reemplazar
     EDIT_TARGET_PATH_METADATA_KEY por el nombre real que confirme 6.1
     y aprobar la deny-list de §8.1 con Santiago.

6.4  Reactivar "edit" en DISABLED_TOOLS + permission: { edit: "ask" }
     explícito (ya está, ver Fase 5.9b) — verificación end-to-end real
     en la máquina de Santiago, mismo protocolo que 6r: casos positivos
     (edición legítima dentro del proyecto) y negativos (intento de
     tocar un archivo sensible, deploy denegado y verificado a mano que
     el archivo real no cambió).

6.5+ DIFERIDO, sin evidencia todavía — bash (necesita 6.1 extendido a
     `patterns`, más el diseño de una allow-list de comandos, mucho más
     riesgoso), git tooling específico si bash resulta insuficiente,
     write/apply_patch si difieren de "edit" en la forma real del
     evento (a confirmar en 6.1 — hoy se asume que comparten categoría
     de permiso "edit", sin verificar).
```

## 8. Propuesta formal — forma concreta del código, pendiente solo de 6.1

Resuelve, con evidencia ya disponible sin infraestructura real, todo lo
que **no** depende de la forma exacta de `metadata` — para que 6.3 sea
literalmente "confirmar una constante + correr los tests", no un diseño
desde cero una vez que llegue la evidencia de 6.1.

### 8.1 Deny-list real propuesta para `guerrero-dev`

Enumerada contra el repo real (no genérica), candidata a `SENSITIVE_PATH_DENYLIST`
en 6.3 — aprobación final de Santiago, esto es propuesta, no decisión:

```text
.env, .env.local              secretos reales (no versionados — .gitignore
                               los excluye, pero siguen siendo archivos reales
                               en disco que edit podría leer/sobrescribir)
.git/                         integridad del repositorio; ninguna tool de
                               "edición de archivos" tiene motivo legítimo de
                               tocar objetos internos de git
pnpm-lock.yaml                una edición manual desincroniza el lockfile de
                               package.json real sin pasar por pnpm
packages/infrastructure/src/database/migrations/*.sql (ya aplicadas:
  0001_init.sql, 0002_memory_tables.sql, 0003_memory_embeddings_vector.sql,
  0004_project_profiles.sql)
                               regla explícita ya vigente en CLAUDE.md:
                               "nunca edites una migración ya aplicada —
                               agregá una nueva"; una PolicyRule real es la
                               forma de hacer cumplir esa regla ya escrita,
                               no una nueva invención
```

Deliberadamente **no** incluye una entrada genérica para "toda la carpeta
`migrations/`" — una migración nueva (todavía no aplicada) sí debe poder
crearse/editarse; la deny-list es por archivo ya existente en la lista de
arriba, no por directorio completo. Confirmar en 6.3 si hace falta un
mecanismo más fino (p. ej. mirar el estado real de `pnpm migrate`) o si
alcanza con la lista estática — sin evidencia de que la lista estática no
alcance, no se complica más.

### 8.2 `isPathWithinRoot` ya existe — pero `agent-core` no puede importarla tal cual

`packages/infrastructure/src/filesystem/isPathWithinRoot.ts` (Fase 5
unificada) ya resuelve exactamente la validación de contención de paths
que 6.3 necesita (usa `path.relative`, no comparación de prefijo de
string — evita el falso positivo `/repo/project` vs
`/repo/project-other`). Pero `agent-core/package.json` solo declara
`application`/`domain`/`shared` como dependencias — agregar
`@guerrero-dev/infrastructure` sería un cambio de arquitectura real (hoy
`agent-core` no depende de ningún adapter concreto), no una importación
trivial. `isPathWithinRoot` en sí es una función pura sin I/O (solo usa
`node:path`, nada de Drizzle/git/fs) — **propuesta: duplicarla
literalmente dentro de `agent-core/src/rules/` (mismo criterio ya usado
en el propio código: preferir una función pura chica duplicada antes que
una dependencia nueva entre paquetes "hermanos" de la capa de
implementaciones)**, no importarla ni mover el archivo de paquete.

### 8.3 Forma propuesta de la `PolicyRule` (pseudocódigo, NO implementar todavía)

```typescript
// packages/agent-core/src/rules/AllowScopedMutationRule.ts (nombre propuesto)
// Reemplaza a AllowReadRule en el composition root (decisión (a) de §5) —
// no convive con ella (se anularían bajo AND).

const READ_ONLY_TOOL_NAME = "read";

// PENDIENTE DE 6.1 — no adivinar este valor sin evidencia real.
// Hipótesis sin confirmar (§4): "file" o "filePath".
const EDIT_TARGET_PATH_METADATA_KEY = "TODO_confirmar_en_6.1";

const SENSITIVE_PATH_DENYLIST = [/* ver §8.1, resuelta contra projectRootPath */];

export class AllowScopedMutationRule implements PolicyRule {
  readonly name = "allow-scoped-mutation";
  private readonly allowedReadOnlyTools: ReadonlySet<string>;

  constructor(additionalReadOnlyTools: readonly string[] = []) {
    this.allowedReadOnlyTools = new Set([READ_ONLY_TOOL_NAME, ...additionalReadOnlyTools]);
  }

  evaluate(request: ToolRequest, context: PolicyContext): PolicyDecision {
    if (this.allowedReadOnlyTools.has(request.toolName)) {
      return approve(request, "lectura sin efectos secundarios");
    }
    if (request.toolName === "edit") {
      return this.evaluateEdit(request, context);
    }
    return deny(request, `"${request.toolName}" fuera de alcance de allow-scoped-mutation`);
  }

  private evaluateEdit(request: ToolRequest, context: PolicyContext): PolicyDecision {
    const targetPath = request.input[EDIT_TARGET_PATH_METADATA_KEY];
    if (typeof targetPath !== "string") {
      return deny(request, "no se pudo determinar el archivo objetivo (fail-closed)");
    }
    const resolved = resolve(context.projectRootPath, targetPath);
    if (!isPathWithinRoot(context.projectRootPath, resolved)) {
      return deny(request, "fuera de projectRootPath");
    }
    if (isSensitivePath(resolved)) {
      return deny(request, "ruta en la deny-list (ver §8.1)");
    }
    return approve(request, "edición dentro del proyecto, fuera de la deny-list");
  }
}
```

Reemplaza a `AllowReadRule` (no la extiende) porque el invariante de
nombre de esa clase ("herramientas SIN efectos secundarios") dejaría de
cumplirse si ganara una rama de mutación — mismo razonamiento de §5.
`AllowReadRule.ts`/`.test.ts` no se borran solos: la migración de uno a
otro es parte de 6.3, con sus propios tests de regresión (que `read` y
las tools de Code Intelligence sigan aprobándose igual que hoy).

### 8.4 Cambio propuesto en el composition root (`apps/cli/src/commands/agent.ts`)

```typescript
// Antes (hoy, post 6n):
const policyEngine = new PolicyEvaluator();
policyEngine.addRule(new AllowReadRule(CODE_INTELLIGENCE_PREFIXED_TOOL_NAMES));

// Propuesto (6.3, solo tras 6.1):
const policyEngine = new PolicyEvaluator();
policyEngine.addRule(new AllowScopedMutationRule(CODE_INTELLIGENCE_PREFIXED_TOOL_NAMES));
```

Más `edit: true` en `DISABLED_TOOLS` (6.4) y sin cambios en `PERMISSION`
(`edit: "ask"` ya está desde 5.9b, confirmado real en este archivo).

## 9. Qué NO decide este documento

**Actualizado tras 6.3** (`docs/roadmap-maestro.md` ítem 8b): el
pseudocódigo de §8.3/§8.4 dejó de ser solo propuesta — `AllowScopedMutationRule`
se implementó tal cual, reemplazando a `AllowReadRule` en el composition
root, con `EDIT_TARGET_PATH_METADATA_KEY` como centinela sin confirmar
(fail-closed garantizado mientras no se toque) y la deny-list de §8.1
aplicada literalmente. 502 tests en verde, build/typecheck/lint limpios.
Sigue sin ser alcanzable en runtime (`DISABLED_TOOLS.edit` en `false`).

Lo que sigue sin decidir este documento ni el código de 6.3:

- No autoriza reactivar `edit` de verdad — eso es 6.4, todavía no hecho.
- No decide entre los caminos (a)/(b) de §5 — 6.3 implementó (a), la
  recomendación de este mapa; (b) sigue sin evaluarse.
- La deny-list de §8.1, aunque ya está en el código, sigue sin la
  aprobación explícita de Santiago — implementarla no equivale a que
  esté validada como correcta/completa.
- No resuelve `EDIT_TARGET_PATH_METADATA_KEY` — sigue esperando la
  evidencia real de 6.1; el centinela en el código no es un valor
  funcional, es un valor que garantiza denegar todo hasta que alguien lo
  reemplace deliberadamente.
