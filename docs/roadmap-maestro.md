# Roadmap maestro — Guerrero Dev Agent (Fase 0 → Fase 9)

## Estado: fuente de verdad vigente

Documento de gobernanza/planeación, mismo registro que
`docs/fase-a-auditoria.md` y `docs/fase-6-to-7-reconciliation.md` — no
autoriza implementación de nada por sí mismo. Reemplaza la necesidad de
consultar dos roadmaps por separado: la visión estratégica original
(Research & Architecture → Continuous Learning) y el roadmap versionado
real (`docs/fase-3-foundation.md`, Fase 3→7). Ninguno de los dos se
descarta — se reconcilian aquí en una única numeración.

## 1. Por qué existen dos narrativas

El proyecto tuvo una visión original de 9 bloques (Research &
Architecture, Agent Core, Memory, Project Intelligence, Code
Intelligence, Personal Engineering Profile, Developer Tools, Autonomous
Workflows, Continuous Learning). Esa visión nunca quedó registrada
formalmente en el repositorio — verificado con `git log --all
--full-history`: no existe ni existió nunca un documento de "Fase 0",
"Fase 1" o "Fase 2". El primer commit del repositorio (`d3b5804`) ya se
llama "Fase 3 — Foundation", y desde ahí la ejecución real siguió su
propia numeración documentada en `docs/fase-3-foundation.md` ("Siguiente
paso"): Fase 4 → Memory System, Fase 5 → Project Intelligence, Fase 6 →
Code Intelligence, Fase 7 → Cline/OpenCode Integration.

Ambas narrativas son reales: la visión original es la intención
estratégica; el roadmap versionado es lo que realmente se auditó,
implementó y cerró con evidencia (Fase 4/5/6, cada una con su
`*-closure.md`). Este documento no elige una sobre la otra — les da una
numeración única y común a partir de ahora.

## 2. Numeración unificada (0 → 9)

```text
Fase 0 — Research & Architecture            ✅ COMPLETADA (retroactivo)
Fase 1 — Foundation + Agent Core skeleton   ✅ COMPLETADA
Fase 2 — Memory System                      ✅ COMPLETADA
Fase 3 — Project Intelligence               ✅ COMPLETADA
Fase 4 — Code Intelligence                  ✅ COMPLETADA
Fase 5 — Agent Core real (LLM conectado)    ✅ COMPLETADA (sustancial —
                                               6p diferido, ver §3)
Fase 6 — Developer Tools                    ⛔ NO INICIADA
Fase 7 — Autonomous Workflows               ⛔ NO INICIADA
Fase 8 — Personal Engineering Profile       🔵 EVOLUTIVO
Fase 9 — Continuous Learning                🔵 EVOLUTIVO
```

Nota sobre el reordenamiento: la visión original ponía "Personal
Engineering Profile" en la posición 5 y "Developer Tools"/"Autonomous
Workflows" después. Aquí se reordenan al final (8 y 9) porque aprender
el estilo del desarrollador requiere primero tener interacciones reales
del agente que observar — y esas interacciones no existen hasta que
Fase 5-7 funcionen. Mismo criterio de "no construir sin evidencia" que
gobernó todo el trabajo de 4.x-6.x.

## 3. Detalle por fase

### Fase 0 — Research & Architecture

**Estado: ✅ Completada (retroactivo).** No tiene closure doc propio
porque ocurrió como decisiones previas al primer commit versionado, no
como subfase con su propio ciclo de cierre — se documenta aquí por
primera vez con ese estatus explícito.

Evidencia: `docs/adr/0001-core-technology-selection.md` (elección de
stack), `docs/adr/0002-agent-engine-abstraction.md` (decisión de
abstraer motores de ejecución detrás de `IExecutionEngine`, dejando
Cline/OpenCode como adapters intercambiables — decisión que sigue
vigente y sin violaciones en todo el trabajo posterior), la
arquitectura hexagonal domain/application/infrastructure ya establecida
desde el primer commit.

### Fase 1 — Foundation + Agent Core skeleton

**Estado: ✅ Completada.** Corresponde a "Fase 3: Foundation" del repo
real (`docs/fase-3-foundation.md`, commits `d3b5804`, `523be5e`,
`4a631af`). Monorepo pnpm, `domain`/`application`/`infrastructure` por
capacidad, PostgreSQL + pgvector, API Fastify, CLI, `agent-core`
skeleton (contratos y clases, sin LLM conectado — deliberado, ver
Fase 5).

### Fase 2 — Memory System

**Estado: ✅ Completada.** Corresponde a "Fase 4" del repo real
(`docs/fase-4-memory-engine-closure.md`). Desglose real verificado:

| Sub-capacidad | Estado |
|---|---|
| Persistencia | ✅ real (Drizzle + migraciones + UoW transaccional) |
| Formación | ✅ real, pero solo desde Git (extracción vía LLM diferida) |
| Retrieval | 🟡 real internamente (`DrizzleMemoryCandidateRetriever`, pgvector), pero sin consumidor externo |
| Validación | 🟡 real salvo `ConflictDetector` (`NoopMemoryConflictDetector`, diferido con condición de reapertura explícita, no cumplida) |

`ContextBuilder` no consume Memory todavía — ver Fase 5.4.

### Fase 3 — Project Intelligence

**Estado: ✅ Completada.** Corresponde a "Fase 5" del repo real
(`docs/fase-5-project-intelligence-closure.md`). Única capacidad de
Intelligence realmente conectada a `agent-core` hoy, vía
`IProjectIntelligenceProvider` → `ContextBuilder`.

### Fase 4 — Code Intelligence

**Estado: ✅ Completada.** Corresponde a "Fase 6" del repo real
(`docs/fase-6-code-intelligence-closure.md`, subfases 6.1-6.5).
Estructuralmente sólida, verificada contra el repo real en 6.5
(`TsMorphCodeAnalyzer`, `LiteralCodeSearch`, 422 tests + 9 tests de
aceptación contra `guerrero-dev` real). Sin consumidor todavía — isla
separada de Project Intelligence, ver Fase 5.4.

### Fase 5 — Agent Core real (LLM conectado)

**Estado: ✅ Completada (sustancialmente) — ver
`docs/fase-7-cline-opencode-integration-closure.md`.** 6p queda
diferido con evidencia (§7, entrada 6r), no bloqueante. Corresponde a
"Fase 7: Cline/OpenCode Integration" del repo real. El
hallazgo que abrió esta fase (`AgentOrchestrator.run()` construía
`BuiltContext` y lo descartaba, nunca invocaba `ILLMProvider.generate()`,
`PolicyEngine` inyectado pero no llamado dentro de `run()`) ya no
describe el estado real del código — cerrado en Fase 5.14 (ver §7,
entrada 6o). No existe todavía ninguna ruta `/agent` ni `/chat` en
`apps/api` (`guerrero agent run` es CLI-only), eso sigue sin tocarse.

Las subfases propuestas originalmente no se auditaron una por una en
orden estricto — el trabajo real avanzó incremento por incremento,
documentado en el log de §7 (6b-6q), con su propia numeración orgánica
(5.5b-5.14 + 5.4c) que terminó cubriendo el alcance de 5.1-5.5. Estado real,
verificado contra código (`ContextBuilder.ts`, `AgentOrchestrator.ts`),
no solo contra lo que este documento planeaba:

```text
5.1  LLM local conectado (Ollama + modelo ~7B)      ✅ cerrado
     (OllamaProvider "endurecido en Fase 5.1", ver §7 entrada 6c)
5.2  BuiltContext consumido de verdad por run()     ✅ cerrado (5.14, 6o)
5.3  PolicyEngine cableado dentro de run()          🟡 parcial —
     el loop interno de PolicyEngine en AgentOrchestrator.run() sigue
     muerto con el motor OpenCode (ToolSelector.selectToolSteps()
     siempre devuelve []); la política real pasa por el bridge de
     eventos de permisos de OpenCode (5.5b/6b, 5.9b/6g, 5.9d/6i), un
     mecanismo distinto al planeado acá — pero desde 6n/6r ese bridge sí
     decide algo real: `read` y Code Intelligence pasan por
     `AllowReadRule`, no solo por el fail-closed vacío
5.4a Memory expuesta a ContextBuilder               ✅ cerrado
     (`IMemoryRetriever`, ver `ContextBuilder.ts`)
5.4b Code Intelligence expuesta al agente           ✅ cerrado (5.4b,
     `CodeIntelligenceToolHandler`, application) + ✅ cerrado (5.4c,
     `@guerrero-dev/mcp`, cablea el handler a un servidor MCP real que
     el agente invoca de verdad — ver §7 entrada 6q). Corrección sobre
     lo dicho en la revisión anterior de este documento: 5.4b sí tenía
     avance real (commit `5ad3370`), solo le faltaba consumidor —
     confundir "sin consumidor" con "sin avance" fue un error de esa
     revisión, no un hallazgo nuevo
5.5  Integración Cline/OpenCode real                ✅ sustancialmente
     cerrada vía 5.5b-5.14 + 5.4c + 6n (6b-6r). 6p (alucinación de
     rutas de qwen2.5:7b-instruct-q4_K_M) queda diferido con decisión
     explícita, no sin decidir — ver 6r: no reproducido de nuevo en la
     verificación end-to-end real, sin modelo más grande disponible
     para probar la hipótesis principal, se retoma con evidencia nueva
```

No queda ninguna decisión pendiente para considerar cerrada toda la
Fase 5 unificada (5.1-5.5, 6n incluidos) — 6p es la única pieza sin
causa raíz confirmada, y quedó explícitamente diferida (6r), no
bloquea `guerrero agent run`.

### Fase 6 — Developer Tools

**Estado: ⛔ No iniciada (diseño abierto).** Git tools, edición de
archivos, ejecución de terminal — bajo permisos explícitos.
`PolicyEngine`/`PolicyRule` ya existen desde Fase 1 (fail-closed real,
`PolicyEvaluator.ts`, `AllowReadRule` desde 5.13) y desde 6n/6r sí
deciden algo real en el flujo de `guerrero agent run` — el gap de
vocabulario `toolName` entre `PolicyRule` y las categorías de permiso de
OpenCode está reconciliado (verificado real, ver 6r). Lo que falta para
que Fase 6 tenga sentido ya no es un problema de wiring: es que no
existe todavía ninguna `PolicyRule` que apruebe `edit`/`bash`
(correctamente — sin capacidades reales de Developer Tools, no hay nada
legítimo que aprobar ahí). Distinto de Code Intelligence (Fase 4): esa
responde "¿qué existe y qué significa?", esto responde "haz X sobre el
sistema" — no deben mezclarse.

Primera ronda de diseño publicada en `docs/fase-6-developer-tools-map.md`
(sin código): confirma que `edit`/`bash` no son problema de wiring, deja
explícito que "git tools" no es una categoría de permiso propia (es un
subconjunto de `bash`), y bloquea cualquier `PolicyRule` de mutación real
hasta capturar la forma exacta de `permission.asked.properties.metadata`
para `edit` en una máquina con Ollama + `opencode serve` reales (backlog
§7 ítem 8). `bash` queda fuera del primer incremento propuesto por
riesgo de ejecución arbitraria muy superior a `edit`.

### Fase 7 — Autonomous Workflows

**Estado: ⛔ No iniciada.** `observe → plan → propose → permission →
execute → validate → report`. Depende de Fase 5 (loop real con LLM) y
Fase 6 (herramientas reales) funcionando juntas — no tiene sentido
diseñarla en detalle todavía.

### Fase 8 — Personal Engineering Profile

**Estado: 🔵 Evolutivo, sin evidencia.** Aprender el estilo del
desarrollador (convenciones, preferencias arquitectónicas, patrones de
diseño) requiere observar interacciones reales del agente — que no
existen hasta Fase 5-7. Se abre cuando haya evidencia concreta de que
hace falta, no antes — mismo criterio aplicado a `ConflictDetector`,
`RiskSignal`, y cada decisión diferida de Fase 2/4.

### Fase 9 — Continuous Learning

**Estado: 🔵 Evolutivo, sin evidencia.** Cierra el ciclo
`observe → remember → understand → act → evaluate → learn → improve`.
Depende de que exista un ciclo real que aprender — Fase 5-8 primero.

## 4. Restricción de hardware → decisión concreta para Fase 5.1

Hardware real: Lenovo LOQ, RTX 3050 (~5GB VRAM), 24GB RAM, i5 12ª
generación (serie H).

- Modelos ~7B en cuantización Q4_K_M (~4-4.5GB) caben cómodamente en
  ~5GB de VRAM vía Ollama. Ya existe cliente HTTP real
  (`packages/infrastructure/src/llm/OllamaProvider.ts`, implementa
  `ILLMProvider` contra `/api/tags` y `/api/generate`) — falta
  conectarlo, no construirlo. Candidatos razonables para un agente de
  código: Qwen2.5-Coder 7B, Llama 3.1 8B.
- Modelos 14B+ requieren offload a CPU/RAM: posible con 24GB RAM pero
  bastante más lento — no como default del loop conversacional; queda
  como opción para tareas batch/no interactivas si en el futuro hace
  falta más calidad de razonamiento.
- `ILLMProvider` ya está diseñado para un segundo provider cloud
  después (Anthropic/OpenAI vía LLM Gateway — anticipado en su propio
  comentario de diseño). No hay que rediseñar el contrato cuando llegue
  ese momento, solo decidirlo con evidencia real de uso, no antes.
- Decisión concreta para 5.1: Ollama + modelo 7B-class local como MVP.
  El modelo exacto se confirma con benchmark real en la auditoría
  formal de 5.1 (mismo criterio que `scripts/benchmark-embeddings.ts`
  ya aplicó para embeddings: medir antes de decidir), no se congela en
  este documento.

## 5. Tabla de correspondencia (trazabilidad hacia atrás)

| Numeración unificada | Nombre real en el repo | Documento |
|---|---|---|
| Fase 0 | (sin nombre propio — pre-Fase 3) | ADR 0001, ADR 0002 |
| Fase 1 | Fase 3 — Foundation | `docs/fase-3-foundation.md` |
| Fase 2 | Fase 4 — Memory System | `docs/fase-4-memory-engine-closure.md` |
| Fase 3 | Fase 5 — Project Intelligence | `docs/fase-5-project-intelligence-closure.md` |
| Fase 4 | Fase 6 — Code Intelligence | `docs/fase-6-code-intelligence-closure.md` |
| Fase 5 | Fase 7 — Cline/OpenCode Integration | `docs/fase-7-cline-opencode-integration-closure.md` (sustancialmente CLOSED, 6p diferido) |
| Fase 6-9 | (no existían en el roadmap versionado real) | (nuevos, a auditar cuando corresponda) |

Los documentos de cierre existentes (Fase 3/4/5/6 reales) no se tocan,
no se renombran, no se mueven — siguen siendo la fuente de evidencia
detallada. Este documento es el índice/reconciliación que los conecta
con la visión original y con lo que falta.

## 6. Qué NO define este documento

- No autoriza ninguna implementación nueva por sí mismo — Fase 5
  unificada (5.1-5.5, 6n) queda sustancialmente cerrada, con 6p
  diferido explícitamente (ver 6r). El próximo candidato real es Fase 6
  (Developer Tools) cuando haya evidencia de que hace falta, con el
  mismo ritual usado en 4.x-6.x: audit → decisiones → propuesta formal
  → aprobación → implementación → verificación real → commit →
  checkpoint, en una conversación separada.
- No congela un modelo LLM específico — da la clase de modelo
  recomendada y por qué, no el nombre exacto.
- No renombra ni reescribe ningún documento de cierre existente.
- No trata Fase 6-9 como diseñadas — son marcadores de posición en la
  secuencia, cada una necesita su propia auditoría cuando le toque el
  turno, exactamente como cada subfase de 4.x-6.x la tuvo.

## 7. Backlog priorizado — qué falta por revisar y por hacer

Orden por dependencia real, verificado contra el código — no por
preferencia. Nació como backlog puro (ítems 1-6, "por auditar antes de
implementar") y pasó a funcionar también como log de incrementos: cada
entrada nueva se agrega al final (6b, 6c, ...), en vez de reescribir lo
ya cerrado. Los ítems 1-6 quedaron desactualizados en su momento — se
corrigen acá con el estado real verificado contra código; no se borran
porque el resto del log (6b en adelante) los referencia como
antecedente. No existe una entrada "6a" separada: cerrar 1-6 ocurrió
como implementación incremental ordinaria, sin una auditoría formal
distinguible que mereciera su propio número — el primer incremento con
entrada propia fue 6b. Ver también el resumen de estado real en §3.

```text
1. CERRADO — Fase 5.1: LLM local conectado (Ollama + modelo 7B-class)
   OllamaProvider real y endurecido (ver 6c). Modelo confirmado con
   evidencia real (no el candidato original): qwen2.5:7b-instruct-q4_K_M,
   único con tool-calling estructurado confiable (6f).

2. CERRADO — Fase 5.2: BuiltContext consumido por AgentOrchestrator.run()
   Cerrado en 5.14 (6o) — antes de eso el contexto se construía y se
   descartaba, tal como decía esta entrada originalmente.

3. PARCIAL — Fase 5.3: PolicyEngine cableado dentro de run()
   El loop interno de PolicyEngine en AgentOrchestrator.run() sigue sin
   invocarse en runtime con el motor OpenCode (ToolSelector.selectToolSteps()
   devuelve [] siempre) — la política real que sí opera hoy pasa por un
   mecanismo distinto: el bridge de eventos de permisos de OpenCode
   (6b, 6g, 6i). No es el cableado que planeaba esta entrada original;
   es una ruta alternativa que, desde 6n/6r, sí decide algo real
   (`read` + Code Intelligence vía `AllowReadRule`), no solo fail-closed
   vacío.

4. CERRADO — Fase 5.4a: Memory expuesta a ContextBuilder
   ContextBuilder depende de IMemoryRetriever real, ver ContextBuilder.ts.

5. CERRADO — Fase 5.4b: Code Intelligence expuesta al agente
   Corrección: la revisión anterior de este documento decía "sin ningún
   avance" — error de esa revisión, no hallazgo nuevo. `CodeIntelligenceToolHandler`
   (commit `5ad3370`) ya era real y testeado desde antes de esa revisión;
   lo que le faltaba era consumidor, no implementación. Cerrado del todo
   en 5.4c (entrada 6q) — el consumidor real es un servidor MCP, no
   `ContextBuilder`.

6. SUSTANCIALMENTE CERRADO — Fase 5.5: Integración Cline/OpenCode real
   Cubierto por los incrementos 5.5b-5.14 + 5.4c + 6n (6b-6r) de abajo.
   Un hallazgo real queda abierto y no bloqueante: 6p (alucinación de
   rutas del modelo) — no reproducido de nuevo en la verificación real
   de 6r, pero sin causa raíz confirmada todavía.

6b. CERRADO — Fase 5.5b: puentear permisos reales de OpenCode con
   IPolicyEngine. Cierra la brecha de seguridad documentada al cerrar
   5.5: OpenCodeExecutionEngine ejecutaba tool calls sin que
   IPolicyEngine las viera. Usa el módulo raíz (estable) del SDK real —
   client.event.subscribe()/postSessionIdPermissionsPermissionId — no
   /v2 (más inestable, con clases duplicadas). Ver ADR 0003 y commit
   25ff014.

6c. CERRADO — Fase 5.6: primer composition root real
   (`guerrero agent run <projectId> <instruction>`). Cablea de punta a
   punta OllamaProvider + ContextBuilder (Memory + Project
   Intelligence real) + PolicyEvaluator + OpenCodeExecutionEngine en
   apps/cli/src/commands/agent.ts. Verificado real en sandbox: conecta
   a Postgres real, encuentra el proyecto real, levanta un servidor
   opencode real, y falla exactamente al intentar embeber texto contra
   Ollama inalcanzable (OllamaEmbeddingProvider, dentro de
   ContextBuilder.build(), antes de llegar a ILLMProvider.generate()).
   Dos hallazgos reales de esta auditoría, ambos documentados en el
   commit: (a) `@opencode-ai/sdk`'s `server.close()` no libera el
   proceso Node por sí solo — requiere `process.exit()` explícito al
   final del comando, ya aplicado; (b) `OllamaEmbeddingProvider` (a
   diferencia de `OllamaProvider`, endurecido en Fase 5.1) todavía
   propaga errores de fetch sin un tipo `OllamaEmbeddingProviderError`
   propio — brecha real, no bloqueante, candidata a housekeeping.
   **Limitación conocida y esperada**: `PolicyEvaluator` se construye
   sin reglas registradas (fail-closed) — el agente puede correr, pero
   denegará toda tool call hasta que existan `PolicyRule`s reales, sin
   evidencia todavía de cuáles hacen falta. Candidata natural al
   siguiente paso.

6d. CERRADO — Fase 5.7: Ollama como provider real de OpenCode, sin
   cuenta cloud. La verificación de 5.6 en la máquina de Santiago
   (Postgres + Ollama reales) llegó hasta `OpenCodeExecutionEngine.execute()`
   colgado indefinidamente: sin ningún provider autenticado en OpenCode
   (`opencode auth list` → 0 credenciales), `session.prompt()` nunca
   resolvía. Verificado contra el paquete real instalado
   (`@opencode-ai/sdk@1.18.18`): OpenCode soporta providers custom
   OpenAI-compatibles vía `Config.provider[id]` (`npm:
   "@ai-sdk/openai-compatible"` + `options.baseURL`), sin necesitar
   `opencode auth login` ni cuenta cloud — coherente con el motivo por
   el que ADR 0003 eligió OpenCode sobre Cline. `agent.ts` registra
   Ollama como provider custom apuntando a `OLLAMA_BASE_URL` + `/v1`;
   `OpenCodeExecutionEngine` gana un tercer parámetro (`providerId`,
   sin hardcodear `"ollama"`) y pasa `model: {providerID, modelID}` en
   cada `session.prompt()`. Ver commit `5ee24ec`.

   **Verificado real por Santiago en su máquina**: `guerrero agent run`
   completó de punta a punta por primera vez (`Estado: succeeded`) con
   `gemma3:4b`. Pero la salida fue `{"name": "write", "arguments":
   {...}}` como texto plano, no una tool call real interceptada por el
   puente de Fase 5.5b (ningún evento `permission.updated` se disparó).
   Hipótesis sin confirmar: soporte de tool-calling de `gemma3:4b` vía
   Ollama, no un problema del wiring — ver 6e.

6e. CERRADO (código) / PENDIENTE (diagnóstico) — Fase 5.8: flag
   `--model` en `guerrero agent run`, para repetir el experimento de 6d
   con otros modelos ya descargados (`qwen2.5-coder:7b`,
   `qwen2.5:7b-instruct-q4_K_M`, `qwen3-coder`) sin editar variables de
   entorno. No fija `tool_call: true` en el config del modelo — se
   prueba primero con un modelo real, para no adivinar sin evidencia.
   Ver commit pendiente de esta sesión.

   **Pendiente**: resultado del diagnóstico de Santiago con
   `--model qwen2.5-coder:7b` (o el que elija) — confirma si el
   problema de 6d era específico de `gemma3:4b` (dispara
   `permission.updated` real) o si persiste (siguiente paso:
   `tool_call: true`, evaluado con evidencia nueva).

6f. CERRADO (parcial) — Fase 5.9: hipótesis de 6e descartada por
   evidencia directa, no confirmada. `qwen2.5-coder:7b` reprodujo el
   mismo síntoma que `gemma3:4b` (tool call como texto plano, sin
   `permission.updated`) — no era específico de un modelo sin soporte
   de tools. `tool_call: true` (campo real de
   `ProviderConfig.models[key]`, `@opencode-ai/sdk` instalado) se
   agregó a la entrada del modelo en `Config.provider["ollama"]` —
   necesario según el contrato del SDK, pero probado directo contra
   `POST /api/chat` de Ollama (sin pasar por OpenCode) con `tools` real
   declarado, `qwen2.5-coder:7b` sigue sin envolver su respuesta en
   `<tool_call>...</tool_call>` como exige su propio template
   (`ollama show qwen2.5-coder:7b --template`) — consistente en 3/3
   intentos. Es una limitación de esa cuantización/checkpoint
   específica, no del wiring. `qwen2.5:7b-instruct-q4_K_M` (mismo peso,
   ya descargado) sí produce `tool_calls` estructurados de forma
   consistente (2/2, verificado real) — es la elección recomendada hoy
   para `agent run`. Ver commit de esta sesión.

6g. CERRADO — Fase 5.9b: brecha de seguridad real, distinta del
   síntoma de 6f. Verificando 5.9 con `qwen2.5:7b-instruct-q4_K_M` (el
   primer modelo que sí dispara tool-calling estructurado real), el log
   de `opencode serve` mostró `evaluated permission=webfetch ...
   action.action=allow` repetido en cada paso — `IPolicyEngine.evaluate()`
   nunca se llamó, `OpenCodeExecutionEngine.handlePermissionEvents()`
   (Fase 5.5b) nunca vio un `permission.updated` para esa sesión. Causa
   real: sin `Config.permission` explícito, OpenCode resuelve `webfetch`
   a `allow` por su propio default interno y jamás emite el evento —
   exactamente el hueco que Fase 5.5b decía haber cerrado ("OpenCode
   ejecutaba tool calls sin que nuestro PolicyEngine los viera"), seguía
   abierto para esta categoría. `permission: {edit,bash,webfetch}: "ask"`
   fuerza que las tres categorías reales de tool del agente `build`
   (`Agent.permission`, `@opencode-ai/sdk/dist/gen/types.gen.d.ts:1407-1415`)
   pasen siempre por un `permission.updated` real — con `PolicyEvaluator`
   fail-closed y sin reglas (comportamiento esperado, ítem 6c), esto
   deniega toda tool call real hasta que existan `PolicyRule`s, que es
   exactamente la garantía que esa clase dice ofrecer. Ver commit de
   esta sesión.

6h. CERRADO (mitigación) / PENDIENTE (causa raíz) — Fase 5.9c:
   deadlock real nuevo, encontrado al verificar 6g con
   `qwen2.5:7b-instruct-q4_K_M`. El modelo llamó `read` con
   `filePath: "/path/to/your/file.txt"` — un placeholder literal, copiado
   del propio texto de un error de esquema anterior en vez de sustituirlo
   por la ruta real — que OpenCode interpretó como fuera del proyecto y
   disparó permiso `external_directory`. Ese permiso quedó en estado
   `running` para siempre: `OpenCodeExecutionEngine.handlePermissionEvents()`
   nunca lo vio pasar. Reproducido en 2/2 corridas, incluso con una
   instrucción trivial sin relación a lectura de archivos — no es un caso
   raro. `EXECUTION_TIMEOUT_MS = 120_000` activa `options.timeoutMs`
   (puerto `IExecutionEngine`, soportado desde Fase 5.7b pero nunca antes
   pasado desde ningún composition root real) como cota dura: convierte
   el deadlock silencioso en `Estado: failed` con `reason: "timeout"` —
   mitiga el síntoma, no la causa. Ver commit de esta sesión.

   **Pendiente — auditoría de causa raíz**: hipótesis sin confirmar (no
   se pudo inspeccionar el binario `opencode` en tiempo de ejecución):
   `event.subscribe()` se suscribe con
   `query: { directory: policyContext.projectRootPath }` — un permiso de
   directorio EXTERNO al proyecto podría quedar fuera de ese filtro
   server-side, exactamente la categoría de evento más security-sensible
   para perder (intentos de escapar del directorio del proyecto). Si se
   confirma, el fix real no es el timeout — es que `event.subscribe()`
   deje de filtrar por `directory`, o se resuelva contra el directorio
   real involucrado en cada permiso, no solo el del proyecto.

6i. CERRADO (causa raíz confirmada y arreglada) — Fase 5.9d. La
   hipótesis de 6h (filtro `directory` de `event.subscribe()`) quedó
   **descartada** con evidencia directa, no confirmada por deducción:
   se levantó `opencode serve` manualmente con la misma config real
   (provider Ollama + `tool_call: true` + `permission: "ask"`) y se
   abrieron DOS suscripciones SSE en paralelo a `GET /event` — una con
   `?directory=<projectRoot>` (igual a nuestro código) y otra sin ningún
   filtro. Se disparó la misma instrucción real que reproducía el
   deadlock. Resultado: **ninguna de las dos** recibió jamás un evento
   `permission.updated` — ni la filtrada ni la abierta. La hipótesis del
   filtro estaba mal.

   Causa real, confirmada inspeccionando `GET /doc` (spec OpenAPI que
   sirve el propio binario `opencode-ai@1.18.18` en vivo) y el contenido
   crudo del stream SSE: el servidor real emite `"permission.asked"`
   (`components.schemas.EventPermissionAsked`/`PermissionAsked` del spec
   real), con forma `properties: {id, sessionID, permission, patterns,
   metadata, always, tool: {messageID, callID}}` — **sin ningún tipo
   `"permission.updated"` en absoluto**, y sin campo `time`. Los tipos
   generados de `@opencode-ai/sdk@1.18.18` (`Event`,
   `EventPermissionUpdated`, `Permission`) — mismo número de versión que
   el binario — están desincronizados del binario real: declaran
   `type: "permission.updated"` con `properties.type`/
   `properties.time.created`, una forma que el servidor real jamás
   produjo en ningún experimento. `OpenCodeExecutionEngine.
   handlePermissionEvents()` filtraba por `event.type !==
   "permission.updated"` — nunca coincidía con nada real, así que ningún
   permiso pedido de verdad llegó jamás a `IPolicyEngine.evaluate()`
   desde que existe el puente (Fase 5.5b) — el bug estuvo ahí desde el
   principio, nunca antes ejercitado contra un servidor real con un
   permiso real disparado.

   Confirmado el cierre completo del ciclo respondiendo manualmente
   (`POST /session/{id}/permissions/{permissionID}`, endpoint sin
   cambios — funciona tal como documenta el SDK) a un permiso real
   capturado así: el `session.prompt()` que llevaba minutos colgado
   resolvió al instante.

   Fix real: `handlePermissionEvents()` ahora reconoce
   `"permission.asked"` (vía un type guard local, `asPermissionAsked()`,
   porque el `Event` importado del SDK no declara esta forma) y mapea
   `properties.permission` (no `.type`) a `ToolRequest.toolName`;
   `requestedAt` usa `new Date()` al procesar el evento, ya que el
   payload real no trae ningún timestamp. `postSessionIdPermissionsPermissionId`
   no cambió — ya funcionaba. `EXECUTION_TIMEOUT_MS` de Fase 5.9c queda
   como red de seguridad de verdad (defensa en profundidad), ya no como
   parche del síntoma principal.

   **Verificado real, end-to-end, con el comando exacto que reveló el
   problema** (`agent run ... --model qwen2.5:7b-instruct-q4_K_M`, dos
   corridas consecutivas): `Estado: succeeded` en ~25-33s, sin cuelgue,
   sin timeout — el permiso `external_directory` real se pide, se
   evalúa (denegado, `PolicyEvaluator` fail-closed sin reglas), se
   responde, y la sesión termina. Ver commit de esta sesión.

6j. CERRADO — Fase 5.9e: `Estado: succeeded` engañoso sin ninguna
   `Salida:`. Santiago corrió el mismo comando ya arreglado por 6i y
   reportó exactamente eso — no era el deadlock (confirmado: el permiso
   se pidió y se respondió rápido). Investigado capturando el historial
   de la sesión en vivo (vía la API REST del propio `opencode serve`
   mientras corría el comando real): el modelo leyó `package.json` con
   éxito, y después intentó **reescribirlo** con el texto numerado que le
   devolvió `read` (sintaxis JSON corrupta — verificado a mano que
   aprobar esa escritura habría dañado el archivo real). Un permiso de
   `edit` real, correctamente denegado por `IPolicyEngine` fail-closed —
   el sistema de seguridad funcionó exactamente como debía. El problema
   real: después del rechazo, OpenCode no le da al modelo otro turno
   para responder en texto — el mensaje queda con `finish: "tool-calls"`,
   sin ninguna parte de tipo `text` y sin `AssistantMessage.error`
   tampoco, y `OpenCodeExecutionEngine.execute()` reportaba eso como
   `status: "succeeded"` sin salida — técnicamente cierto del lado del
   transporte, pero escondía que el agente no le contestó nada al
   usuario. `findFailedToolError()` detecta este caso (sin texto, con
   una tool call en `state.status: "error"` — cubre tanto rechazos de
   permiso como fallos reales de la tool) y lo reporta como
   `status: "failed"` con un `errorMessage` legible (tool + motivo real).
   Verificado real: el mismo comando ahora devuelve
   `Estado: failed` / `Error: Tool "webfetch" falló: The user rejected
   permission...` en vez de quedar en silencio. Ver commit de esta
   sesión.

   **Nota de diseño, no resuelta acá**: por qué el modelo intenta
   reescribir el archivo que acaba de leer (en vez de solo responder la
   pregunta) es un problema de calidad de razonamiento del modelo chico,
   no de este código — y por qué `agent run` no puede responder preguntas
   de solo lectura sin que el fail-closed de `PolicyEvaluator` bloquee
   todo (incluso acciones inofensivas si el modelo las intentara) es la
   auditoría pendiente de la primera `PolicyRule` real, ítem 6c.

6k. CERRADO — Fase 5.10: preguntas de solo lectura ya obtienen
   respuesta de texto real. Diagnóstico: `read` nunca pasa por
   `IPolicyEngine` — no es una categoría de `Config.permission`, así que
   un `PolicyRule` no cambiaba nada acá (la idea original de "escribir la
   primera PolicyRule" no aplicaba al síntoma real). El bloqueo
   verdadero: tras leer el archivo, `qwen2.5:7b-instruct-q4_K_M` a veces
   intentaba de más (reescribir el archivo con el texto numerado que le
   devolvió `read`, o buscar algo no pedido en la web) — esa tool call
   quedaba denegada (Fase 5.9b/5.9d) y OpenCode no le daba al modelo otro
   turno para responder en texto (Fase 5.9e detecta esto, pero no lo
   evita).

   Verificado real, levantando `opencode serve` a mano con la config
   real de este archivo: `Config.tools` a nivel raíz NO restringe lo que
   el agente `build` puede intentar (probado: el modelo llamó `webfetch`
   igual con `tools.webfetch: false` ahí). Recién bajo
   `Config.agent.build.tools` (específico al agente `build`, confirmado
   en los logs como el que se usa acá) el modelo dejó de poder invocar
   esas tools — y, sin poder desviarse, leyó el archivo y respondió en
   texto (`finish: "stop"`, no `"tool-calls"`).

   `DISABLED_TOOLS` (`apps/cli/src/commands/agent.ts`) apaga `bash`,
   `edit`, `write`, `webfetch`, `websearch`, `apply_patch` del agente
   `build` — `read`/`glob`/`grep` quedan habilitadas. Coherente con
   dónde está el proyecto hoy (Fase 5 — Agent Core real, sin acciones
   reales todavía; escritura de archivos es Fase 6, no iniciada), no una
   limitación arbitraria. `permission: {edit,bash,webfetch}: "ask"`
   (Fase 5.9b) queda como segunda capa de defensa.

   **Verificado real, con el comando exacto original, dos corridas
   consecutivas**: `Estado: succeeded` con una `Salida:` de texto real
   resumiendo las dependencias de `package.json` — la barrera de
   seguridad sigue intacta (verificado pidiendo explícitamente una
   edición: sigue denegada, ver 6l). Ver commit de esta sesión.

6l. CERRADO — Fase 5.11: permisos de subagentes ya visibles para el
   puente de `IPolicyEngine`. Al pedir explícitamente una edición
   (`"agregá una línea de comentario..."`), el modelo a veces canaliza
   la tool `task` (spawnea un subagente `general`, con su propio
   `sessionID`, distinto del `plan.id` que
   `OpenCodeExecutionEngine.handlePermissionEvents()` rastreaba). El
   permiso pedido desde esa sub-sesión nunca coincidía con el filtro
   `permission.properties.sessionID !== sessionId` — el turno quedaba
   colgado hasta que `EXECUTION_TIMEOUT_MS` (Fase 5.9c) lo cortaba a los
   120s en vez de fallar rápido.

   Verificado real disparando un subagente de verdad (levantando
   `opencode serve` a mano con la config real de `agent.ts`, incluido
   `DISABLED_TOOLS` — necesario para reproducir: sin las tools apagadas
   el modelo edita directo, sin pasar por `task`): el evento real
   `session.created` (a diferencia de `permission.updated`, éste SÍ
   coincide con lo que declara el SDK) trae `properties.info.parentID`
   apuntando a la sesión principal. `sessionFamily` (`Set<string>`,
   arranca con la sesión principal) crece con cada `session.created`
   real cuyo `parentID` ya esté en la familia — cualquier
   `permission.asked` de un miembro de esa familia se evalúa igual, y
   `postSessionIdPermissionsPermissionId` usa el `sessionID` real dueño
   del permiso (el del subagente, no el de la sesión principal) en el
   path, como exige la API. 2 tests nuevos en
   `OpenCodeExecutionEngine.test.ts` (subagente real evaluado y
   respondido con su propio sessionID; sesión sin relación a la familia
   sigue ignorada) — 20/20 en verde. Ver commit de esta sesión.

6m. CERRADO — Fase 5.12: loops sin convergencia acotados con
   `maxSteps`. Verificando 6l end-to-end con el comando real, el modelo
   no repitió el camino del subagente esa vez (comportamiento no
   determinístico, ya documentado en 6f/6h/6k) — en su lugar entró en
   loops que nunca convergían (`todowrite` repetido sin fin en un caso,
   o más pasos de los necesarios en otro, tanto en el agente `build`
   como en un subagente `general`), terminando recién cuando
   `EXECUTION_TIMEOUT_MS` cortaba a los 120s.

   Verificado real, levantando `opencode serve` a mano con la config
   real de `agent.ts`: `AgentConfig.maxSteps` ("Maximum number of
   agentic iterations before forcing text-only response",
   `@opencode-ai/sdk`) sí acota los pasos — probado en escalón:
   `maxSteps: 1` corta antes de poder leer un archivo (muy agresivo);
   `maxSteps: 3` ya alcanza para el flujo completo real (leer +
   responder en texto con contenido real, no truncado); `6` da margen
   extra sin acercarse a los 18-20+ pasos de un loop real. Hallazgo
   importante: hay que declararlo en CADA agente que corre, no solo
   `build` — un subagente `general` (vía `task`) corre bajo su propia
   config de agente y no hereda el `maxSteps` de `build`; confirmado
   real: con `maxSteps` solo en `build`, un pedido de escritura
   canalizado vía subagente siguió sin converger hasta el timeout;
   agregando `general: {maxSteps}` también, el mismo pedido resolvió en
   ~23s.

   `MAX_AGENT_STEPS = 6` (`apps/cli/src/commands/agent.ts`), aplicado a
   `agent.build` y `agent.general`. **Verificado real, end-to-end**: el
   caso de solo lectura (6k) sigue devolviendo una respuesta completa
   sin truncar (~52s). El caso de escritura explícita (el que antes
   tardaba 113-144s o llegaba al timeout de 120s) ahora resuelve en
   ~46-52s en dos corridas consecutivas, con `package.json` siempre
   intacto (verificado a mano después de cada corrida). Ver commit de
   esta sesión.

6n. CERRADO (código) / NO ALCANZABLE EN RUNTIME todavía — Fase 5.13:
   primera `PolicyRule` real y concreta (`AllowReadRule`,
   `packages/agent-core/src/rules/`). Cierra por el lado del código la
   limitación anotada al cerrar 6c: `PolicyEvaluator` se construía sin
   ninguna regla, y sin reglas deniega todo (fail-closed). `AllowReadRule`
   aprueba `toolName === "read"` — lectura sin mutación del workspace, sin
   ejecución, sin salida a red — y deniega explícitamente cualquier otra
   herramienta.

   Decisión de diseño no obvia, y el motivo por el que la regla es más
   larga de lo que parece: `PolicyEvaluator.evaluate()` agrega con
   semántica AND y early exit (todas las reglas tienen que aprobar; la
   primera que deniega gana). Bajo esa semántica, una regla que "solo
   opine" sobre `read` y apruebe lo demás, siendo la única registrada,
   equivale a aprobar todo — deshace el fail-closed en vez de acotarlo.
   Por eso la allow-list vive dentro de la regla y el deny de lo demás es
   explícito.

   Limitación de composición, documentada en el JSDoc de la clase, no
   escondida: reglas *restrictoras* (deniegan un caso, aprueban el resto —
   p. ej. "denegar `read` fuera de `projectRootPath`") componen bien con
   esta bajo AND. Dos *allow-lists parciales* (p. ej. un `AllowGlobRule`
   con el mismo patrón) NO componen: registradas juntas se anulan. Para
   habilitar otra herramienta hay que ampliar la allow-list de
   `AllowReadRule`, no agregar una segunda regla allow. Soportar
   allow-lists independientes exigiría rediseñar la agregación de
   `IPolicyEngine` (modelo tipo IAM: deny explícito gana; sin deny,
   cualquier allow explícito gana; si nadie opina, fail-closed) — fuera de
   alcance acá, sin un segundo caso real que lo justifique.

   **Honestidad de alcance, verificada, no asumida**: hoy esta regla no
   decide nada en el flujo real de `guerrero agent run`, y por eso NO se
   registra en el composition root (`apps/cli/src/commands/agent.ts`).
   `OpenCodeExecutionEngine.handlePermissionEvents()` solo produce
   `toolName` con las categorías de permiso de OpenCode (`edit`, `bash`,
   `webfetch`, `external_directory`), nunca `read`; y el bucle de política
   de `AgentOrchestrator.run()` está muerto con el motor OpenCode porque
   `ToolSelector.selectToolSteps()` siempre filtra a `[]` (los steps de
   `OpenCodeExecutionEngine.plan()` no llevan `toolRequest`). Registrarla
   sería seguro pero inútil, y sugeriría una cobertura de lectura
   inexistente. Tampoco valida QUÉ se lee: ignora `request.input` y
   `context.projectRootPath`, así que leer `.env` o un archivo fuera del
   proyecto pasa la regla — trabajo de una regla restrictora futura.
   Pendiente asociado, a decidir el día que el motor exponga tool calls
   granulares: cuál es el vocabulario canónico de `toolName` (categorías de
   OpenCode vs. nombres internos como `read`), hoy divergentes. Cubierto
   por `AllowReadRule.test.ts` (5 casos, incluyendo `edit`/`bash` reales y
   la comparación exacta sensible a mayúsculas) más un caso end-to-end en
   `PolicyEvaluator.test.ts` con la regla real registrada en el motor.

   **Actualización — Fase 6n cerrada de verdad en 6r**: el vocabulario sí
   se reconcilió, y esta regla sí se volvió alcanzable en runtime — ver
   6r para la evidencia real completa. Esta entrada se deja intacta como
   registro histórico de lo que se sabía en su momento.

6o. CERRADO — Fase 5.14: el contexto real (Memory + Project
   Intelligence) ya llega al agente que responde. Auditando el estado de
   la Fase 5 para decidir si se podía cerrar, se confirmó con lectura
   directa de código un gap real, anotado desde antes por el propio
   JSDoc de `AgentOrchestrator` ("conectarla al plan real sigue siendo
   Fase 5.5") y nunca tocado por ninguno de los 13 incrementos previos
   (5.7-5.13, todos centrados en otros problemas reales de la
   integración OpenCode): `run()` construía `BuiltContext` vía
   `ContextBuilder.build()` (Memory + Project Intelligence reales,
   contra Postgres/pgvector) pero solo lo usaba en una llamada
   standalone a `ILLMProvider.generate()` cuyo resultado
   (`ExecutionResult.llmResponse`) no consumía nadie — verificado
   repo-wide antes de tocar nada. El plan real que ejecutaba OpenCode
   nunca veía ese contexto: `session.prompt()` salía con
   `task.instruction` pelado.

   Mecanismo real, verificado contra el binario `opencode serve` en
   vivo (mismo rigor que 5.9d, no solo los tipos npm — acá, a
   diferencia de los eventos de permiso, el paquete SÍ coincide con el
   binario): `session.prompt()` acepta `body.system?: string`,
   confirmado tanto en el spec OpenAPI real (`GET /doc`) como en
   `SessionPromptData.body.system` de
   `@opencode-ai/sdk/dist/gen/types.gen.d.ts`. No hizo falta reordenar
   el composition root ni usar `Config.agent.build.prompt` (ese es a
   nivel servidor completo, no por-request, y su semántica ni siquiera
   está documentada en el spec).

   `ExecutionOptions` (dominio) ganó `systemPrompt?: string` — único
   canal por-request disponible entre `AgentOrchestrator` y
   `IExecutionEngine.execute()` (el `ExecutionPlan` lo produce el
   propio motor, no se le puede inyectar sin fabricar estado de dominio
   ajeno). `AgentOrchestrator.run()` dejó de llamar a
   `ILLMProvider.generate()` — pasa `{...options, systemPrompt:
   context.systemPrompt}` a `execute()`, con el contexto pisando
   deliberadamente cualquier `systemPrompt` que traiga el caller.
   `ILLMProvider` dejó de ser dependencia del constructor (el puerto y
   `OllamaProvider` siguen existiendo, sin consumidor real hoy).
   `ExecutionResult.llmResponse` se eliminó del dominio (cero
   consumidores). `OpenCodeExecutionEngine.execute()` manda
   `options.systemPrompt` como `body.system` solo si viene definido —
   sin contexto, el body sale idéntico al de antes de este fix (ni
   siquiera con la clave en `undefined`, verificado con un assert
   explícito de ausencia de clave — `toEqual` de Vitest ignora claves
   `undefined`).

   `apps/cli/src/commands/agent.ts` perdió la instanciación de
   `OllamaProvider` (sin otro consumidor en el archivo) y el
   composition root pasó a construir `AgentOrchestrator` con 3
   argumentos. `.env.example`/`.env` actualizados: `OLLAMA_DEFAULT_MODEL`
   pasa a ser el único consumidor real de esa variable (ya no hay una
   segunda inferencia de texto plano), así que el default cambia de
   `gemma3:4b` a `qwen2.5:7b-instruct-q4_K_M` (el único modelo con
   tool-calling confiable confirmado en este repo, Fase 5.9) — con
   `gemma3:4b` como default, `agent run` sin `--model` fallaba siempre.

   Tests: `AgentOrchestrator.test.ts` reescrito (8 tests, antes 7) — se
   eliminó el test que fijaba la llamada a `generate()`; los 2 tests de
   "falla el LLM" se reemplazaron por sus equivalentes de "falla
   `ContextBuilder.build()`" (mismo criterio todo-o-nada, sobre el
   fallo real que queda en ese punto del flujo); 2 tests nuevos
   verifican, con un `ContextBuilder` real (no mockeado) y fixtures de
   `ProjectProfile`/memoria reales, que el `systemPrompt` completo y
   exacto llega a `execute()`, y que gana sobre cualquier
   `options.systemPrompt` del caller. `OpenCodeExecutionEngine.test.ts`
   ganó un test de ausencia de `body.system` (explícito, no solo
   `undefined`) y uno de presencia con el contexto real. 21+8 tests
   nuevos/modificados, sin regresiones en el resto de la suite.

   **Verificado real, end-to-end** — con logging de debug temporal (no
   commiteado) en dos puntos: `options.systemPrompt` justo antes de
   `session.prompt()`, y el evento `permission.asked` crudo. Confirmado
   que `options.systemPrompt` llega intacto a `OpenCodeExecutionEngine`
   con el texto exacto producido por `ContextBuilder`. Para confirmar
   que el binario real reenvía `body.system` a Ollama (no solo que el
   SDK lo acepta), se interceptó el tráfico saliente con un proxy HTTP
   local (`OLLAMA_BASE_URL` apuntado a él por una sola corrida):
   `POST /v1/chat/completions` mostró el `role: "system"` con nuestra
   línea (`"Eres el agente de Guerrero Dev trabajando en el proyecto
   f4634eac-…"`) concatenada, verbatim, al final del system prompt
   propio de OpenCode (persona + `AGENTS.md` completo). El canal está
   probado de punta a punta con evidencia de red real, no solo de tipos.

   Lo que esto NO prueba — y es un hallazgo real, separado, que quedó
   expuesto al intentar la verificación conversacional ingenua ("sin
   usar ninguna herramienta, repetime el proyecto en el que estás
   trabajando"): con `qwen2.5:7b-instruct-q4_K_M`, una línea de contexto
   al final de un system prompt de varios miles de tokens no siempre se
   prioriza en la respuesta — el modelo contestó "no me diste ningún
   proyecto" pese a que la línea estaba ahí, confirmado por el proxy en
   la misma corrida. Ya estaba anotado como fuera de alcance de este
   incremento en el JSDoc de `ContextBuilder` ("la forma final de
   convertir `ProjectProfile`/memorias en texto depende de cómo responda
   un LLM real — Fase 5.5"): 5.14 cierra el transporte, no la calidad de
   respuesta de un modelo 7B cuantizado ante un system prompt largo.
   Ver 6p para un segundo hallazgo real (no relacionado al transporte)
   encontrado en la misma sesión de verificación.

6p. ENCONTRADO, no arreglado — `read` alucina rutas absolutas en tool
   calls reales de `qwen2.5:7b-instruct-q4_K_M`. Al intentar el caso de
   regresión de 6o ("leé el package.json de la raíz y decime las
   dependencias") contra el proyecto real de este propio repo, el
   modelo pidió leer `C:\path\to\your\project\package.json` y, en un
   segundo intento, `C:\root\package.json` — ninguna es la ruta real
   (`C:\Dev\agente\guerrero-dev`, presente y correcta en el bloque
   `<env>` que el propio OpenCode antepone al system prompt, confirmado
   con el mismo proxy de 6o). `external_directory` (Fase 5.5b/5.9b)
   denegó ambos intentos correctamente — el fail-closed funcionó como
   diseño, esto no es un agujero de seguridad. Es una limitación de
   fiabilidad del modelo en tool-calling con rutas absolutas reales,
   reproducible en 2/2 intentos, no un efecto de 5.14 (el mecanismo de
   contexto no participa en cómo el modelo arma los argumentos de una
   tool call). Nada tocado todavía: no hay evidencia de si la causa es
   el propio modelo (7B cuantizado, conocido por copiar valores de
   ejemplo de un schema en vez de sustituirlos), el prompt de entorno de
   OpenCode, o algo combinable con un modelo más grande — decisión y
   alcance pendientes de una auditoría futura, no de un fix reflejo acá.

   **Actualización (6r)**: decidido explícitamente no perseguir esto más
   por ahora, con evidencia, no por default. Dos motivos reales: (1) no
   hay modelo más grande disponible en este entorno para probar la
   hipótesis principal (`ollama list` solo tiene
   `qwen2.5:7b-instruct-q4_K_M`, `qwen3.5:2b` y un modelo de
   embeddings); (2) el mismo prompt de regresión ("leé el package.json
   de la raíz...") corrió 2/2 sin alucinar ninguna ruta en la
   verificación end-to-end real de 6n/6r. Esto no prueba que esté
   arreglado — no cambió nada en cómo el modelo arma argumentos de tool
   calls — pero sí significa que no hay evidencia nueva para actuar
   ahora. Queda diferido: retomar cuando reaparezca con una repro clara,
   o cuando haya un modelo más grande disponible para probar.

6q. CERRADO — Fase 5.4c: `CodeIntelligenceToolHandler` (5.4b) conectado
   de verdad vía un servidor MCP real. Auditando si 5.4b podía darse por
   cerrado, se encontró el mismo patrón que 6n: código real y testeado
   sin ningún consumidor (`grep -rl CodeIntelligenceToolHandler` fuera
   de `application/code-intelligence` daba vacío antes de este
   incremento). El camino de dominio (`ExecutionPlanStep.toolRequest` →
   `ToolSelector.selectToolSteps()`) está muerto con el motor OpenCode
   (6n) — conectar el handler ahí habría sido igual de inútil.
   Verificado contra el SDK real (`@opencode-ai/sdk@1.18.18`,
   `types.gen.d.ts`) que el único mecanismo real para tools nuevas es un
   servidor MCP (`Config.mcp[id]`, `McpLocalConfig`) — coincide con lo
   que el propio JSDoc de `ToolSelector` ya anticipaba ("Cuando exista un
   catálogo real de herramientas MCP, `@guerrero-dev/mcp`").

   `@guerrero-dev/mcp` (cascarón desde Fase 3, sin tocar hasta ahora)
   gana su primera implementación real: `CodeIntelligenceMcpServer`
   (`@modelcontextprotocol/sdk@1.30.0`, dependencia nueva) envuelve
   `CodeIntelligenceToolHandler` con los 4 tools ya reales de 5.4b
   (`find_symbols_by_name`, `get_dependencies`, `get_dependents`,
   `search_literal`), más `server.ts` como entrypoint spawneable
   (`./server` subpath export, mismo patrón que `apps/api`'s `./app`).
   Decisión de diseño explícita: `repoRoot` llega por variable de
   entorno al spawnear (`CODE_INTELLIGENCE_REPO_ROOT_ENV`), nunca como
   argumento que el modelo tenga que completar — evita reproducir la
   alucinación de rutas de 6p por diseño, no por suerte, porque el
   composition root (`apps/cli/src/commands/agent.ts`) ya conoce
   `project.path` real.

   **Hallazgo real de esta auditoría, no de wiring**: la primera vez que
   se probó `Config.mcp` + `Config.provider` juntos contra el directorio
   de este propio repo, `opencode serve` devolvió `Unexpected error /
   ServeError` de forma silenciosa (servidor HTTP seguía respondiendo,
   pero nunca spawneó el proceso MCP — verificado con
   `Get-CimInstance Win32_Process`, cero coincidencias reales). Aislado
   por eliminación (config vacía → sin error; solo `provider` → sin
   error; solo `mcp` → sin error pero tampoco spawnea; ambos juntos →
   error) hasta un directorio de trabajo nuevo, sin ningún error:
   `opencode` mantiene una "instancia" por directorio persistida en
   `~/.local/share/opencode/opencode.db`, y un primer intento roto
   contra un directorio la deja envenenada — reintentos posteriores
   contra el mismo directorio, incluso con config ya corregida, siguen
   fallando hasta usar un directorio nuevo. No es un bug de este código:
   es una limitación operacional real de `opencode serve` 1.18.18, causa
   raíz exacta sin confirmar — candidata a auditoría futura si reaparece
   en uso real (p. ej. si `guerrero agent run` falla así, un
   `~/.local/share/opencode/opencode.db` corrupto para ese directorio es
   sospechoso número uno).

   **Verificado real, end-to-end**, mismo método de proxy HTTP que
   5.14/6o (`OLLAMA_BASE_URL` apuntado a un proxy local que loggea el
   `POST /v1/chat/completions` real antes de reenviarlo a Ollama, en un
   directorio de trabajo limpio): los cuatro tools de Code Intelligence
   aparecen en el array `tools` real que OpenCode le manda al modelo,
   prefijados `code-intelligence_{toolName}` (naming real de OpenCode
   para tools de un servidor MCP local, confirmado, no asumido de la
   documentación de MCP) — junto a los tools nativos (`bash`, `read`,
   `edit`, etc.). Tests: `CodeIntelligenceMcpServer.test.ts` (6 casos,
   protocolo MCP real vía `InMemoryTransport`, sin mockear ninguna clase
   del SDK) + `tests/integration/code-intelligence-mcp-server.test.ts`
   (4 casos, spawnea el binario `node` real sobre `packages/mcp/dist/server.js`
   ya compilado y habla stdio real contra un `Client` real, dogfooding
   contra `guerrero-dev`, mismo criterio que `fase-6-acceptance.test.ts`).
   487 tests totales (antes 481), build/typecheck/lint limpios.

   Corrección sobre la revisión anterior de este documento: decía que
   5.4b estaba "sin ningún avance" — error de esa revisión, no un
   hallazgo nuevo. El handler ya existía real y testeado desde el commit
   `5ad3370`; lo que le faltaba era consumidor, confirmado con
   `git log`, no con una suposición.

6r. CERRADO — Fase 6n: vocabulario canónico de `toolName` reconciliado,
   `AllowReadRule` real y alcanzable en runtime por primera vez.
   Auditando 6n se encontró una brecha de seguridad real en el propio
   trabajo de 5.4c, del mismo tipo que 5.9b: el log de `opencode serve`
   mostró `evaluated permission=code-intelligence_find_symbols_by_name
   ... action.action=allow` — los cuatro tools de Code Intelligence se
   auto-aprobaban en silencio, sin que `IPolicyEngine` los viera jamás.

   Segundo hallazgo, que corrige lo escrito en 5.10/6c: se creía que
   `"read"` nunca podía ser una categoría de `Config.permission` (basado
   en los tipos de `@opencode-ai/sdk`, `Agent.permission`). Falso —
   mismo tipo de desfase tipos/binario que ya reveló 5.9d. El `GET /doc`
   real del binario (`opencode-ai@1.18.18`) expone un
   `PermissionConfig` mucho más rico: `"read"`, `"glob"`, `"grep"`,
   `"bash"`, `"task"`, `"external_directory"`, `"lsp"`, `"skill"`
   explícitos, más un `additionalProperties: PermissionRuleConfig` que
   acepta cualquier nombre de tool — incluidos los de un servidor MCP.
   Verificado real, en vivo, con `opencode serve` + Ollama reales:
   forzar `permission: { read: "ask" }` produce un `permission.asked`
   real con `properties.permission === "read"`; lo mismo para
   `code-intelligence_find_symbols_by_name` forzando su propia entrada.
   Nunca se había probado contra el schema real, solo se había asumido
   de los tipos.

   Con esa evidencia, `AllowReadRule` (5.13) deja de ser código muerto:
   gana un constructor con `additionalAllowedTools` (Fase 6n) —
   `agent-core` no puede depender de `@guerrero-dev/mcp` (paquetes
   hermanos en la capa de "implementaciones", `CLAUDE.md`), así que el
   composition root real (`apps/cli/src/commands/agent.ts`) arma la
   lista completa (`CODE_INTELLIGENCE_TOOL_NAMES` de `@guerrero-dev/mcp`
   + el id real del servidor MCP) y se la inyecta ya resuelta. Respeta
   la limitación de composición que el propio JSDoc de la clase ya
   documentaba: se amplía la allow-list de la regla existente, no se
   agrega una segunda regla allow (que se anularía con esta bajo AND).
   `Config.permission` real del composition root gana `read` + las
   cuatro entradas de Code Intelligence; `PolicyEvaluator` deja de
   construirse sin reglas por primera vez en un composition root real.
   `external_directory` queda fuera, sin re-verificar en esta sesión —
   5.9c ya documenta que se pide sin forzarlo, sin evidencia de que
   necesite el mismo tratamiento.

   Tests: 4 casos nuevos en `AllowReadRule.test.ts` (tools inyectadas,
   read sigue aprobado, tool no listada se deniega, comportamiento
   default sin cambios) — 491 tests totales (antes 487).
   Build/typecheck/lint limpios.

   **Verificado real, end-to-end**, contra Postgres + Ollama +
   `opencode serve` reales (`guerrero agent run f4634eac-... "..."`,
   proyecto real `guerrero-dev`): "Leé el archivo package.json de la
   raíz..." → `Estado: succeeded`, contenido real del `package.json`
   real, sin alucinación de rutas (mismo prompt que motivó 6p). "Busca
   el símbolo AgentOrchestrator en el código" → el modelo invocó
   `code-intelligence_find_symbols_by_name` de verdad (permiso pedido,
   evaluado por `AllowReadRule`, aprobado) y respondió correctamente
   con la ubicación real (`packages/agent-core/src/AgentOrchestrator.ts`,
   líneas 75-126). Un intento anterior con un prompt más compuesto
   ("usa la herramienta... y decime...") devolvió una respuesta de texto
   rota (con un fragmento en chino, sin responder la pregunta) —
   `Estado: succeeded` igual, mismo tipo de limitación de fiabilidad de
   instrucciones compuestas ya documentada en 6f/6p con este modelo 7B,
   no una regresión de este cambio ni un problema del wiring de
   permisos (que sí se completó y respondió correctamente en el segundo
   intento).

7. CERRADO — HOUSEKEEPING: comentario de packages/project-intelligence/src/index.ts
   corregido. Decía "implementación real llega en Fase 5-6"; ahora
   documenta dónde aterrizó de verdad (`domain/project` + `domain/code`,
   con sus servicios/adapters en `application`/`infrastructure`) y por
   qué el package sigue siendo placeholder a propósito, con referencia a
   `fase-6-to-7-reconciliation.md` §3. Build/lint limpios.

8. AUDITORÍA ABIERTA (diseño, sin código) — Fase 6 (Developer Tools):
   con Fase 5 unificada cerrada (§3), la precondición de este ítem ya se
   cumplió. Primera ronda de diseño publicada en
   `docs/fase-6-developer-tools-map.md` — confirma que el wiring ya está
   resuelto (mismo puente de `OpenCodeExecutionEngine.handlePermissionEvents()`
   que ya intercepta cualquier categoría real de permiso) y que lo que
   falta es evidencia real (forma de `permission.asked.properties.metadata`
   para `edit`, capturable solo en una máquina con Ollama + `opencode
   serve` reales) más una decisión de diseño sobre cómo componer una
   `PolicyRule` de mutación con `AllowReadRule` bajo el modelo AND actual
   de `PolicyEvaluator` — ver ese documento §5 para el detalle. Siguiente
   paso real es 6.1 (captura de evidencia), pendiente de Santiago — ver
   8b para lo que ya se implementó mientras tanto.

   Fase 7 (Autonomous Workflows) sigue diferida sin evidencia — depende
   de que Fase 6 dé herramientas reales primero.

8b. CERRADO (código) / NO ALCANZABLE EN RUNTIME todavía — Fase 6.3:
   `AllowScopedMutationRule` (`packages/agent-core/src/rules/`) reemplaza
   a `AllowReadRule` en el composition root (`apps/cli/src/commands/agent.ts`)
   — mismo problema de composición AND + early-exit de `PolicyEvaluator`
   que impide que dos allow-lists parciales convivan (ya documentado en
   `AllowReadRule`), así que absorbe su contrato completo (`read` + Code
   Intelligence vía `additionalAllowedTools`) y agrega una segunda
   categoría real, `edit`, con su propia validación — no una allow-list
   ciega: exige que `request.input` traiga un path bajo
   `EDIT_TARGET_PATH_METADATA_KEY`, que quede dentro de
   `context.projectRootPath`, y que no esté en una deny-list real de
   `guerrero-dev` (`.env`, `.git/`, `pnpm-lock.yaml`, las 4 migraciones ya
   aplicadas — hace cumplir con código la regla ya escrita en `CLAUDE.md`
   de nunca editar una migración aplicada).

   `EDIT_TARGET_PATH_METADATA_KEY` es, a propósito, un valor centinela
   que nunca coincide con ninguna clave real (`docs/fase-6-developer-tools-map.md`
   §4/§8.3 documentó la hipótesis circunstancial "file"/"filePath" pero
   sin evidencia real de un `permission.asked` de tipo `edit` capturado
   en vivo) — mientras no se reemplace por el nombre confirmado en 6.1,
   `evaluateEdit()` deniega toda edición por fail-closed, sin excepción;
   no hay forma de que esta regla apruebe algo real por accidente.
   Registrarla en el composition root no cambia ningún comportamiento
   observable todavía: `DISABLED_TOOLS.edit` sigue en `false`, así que el
   agente `build` no puede ni intentar invocar `edit` — mismo patrón
   "CERRADO (código) / NO ALCANZABLE EN RUNTIME todavía" que
   `AllowReadRule` tuvo entre 5.13 y 6n.

   `isPathWithinRoot` (misma lógica que la de
   `infrastructure/filesystem`, Fase 5 unificada) se duplicó localmente
   en vez de importarla: `agent-core/package.json` solo depende hoy de
   `application`/`domain`/`shared`, y agregar `infrastructure` sería una
   dependencia nueva entre paquetes "hermanos" de la capa de
   implementaciones por una función pura sin I/O — mismo criterio ya
   usado dentro de `domain/` entre `code/` y `project/`
   (`CodeInvariants.isRelativeFilePath`).

   Tests: `AllowScopedMutationRule.test.ts` nuevo (20 casos — categoría
   de lectura idéntica a `AllowReadRule` más 14 casos nuevos de `edit`:
   aprobación real dentro del proyecto, path absoluto, fail-closed sin
   campo/con campo inválido, denegación con nombres de campo "razonables"
   pero no confirmados —documenta explícitamente que sigue sin ser
   alcanzable—, fuera de `projectRootPath` relativo y absoluto con mismo
   prefijo de string, las 5 rutas de la deny-list, y una migración nueva
   no listada aprobada). `PolicyEvaluator.test.ts` actualizado a la nueva
   clase. 502 tests totales en verde (antes 491), build/typecheck/lint
   limpios. Sin verificación end-to-end — no aplica todavía, nada de esto
   es alcanzable en runtime hasta 6.1 + 6.4.

8c. CERRADO (diagnóstico) / NO ALCANZABLE (hallazgo de seguridad real) — Fase
   6.1: causa raíz real de por qué `guerrero agent run` nunca disparó un
   `permission.asked` de tipo `edit`, en ~15 corridas reales contra
   `qwen2.5:7b-instruct-q4_K_M` (instrucciones explícitas, guiadas paso a
   paso, con TODAS las demás tools apagadas para forzar `edit` como única
   salida). No era el modelo — verificado con evidencia directa, sin
   asumir, en tres capas:

   **Capa 1 — evidencia estática, sin GPU** (binario real
   `node_modules/opencode-ai/bin/opencode.exe`, `opencode-ai@1.18.18`, y
   `~/.local/share/opencode/opencode.db`/`opencode.log`, ambos solo
   lectura): confirmado que `metadata.filepath` (minúscula, path
   absoluto) es la clave real de `permission.asked.properties.metadata`
   para `"edit"` — string literal `metadata:{filepath:u,diff:m}` en el
   binario, corroborado por una tool call real persistida
   (`input:{oldString,filePath:"/path/to/package.json",newString}` —
   nota: ese `filePath` de ejemplo es en sí mismo un caso de alucinación
   de ruta tipo 5.9c/6p, capturado sin querer). También confirmado que
   `write`/`apply_patch` piden permiso bajo la MISMA categoría `"edit"` —
   `apply_patch` manda `metadata.filepath` como lista unida por coma más
   `metadata.files`. `AllowScopedMutationRule` (6.3) ya se actualizó con
   esta evidencia: `EDIT_TARGET_PATH_METADATA_KEY = "filepath"` (ya no
   centinela) y una guarda explícita contra el caso `apply_patch`.

   Análisis de los mensajes reales en `opencode.db` (tabla `message`/
   `part`, `node:sqlite` de solo lectura) confirmó además el síntoma
   exacto de las corridas fallidas: mensajes con `finish:"stop"`, 27-31
   tokens de output, y **cero `part`s** (ni texto ni tool) — el modelo
   generaba algo que no se materializaba en nada visible.

   **Capa 2 — catálogo real sin invocar al modelo** (`GET
   /experimental/tool` del SDK, `client.tool.list()`, endpoint real no
   usado hasta ahora en el repo — `types.gen.d.ts:1727-1736`): contra la
   config real de `agent.ts` (`provider`+`permission`+`agent.build.tools`
   con `edit:true`), el catálogo devuelto por este endpoint SÍ incluye
   `edit` — pero se confirmó después que este endpoint no respeta el
   filtrado por agente/sesión (no toma parámetro `agent`), así que no es
   representativo del array `tools` real de una request de chat concreta.
   Sirvió para descartar la hipótesis de instancia de `opencode`
   envenenada por directorio para el catálogo base (idéntico entre
   `C:\Dev\agente\guerrero-dev` y un directorio temporal nuevo — 12 tools
   en ambos).

   **Capa 3 — la real: proxy HTTP interceptando `OLLAMA_BASE_URL`**
   (reconstruido desde cero, técnica de 5.14/6o, ningún script quedó del
   repo — ver hallazgo de housekeeping más abajo), en corridas reales de
   `guerrero agent run` con `qwen3.5:2b` (el modelo con tool-calling más
   confiable de los tres disponibles, `qwen2.5:7b-instruct-q4_K_M` y
   `qwen3:4b` completan la lista) contra el directorio real y uno
   limpio: el array `tools` real de `POST /v1/chat/completions` **nunca
   incluyó `edit`**, ni con `BUILD_AGENT_TOOLS.edit:true` en
   `Config.agent.build.tools`, ni agregando el mismo mapa también a
   `Config.tools` (raíz) — en los tres casos el array real fue
   exactamente `code-intelligence_*, glob, grep, question, read, skill,
   task, todowrite`, sin `edit`/`bash`/`write`/`webfetch`. Confirma,
   además, el mecanismo exacto del síntoma de la Capa 1: en una respuesta
   real capturada, el modelo intentó `tool_calls:[{function:{name:
   "write",...}}]` — una tool que tampoco estaba en el array ofrecido —
   y esa llamada se perdió sin dejar rastro (ni texto, ni error, ni
   evento). El modelo no es el problema: intenta usar herramientas
   razonables para la tarea, pero el wiring nunca se las ofrece, y
   OpenCode descarta en silencio cualquier tool call a algo no declarado.

   **Hallazgo de seguridad real, más importante que el original**:
   `SessionPromptData.body.tools` (campo real por-request del SDK,
   `types.gen.d.ts:2254-2256`, nunca usado por
   `OpenCodeExecutionEngine.execute()`) SÍ logra que `edit` aparezca en
   el array real — probado, confirmado en el proxy. Pero usarlo abre un
   agujero real: con `body.tools:{edit:true,...}` agregado a
   `session.prompt()`, un `edit` real se ejecutó de punta a punta
   (archivo real modificado, confirmado con `git diff` en el checkout
   principal y revertido de inmediato) en ~50ms, con el `part` pasando
   `pending → running → completed` sin ninguna pausa — verificado en
   `opencode.db` (tabla `event`) que **jamás se emitió un
   `permission.asked`/`asking`** para ese `edit`, pese a
   `PERMISSION.edit: "ask"` estar configurado. `IPolicyEngine` nunca lo
   vio — exactamente el agujero que 5.5b/5.9b/6g cerraron, reabierto por
   una vía distinta. La tabla `permission` de `opencode.db` está vacía
   (no es una aprobación "recordada" persistida) — la causa exacta por la
   que `body.tools` bypassea el subsistema de permisos no se investigó
   más a fondo (binario compilado, sin sourcemaps) — se documenta como
   hallazgo real y bloqueante, no se adivina la causa interna.

   **Decisión, verificada, no en silencio**: `body.tools` NO se usa en
   `OpenCodeExecutionEngine.execute()` — revertido explícitamente después
   de confirmar el bypass. `BUILD_AGENT_TOOLS.edit: true` queda como
   intención documentada (Fase 6.1 en el JSDoc de `agent.ts`), sabiendo
   que hoy es inerte por esta vía — no hay mecanismo confirmado que
   agregue `edit` al catálogo real sin pasar por `body.tools`. El logger
   temporal `[Fase 6.1]` de `OpenCodeExecutionEngine.ts` se removió — ya
   cumplió su propósito (confirmar la forma de `metadata`, capa 1).

   **Siguiente paso real, no autorizado en este incremento**: encontrar
   el mecanismo real (si existe) que agregue `edit` al catálogo de
   `Config.agent.build.tools` respetando `Config.permission` — candidatos
   sin probar: `Config.experimental.primary_tools` (campo real del SDK,
   "tools that should only be available to primary agents",
   `types.gen.d.ts:1210-1212`, sin explorar), o que el catálogo de la
   sesión "build" en modo servidor headless (sin TUI) simplemente no
   incluya `edit`/`bash`/`write`/`webfetch` por diseño de OpenCode y haga
   falta otro mecanismo todavía no identificado. Requiere su propia
   auditoría — no se adivina ni se prueba a ciegas con más GPU real sin
   antes entender por qué `body.tools` bypassea permisos.

   **Housekeeping real, verificado**: ninguna técnica de diagnóstico
   previa (proxy HTTP de 5.14/6o/5.4c, test directo contra `POST
   /api/chat` de Fase 5.9) quedó como script en el repo — ambas se
   reconstruyeron desde cero para esta auditoría (`grep`/`git log`
   exhaustivo, cero resultados). Los scripts de esta sesión (proxy,
   inventario de tools, forense sobre `opencode.db`) fueron descartables,
   no se comitearon — candidatos a `scripts/` en una sesión futura si se
   reutilizan de nuevo, no antes.

8d. DESCARTADOS (verificado, no supuesto) — dos candidatos del "siguiente
   paso" de 8c, investigados en la misma sesión de cierre:

   - **`Config.experimental.primary_tools`**: confirmado contra el string
     literal real del binario (`opencode.exe`) que su efecto es
     `.map((Y)=>({permission:Y,pattern:"*",action:"deny"}))` — inyecta
     una regla de **deny** para **subagentes** (`agent: c.name` en el
     contexto real del match, construcción de sesión de subagente vía
     `task`). Es un mecanismo restrictivo para acotar qué tools puede
     usar un subagente respecto del agente primario, no un mecanismo
     aditivo para que el agente `build` (primario) gane tools nuevas.
     Sin relación con el problema real.
   - **`agent: "build"` explícito en `body` de `session.prompt()`**
     (sin `body.tools`): probado real vía proxy contra un directorio
     descartable (no el repo — lección de 8c aplicada) — el array
     `tools` real siguió siendo exactamente el mismo catálogo
     restringido (`code-intelligence_*, glob, grep, question, read,
     skill, task, todowrite`, sin `edit`). El agente ya se resolvía
     como `"build"` por default (confirmado en `opencode.db`, campo
     `agent` de los mensajes reales) — pasarlo explícito no cambia nada.

   Con esto, la hipótesis que queda en pie (sin probar todavía, señalada
   en 8c) es que el catálogo del agente `build` en modo servidor headless
   simplemente no incluye `edit`/`bash`/`write`/`webfetch` por diseño de
   OpenCode — y el único mecanismo que los agrega (`body.tools`) es
   además el que bypassea `Config.permission`.

8e. CERRADO (causa raíz confirmada río arriba) — se hizo lo que 8d dejaba
   como "siguiente paso": se inspeccionó el código fuente real de
   OpenCode (`github.com/anomalyco/opencode` — mismo repo que
   `sst/opencode`, la organización renombró el repo; confirmado que
   ambas URLs resuelven al mismo `full_name`, no son proyectos
   distintos), tag `v1.18.18` exacto (coincide con la versión instalada,
   `opencode-ai@1.18.18`), más el propio issue tracker del proyecto.

   Trazado completo del pipeline real (`packages/opencode/src/tool/registry.ts`,
   `packages/opencode/src/session/tools.ts`, `packages/opencode/src/agent/agent.ts`,
   `packages/opencode/src/config/agent.ts`, `packages/core/src/agent.ts`,
   `packages/openai-compatible/src/chat/openai-compatible-prepare-tools.ts`
   del paquete real `@ai-sdk/openai-compatible` que usamos como provider):
   en NINGUNA de estas capas se consume `Config.agent.build.tools` (ni el
   campo `tools` de la config de un agente en general) para decidir el
   catálogo — el array `builtin` de `ToolRegistry` incluye `edit`/`write`/
   `bash`(`shell`)/`webfetch`(`fetch`) **incondicionalmente** para
   cualquier modelo no-GPT, y `SessionTools.resolve()` agrega TODO lo que
   la registry devuelve sin filtrar por agente. Confirmado además contra
   el binario real (`opencode.exe`): el patrón `agent.tools` no aparece
   en ningún lado — consistente con que el código fuente no lo consume.
   Se probaron y descartaron, todos con evidencia real (0 GPU cuando fue
   posible): `/experimental/tool` con y sin `Config.mcp` registrado (sin
   diferencia, y de todos modos ese endpoint no refleja el catálogo real
   de un request de chat), y una sesión real sin `Config.mcp` vía proxy
   contra un directorio descartable (mismo catálogo restringido, sin
   `edit`).

   **La respuesta real estaba en el propio issue tracker de OpenCode,
   no en su código**: [issue #17607](https://github.com/anomalyco/opencode/issues/17607)
   ("Granular per-agent tool permissions") confirma, en palabras del
   propio autor del issue, el estado real y actual del proyecto: el
   `permission` por-agente **solo soporta categorías gruesas** (`allow`/
   `ask`/`deny` para `read`/`edit`/`bash`/`mcp`) — controla si una tool
   YA OFRECIDA se aprueba, no si se ofrece. El único mecanismo real para
   controlar el catálogo (agregar/quitar tools individuales) es
   exactamente el que encontramos empíricamente: **`body.tools` en el
   mensaje de la API — descrito ahí mismo como "workaround que depende de
   un campo `tools` deprecado que podría eliminarse"**. No hay
   respuesta de mantenedores en el issue — sigue abierto, sin
   implementar.

   **Conclusión definitiva, no adivinada**: no existe hoy, en
   `opencode-ai@1.18.18`, ningún mecanismo soportado y documentado para
   agregar `edit` al catálogo de un agente headless respetando
   `Config.permission` — es una limitación real y conocida del propio
   OpenCode (el feature que la resolvería está pedido, no implementado),
   no un error de configuración de este repo. `Config.agent.build.tools`
   (`BUILD_AGENT_TOOLS` en `agent.ts`) queda confirmado como
   efectivamente sin efecto en el catálogo con esta versión — la
   intención documentada en su JSDoc (Fase 6.1) sigue siendo válida como
   registro de qué se INTENTÓ, no como algo que hoy decida nada.

   **Camino real hacia adelante, ninguno autorizado en este incremento**:
   (a) esperar a que OpenCode implemente #17607 y reevaluar quedaría
   desbloqueado sin cambios de nuestro lado — la `PolicyRule` ya está
   lista (Fase 6.3); (b) comentar/reaccionar en el issue real para
   señalar el hallazgo de seguridad de `body.tools` (acción visible
   hacia afuera del repo — no se hizo sin pedir permiso explícito); (c)
   si hiciera falta antes de que OpenCode lo resuelva, construir un
   mecanismo de permisos propio que NO dependa del catálogo de OpenCode
   — por ejemplo, interceptar tool calls a nivel de nuestro propio
   `IPolicyEngine` antes de que lleguen a `session.prompt()`, lo cual
   exigiría no delegar la ejecución completa a OpenCode para esta
   categoría de tools — cambio de arquitectura significativo, contrario
   al espíritu de ADR 0002 (no reinventar lo que el motor ya resuelve)
   salvo que se confirme que no hay alternativa. Ninguna de las tres se
   implementa en este incremento.

8f. **SUPERA A 8e — se encontró el mecanismo real, existe hoy.** El
   camino (a) de 8e ("esperar a OpenCode") resultó innecesario: mientras
   se investigaba el código fuente de `anomalyco/opencode` para 8e, se
   encontró en el propio issue tracker (no en el código) que
   `Config.agent.*.tools` (el campo booleano usado desde Fase 6.1, este
   archivo, `BUILD_AGENT_TOOLS`) está **deprecado** — fusionado en
   `Config.agent.*.permission` (mismo shape string que `Config.permission`
   raíz, ya usado en este archivo desde Fase 5.9b). La migración
   automática de `tools` → `permission` tiene bugs reales documentados
   río arriba (`anomalyco/opencode` issues #6892, #7810, #16028) — eso
   explica por qué `tools.edit: true` nunca tuvo efecto real: no es que
   no existiera un mecanismo, es que se estaba usando el mecanismo
   equivocado (deprecado y roto), no el vigente.

   Confirmado en el código fuente real (`session/tools.ts`,
   `github.com/anomalyco/opencode`, tag `v1.18.18`): `ctx.ask()` arma su
   `ruleset` con `Permission.merge(input.agent.permission,
   input.session.permission ?? [])` — `agent.permission` es el campo real
   que alimenta tanto qué se ofrece como qué se aprueba. Distinto de
   `body.tools` (Fase 6.1/8c), que no pasa por acá.

   **Verificado real, con evidencia directa, no solo confiando en el
   código fuente ajeno**: con `agent.build.permission = {edit:"ask",
   bash:"deny", write:"deny", webfetch:"deny", websearch:"deny",
   apply_patch:"deny"}`, capturado con proxy HTTP real sobre
   `OLLAMA_BASE_URL`: el array `tools` real incluyó `edit`, y
   `bash`/`webfetch`/`apply_patch` desaparecieron correctamente (a
   diferencia de `tools.edit:true`, que nunca lo logró). Sustituyendo
   `edit:"ask"` por `read:"ask"` en el mismo mecanismo (mismo campo,
   mismo código — `read` es un tool que el modelo SÍ invoca de forma
   confiable, a diferencia de `edit`) se capturó un evento
   `permission.asked` real y completo — confirma que este campo pasa por
   el sistema de permisos real, sin el bypass que tenía `body.tools`.

   **Honestidad de alcance**: no se logró un `permission.asked` real
   específicamente para `"edit"` en esta sesión — 4 intentos reales
   contra el CLI real (`guerrero agent run`, timeout de 120s cada uno,
   `qwen3.5:2b`), ninguno llegó siquiera a pedir un permiso (el log real
   de `opencode` no muestra ningún `asking` en esas corridas) — el modelo
   se quedó "pensando" (`reasoning`) sin resolver dentro de la ventana,
   mismo tipo de lentitud/no-determinismo ya documentado repetidas veces
   con este modelo en este mismo archivo (6f/6h/6m/6p). La confirmación
   de que el mecanismo funciona es por sustitución (`read`, mismo código),
   no por observación directa de `edit`. **Pendiente real**: que Santiago
   confirme con más paciencia (o corriendo `agent run` en un momento sin
   contención de VRAM) que un intento real de `edit` dispara
   `permission.asked` y que `AllowScopedMutationRule.evaluateEdit()` lo
   evalúa correctamente contra un `request.input.filepath` real.

   `BUILD_AGENT_TOOLS` (deprecado, confirmado sin efecto) se reemplazó
   por `BUILD_AGENT_PERMISSION` (`apps/cli/src/commands/agent.ts`) —
   `edit: "ask"`, el resto `"deny"`. Anomalía real sin explicar,
   documentada no oculta: `write` siguió apareciendo en el catálogo real
   pese a `"deny"` (a diferencia de `bash`/`webfetch`/`apply_patch`/
   `websearch`, que sí desaparecieron) — posible bug de mapeo de nombres
   similar al de `apply_patch`/`patch` (#16028), sin confirmar. Red de
   seguridad real e independiente: `AllowScopedMutationRule.evaluate()`
   deniega por defecto cualquier tool que no sea `read`/Code
   Intelligence/`edit` — si `write` llega a pedirse, se deniega igual.

   506 tests en verde, build/typecheck/lint limpios. Sin cambios en
   `AllowScopedMutationRule` (no hacía falta — ya estaba lista desde
   6.3, esperando exactamente esto).

9. EVOLUTIVO, sin evidencia todavía — Fase 8 (Personal Engineering
   Profile), Fase 9 (Continuous Learning), MemoryEmbedding
   autogenerado en promoción (gap operacional ya documentado en cierre
   de Fase 2/4), ConflictDetector real. Se listan para no perderlos, no
   para programarlos.
```
