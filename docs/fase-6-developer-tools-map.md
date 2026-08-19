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
verificó — pero SÍ se observó como `permission.asked` real con
`properties.permission === "edit"` en Fase 5.9e (el intento del modelo
de reescribir `package.json`, denegado correctamente por fail-closed).
Combinando ambas evidencias: `edit` es una categoría real, alcanzable
hoy vía `Config.permission.edit` o el catch-all `additionalProperties`
— no hace falta reverificarlo, ya hay una captura real de un evento
`edit` genuino.

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

## 7. Subfases propuestas (todavía no autorizadas para implementación)

```text
6.1  Captura real de evidencia (máquina de Santiago): forma de
     permission.asked.properties.metadata para "edit" — bloqueante para 6.3.

6.2  Decisión de diseño (sin código): confirmar el camino (a) de §5 —
     una PolicyRule de mutación que reemplaza a AllowReadRule en el
     composition root, con su propia allow-list de tools seguras
     duplicada — o revisar si ya hay evidencia para (b).

6.3  PolicyRule real para "edit", acotada con la evidencia de 6.1:
     como mínimo, validar que el path objetivo (el campo real que 6.1
     confirme) está dentro de context.projectRootPath — external_directory
     ya lo gatea a nivel de motor, pero una segunda capa a nivel de
     PolicyRule es coherente con "defensa en profundidad" (mismo
     criterio que EXECUTION_TIMEOUT_MS, Fase 5.9c). Deny-list explícita
     de rutas sensibles dentro del proyecto (.env, migraciones ya
     aplicadas, .git/) — a definir con Santiago, no inventada acá.

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

## 8. Qué NO decide este documento

- No autoriza ninguna implementación — ni siquiera 6.1 requiere código,
  pero si el resultado de 6.1 confirma la forma esperada, 6.2/6.3 sí
  necesitan su propia aprobación explícita antes de tocar código, mismo
  ritual que 4.x-6.x/Fase 5 unificada.
- No decide entre los caminos (a)/(b) de §5 — deja la recomendación
  explícita ((a) primero) pero la decisión final es de Santiago.
- No amplía `AllowReadRule` ni toca `PolicyEvaluator` — cero cambios de
  código en este incremento.
- No define la deny-list de rutas sensibles de 6.3 (`.env`, migraciones,
  `.git/`) — es una decisión de producto/seguridad real, a acordar con
  evidencia de qué archivos importan en `guerrero-dev` específicamente,
  no una lista genérica inventada acá.
