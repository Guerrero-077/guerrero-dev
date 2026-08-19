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
Fase 5 — Agent Core real (LLM conectado)    ⛔ SIGUIENTE PASO REAL
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

**Estado: ⛔ Siguiente paso real — no iniciada.** Corresponde a "Fase
7: Cline/OpenCode Integration" del repo real, acotada aquí en
incrementos honestos sobre lo que hace falta primero. Hallazgo central
(verificado directamente en `AgentOrchestrator.ts:35-47`):
`AgentOrchestrator.run()` construye `BuiltContext` vía `ContextBuilder`
y lo descarta sin usarlo; nunca invoca `ILLMProvider.generate()` (que sí
tiene una implementación real, `OllamaProvider.ts`); `PolicyEngine` se
inyecta por constructor pero no se llama dentro de `run()`; no existe
ninguna ruta `/agent` ni `/chat` en `apps/api`.

Subfases propuestas (a auditar formalmente antes de implementar,
mismo ritual que 4.x-6.x):

```text
5.1  LLM local conectado (Ollama + modelo ~7B — ver §4, hardware)
5.2  BuiltContext consumido de verdad por AgentOrchestrator.run()
5.3  PolicyEngine cableado dentro de run() (fail-closed ya implementado,
     falta invocarlo)
5.4  Memory (Fase 2) + Code Intelligence (Fase 4) expuestos al agente
     como fuentes de contexto — componible: ambos ya existen y
     funcionan, falta únicamente el consumidor
5.5  Integración Cline/OpenCode real (alcance original completo de la
     "Fase 7" versionada)
```

### Fase 6 — Developer Tools

**Estado: ⛔ No iniciada.** Git tools, edición de archivos, ejecución de
terminal — bajo permisos explícitos. `PolicyEngine` ya existe desde
Fase 1 (fail-closed real, `PolicyEvaluator.ts`), solo falta que Fase 5
lo conecte al loop real antes de que Fase 6 tenga sentido. Distinto de
Code Intelligence (Fase 4): esa responde "¿qué existe y qué significa?",
esto responde "haz X sobre el sistema" — no deben mezclarse.

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
| Fase 5 | Fase 7 — Cline/OpenCode Integration | (nuevo, a auditar) |
| Fase 6-9 | (no existían en el roadmap versionado real) | (nuevos, a auditar cuando corresponda) |

Los documentos de cierre existentes (Fase 3/4/5/6 reales) no se tocan,
no se renombran, no se mueven — siguen siendo la fuente de evidencia
detallada. Este documento es el índice/reconciliación que los conecta
con la visión original y con lo que falta.

## 6. Qué NO define este documento

- No autoriza ninguna implementación de Fase 5 en adelante — el
  siguiente paso real es abrir la auditoría formal de 5.1 (LLM
  conectado), con el mismo ritual usado en 4.x-6.x: audit → decisiones
  → propuesta formal → aprobación → implementación → verificación real
  → commit → checkpoint, en una conversación separada.
- No congela un modelo LLM específico — da la clase de modelo
  recomendada y por qué, no el nombre exacto.
- No renombra ni reescribe ningún documento de cierre existente.
- No trata Fase 6-9 como diseñadas — son marcadores de posición en la
  secuencia, cada una necesita su propia auditoría cuando le toque el
  turno, exactamente como cada subfase de 4.x-6.x la tuvo.

## 7. Backlog priorizado — qué falta por revisar y por hacer

Orden por dependencia real, verificado contra el código de esta sesión
— no por preferencia. "Por revisar" significa auditoría formal (mismo
ritual de 4.x-6.x: audit → decisiones → propuesta → aprobación) antes
de escribir código; ningún ítem de esta lista está autorizado para
implementación todavía, solo ordenado para cuando se retome.

```text
1. AUDITAR — Fase 5.1: LLM local conectado (Ollama + modelo 7B-class)
   Bloquea todo lo demás: sin esto, nada de lo ya construido influye
   una respuesta real (§3, fase-6-to-7-reconciliation.md §2).

2. AUDITAR — Fase 5.2: BuiltContext consumido por AgentOrchestrator.run()
   Hoy se descarta (AgentOrchestrator.ts:36) — depende de 5.1 (no hay
   nada que "consumir hacia" sin LLM conectado).

3. AUDITAR — Fase 5.3: PolicyEngine cableado dentro de run()
   Ya existe real (PolicyEvaluator, fail-closed) — falta invocarlo.
   Puede auditarse junto con 5.2 (mismo método) o por separado —
   decisión de la propia auditoría.

4. AUDITAR — Fase 5.4a: Memory expuesta a ContextBuilder
   Componible: DrizzleMemoryCandidateRetriever ya funciona con pgvector
   real, falta exponerlo como segundo provider de contexto (mismo
   patrón que IProjectIntelligenceProvider).

5. AUDITAR — Fase 5.4b: Code Intelligence expuesta al agente
   Componible: ICodeAnalyzer/queries ya reales (6.1-6.5) — falta un
   consumidor (tool o segundo provider de contexto).

6. AUDITAR — Fase 5.5: Integración Cline/OpenCode real
   Alcance original completo de "Fase 7" versionada — depende de que
   5.1-5.4 ya den un loop real funcionando primero.

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

7. HOUSEKEEPING (no bloqueante, cuando convenga) — corregir el
   comentario desactualizado de packages/project-intelligence/src/index.ts
   (dice "implementación real llega en Fase 5-6"; la implementación
   real llegó a domain/project + domain/code en su lugar). Señalado ya
   en el mapa de Fase 6 §9a y en fase-6-to-7-reconciliation.md §3 — se
   agrupa aquí para no perderlo, sin bloquear nada.

8. DIFERIDO, sin evidencia todavía — Fase 6 (Developer Tools), Fase 7
   (Autonomous Workflows): no se auditan hasta que 5.1-5.5 den un loop
   real que las necesite.

9. EVOLUTIVO, sin evidencia todavía — Fase 8 (Personal Engineering
   Profile), Fase 9 (Continuous Learning), MemoryEmbedding
   autogenerado en promoción (gap operacional ya documentado en cierre
   de Fase 2/4), ConflictDetector real. Se listan para no perderlos, no
   para programarlos.
```
