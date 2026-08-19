# Fase 7 — Cline/OpenCode Integration ("Fase 5" en `docs/roadmap-maestro.md`)

## Estado: CLOSED (sustancialmente) — 6p diferido con evidencia, no bloqueante

Cierre formal del incremento que `docs/fase-3-foundation.md` ("Siguiente
paso") anticipaba como "Fase 7: Cline/OpenCode Integration" y que
`docs/roadmap-maestro.md` retoma como la "Fase 5" de su numeración
unificada ("Agent Core real, LLM conectado"). Mismo criterio de rigor
que `docs/fase-4-memory-engine-closure.md`/`docs/fase-6-code-intelligence-closure.md`:
este documento captura el estado final verificado en este mismo turno
contra infraestructura real (Postgres, Ollama, `opencode serve`,
`guerrero-dev` real) — no reconstruido de memoria de checkpoints
anteriores. Nombrado con la numeración real del repo (`fase-7-...`),
no con la numeración unificada del roadmap, siguiendo la convención ya
establecida por `fase-4`/`fase-5`/`fase-6` — ver la tabla de
correspondencia en `docs/roadmap-maestro.md` §5.

## 1. Objetivo de la fase

`docs/fase-6-to-7-reconciliation.md` §2 lo dejó explícito antes de
empezar: sin un LLM real conectado al plan que ejecuta el agente,
ninguna de las capacidades de Intelligence ya construidas (Memory,
Project Intelligence, Code Intelligence) puede influir en una respuesta
real. El objetivo era, y sigue siendo, cerrar esa deuda: `AgentOrchestrator.run()`
consumiendo `BuiltContext` de verdad, `PolicyEngine` decidiendo algo
real en el camino de ejecución, y una integración real con un motor de
ejecución (OpenCode, ADR 0003) que efectivamente corra las tasks.

## 2. Alcance aprobado

`docs/fase-6-to-7-reconciliation.md` §4 clasificó el trabajo en
necesario/componible/evolutivo; `docs/roadmap-maestro.md` §3 lo
subdividió en incrementos (5.1-5.5). La ejecución real no siguió ese
orden estricto — avanzó incremento por incremento según lo que cada
verificación real encontraba, documentado íntegramente en
`docs/roadmap-maestro.md` §7 (entradas 6b-6r). Este documento consolida
ese log, no lo reemplaza.

## 3. Arquitectura final

```text
                    guerrero agent run <projectId> <instruction>
                                     │
                    apps/cli/src/commands/agent.ts (composition root)
                                     │
        ┌────────────────────────────┼─────────────────────────────┐
        ▼                            ▼                              ▼
ContextBuilder (5.2/5.4a/5.8)  PolicyEvaluator (5.3/6n)      OpenCodeExecutionEngine (5.5)
  IProjectIntelligenceProvider   AllowReadRule("read" +          session.create/prompt real
  IMemoryRetriever                4 tools Code Intelligence)     handlePermissionEvents()
        │                            ▲                              │
        ▼                            │ evaluate(ToolRequest)        ▼
  systemPrompt real         permission.asked real ◄──────  opencode serve real
  (Memory + Project                                        Config.provider (Ollama,
   Intelligence, 5.14)                                       OpenAI-compatible)
        │                                                   Config.mcp (5.4c) ──────┐
        └──────────────► AgentOrchestrator.run() ───────────────────────────────────┤
                          (contextBuilder.build() → executionEngine.execute(         │
                           {...options, systemPrompt}))                             │
                                                                                      ▼
                                                              @guerrero-dev/mcp (5.4c)
                                                              CodeIntelligenceMcpServer
                                                              (envuelve CodeIntelligenceToolHandler,
                                                               5.4b, application) — repoRoot
                                                              por env var, no argumento del LLM
```

`ToolSelector`/`ExecutionPlanStep.toolRequest` (skeleton de Fase 3)
quedan confirmados muertos con el motor OpenCode (6n) — el camino real
de política pasa por el bridge de eventos de permisos de
`OpenCodeExecutionEngine`, no por ese loop de dominio. `ILLMProvider`/
`OllamaProvider` siguen existiendo como puerto + adapter real, sin
consumidor en el camino de `agent run` desde 5.14 (el único LLM que
corre la task es el que invoca OpenCode directamente vía
`Config.provider`).

## 4. Estado por subfase

| Subfase | Estado | Evidencia |
|---|---|---|
| 5.1 — LLM local conectado (Ollama) | ✅ CLOSED | `OllamaProvider` endurecido (commit `9c24d9d`), modelo confirmado con evidencia real (`qwen2.5:7b-instruct-q4_K_M`, único con tool-calling estructurado confiable — 5.9/6f) |
| 5.2 — `BuiltContext` consumido por `run()` | ✅ CLOSED | Cerrado en 5.14 (`01a273e`, entrada 6o) — antes se construía y se descartaba |
| 5.3 — `PolicyEngine` cableado dentro de `run()` | 🟡 PARCIAL, por diseño | El loop interno de dominio sigue muerto (6n); la política real pasa por el bridge de eventos de OpenCode (5.5b/6b, 5.9b/6g, 5.9d/6i) — mecanismo distinto al planeado, pero real desde 6n/6r |
| 5.4a — Memory expuesta a `ContextBuilder` | ✅ CLOSED | `IMemoryRetriever` real (`86e3c3a`), ver `ContextBuilder.ts` |
| 5.4b — Code Intelligence, consumidor de aplicación | ✅ CLOSED | `CodeIntelligenceToolHandler` (`5ad3370`), 4 tools reales sobre `ICodeAnalyzer`/`ICodeLiteralSearch` (Fase 6) |
| 5.4c — Code Intelligence, consumidor real (MCP) | ✅ CLOSED | `@guerrero-dev/mcp` real (`4a01114`, entrada 6q) — primer servidor MCP del repo, verificado con proxy HTTP real que los 4 tools llegan a Ollama |
| 5.5 — Integración Cline/OpenCode real | ✅ CLOSED (sustancialmente) | `OpenCodeExecutionEngine` real (5.5-5.14, `122fcdb`…`01a273e`) + 5.4c + 6n. Único punto abierto: 6p (ver §9) |
| 6n — Vocabulario canónico de `toolName` | ✅ CLOSED | `AllowReadRule` real y alcanzable en runtime por primera vez (`ab88f47`), `Config.permission` corregido contra el schema real del binario |

## 5. Pipeline completo — verificado real, no solo por tipos

Cada flecha de este pipeline fue verificada contra infraestructura real
en algún punto de la fase — no se asumió de la documentación de
`@opencode-ai/sdk` en ningún paso crítico, después de que 5.9d
demostrara que esos tipos pueden estar desincronizados del binario:

```text
1. ContextBuilder.build(task)                    → systemPrompt real (Memory + Project Intelligence)
2. AgentOrchestrator.run()                        → execute({...options, systemPrompt})
3. OpenCodeExecutionEngine.execute()              → session.prompt({system, model, parts})
4. opencode serve real                            → POST /v1/chat/completions a Ollama
                                                     (verificado con proxy HTTP real, 5.14/6o)
5. Ollama responde tool call                      → OpenCode evalúa permission=<toolName>
6. Sin Config.permission explícito                → action.action=allow, IPolicyEngine NUNCA se llama
   (hallazgo real, 5.9b y 6n: webfetch primero, luego los 4 tools de MCP)
7. Con Config.permission: {<toolName>: "ask"}     → permission.asked real (verificado en vivo, 6n)
8. handlePermissionEvents() intercepta el evento  → construye ToolRequest, llama IPolicyEngine.evaluate()
9. AllowReadRule aprueba/deniega                  → POST /session/{id}/permissions/{id} (once/reject)
10. Tool ejecuta (o se deniega, fail-closed)       → respuesta real del modelo
```

## 6. Evidencia de verificación end-to-end de esta fase

No exhaustivo — selección de las verificaciones que requirieron
infraestructura real, no solo tipos o tests unitarios con dobles:

```text
5.6  — guerrero agent run conecta a Postgres real, encuentra el proyecto
        real, levanta un servidor opencode real
5.7  — Provider Ollama custom registrado, sin cuenta cloud, verificado
        contra el binario real
5.9d — Dos suscripciones SSE paralelas a un opencode serve real +
        inspección de GET /doc en vivo: permission.updated (tipo del SDK)
        nunca ocurre; el binario real emite permission.asked
5.14 — Proxy HTTP real interceptando OLLAMA_BASE_URL: el systemPrompt
        real llega verbatim al POST /v1/chat/completions real
5.4c — Mismo método de proxy: los 4 tools de Code Intelligence llegan
        al array `tools` real que OpenCode le manda al modelo, prefijados
        code-intelligence_{toolName} — hallazgo adicional real: opencode
        serve mantiene una "instancia" por directorio persistida en
        opencode.db, y un primer intento roto la deja envenenada
        (ver §10)
6n   — GET /doc real: Config.permission acepta cualquier nombre de tool
        (additionalProperties), no solo los 5 declarados en los tipos del
        SDK. Forzar permission:{read:"ask"} y permission:
        {code-intelligence_find_symbols_by_name:"ask"} produce
        permission.asked real en ambos casos
6r   — guerrero agent run real, contra Postgres + Ollama + opencode serve
        reales, proyecto guerrero-dev real: "Leé el package.json de la
        raíz" → Estado: succeeded, contenido real, sin alucinación de
        rutas; "Busca el símbolo AgentOrchestrator" → tool call real de
        Code Intelligence, permiso pedido/evaluado/aprobado por
        AllowReadRule, respuesta correcta con la ubicación real
```

## 7. Invariantes y garantías

- **Fail-closed real**: sin `PolicyRule`s registradas, `PolicyEvaluator`
  deniega todo (6c). Con `AllowReadRule` (6n), solo `"read"` y los 4
  tools de Code Intelligence quedan aprobados — todo lo demás que pase
  por el bridge de permisos (`edit`, `bash`, `webfetch`) sigue denegado.
- **`repoRoot` nunca es un argumento que el LLM tenga que completar**
  para los tools de Code Intelligence — viaja por variable de entorno al
  spawnear el servidor MCP (5.4c), decisión motivada directamente por la
  alucinación de rutas de 6p. Los tools nativos de OpenCode (`read`,
  etc.) no tienen este mismo control — siguen expuestos a 6p.
- **El contexto real (Memory + Project Intelligence) llega al modelo
  que corre la task** — no a una inferencia paralela descartada (5.14).
- **`session.prompt()` nunca cuelga indefinidamente** — `timeoutMs`
  real como red de seguridad (5.9c) más el fix de causa raíz del
  deadlock (5.9d).
- **Un turno sin texto y sin `AssistantMessage.error` se reporta como
  `failed`, no como `succeeded` engañoso** (5.9e).

## 8. Verificación real — gate completo (este cierre)

```text
Build:      ✅ 11/12 workspace packages, sin errores (apps/web excluido
               del workspace desde Fase 3, fuera de alcance)
Typecheck:  ✅ limpio en todos los paquetes + tests/tsconfig.json
Lint:       ✅ eslint . sin salida
Unitarios:  ✅ 491 passed / 89 skipped / 0 failed (suite por defecto)
Integración: ✅ tests/integration/code-intelligence-mcp-server.test.ts,
               RUN_INTEGRATION_TESTS=true — spawnea el binario real,
               dogfooding contra guerrero-dev
E2E manual:  ✅ guerrero agent run real (§6, entrada 6r) — 2/2 corridas
               reales exitosas contra Postgres+Ollama+opencode reales
```

## 9. Diferido — 6p, con condición de reapertura explícita

**No se cierra en este documento.** `qwen2.5:7b-instruct-q4_K_M`
alucinó rutas absolutas reales en tool calls de `read`
(`C:\path\to\your\project\...`, 2/2 reproducido en 6o/6p) —
`external_directory` lo denegó correctamente (fail-closed funcionando
como diseño, no un agujero de seguridad). Decisión explícita en 6r: no
perseguir la causa raíz ahora, por dos motivos reales, no por default —

1. No hay un modelo más grande disponible en este entorno para probar
   la hipótesis "es la cuantización 7B" (`ollama list`:
   `qwen2.5:7b-instruct-q4_K_M`, `qwen3.5:2b`, un modelo de embeddings —
   nada más grande).
2. El mismo prompt de regresión corrió 2/2 sin alucinar en la
   verificación real de 6r — no prueba que esté arreglado (no se tocó
   nada de cómo el modelo arma argumentos de tool calls), pero significa
   que no hay evidencia nueva para actuar ahora.

**Condición de reapertura**: una repro clara y reproducible, o
disponibilidad de un modelo más grande para comparar. No se agenda por
inercia.

## 10. Gaps operacionales conocidos

- **`opencode serve` (1.18.18) cachea una "instancia" por directorio de
  trabajo** en `~/.local/share/opencode/opencode.db`. Un primer intento
  de bootstrap roto contra un directorio (encontrado en 5.4c probando
  `Config.mcp` + `Config.provider` juntos) deja esa instancia envenenada
  — reintentos posteriores, incluso con config corregida, siguen
  fallando (`Unexpected error / ServeError`, silencioso, no fatal) hasta
  usar un directorio nuevo. Causa raíz exacta sin confirmar. Si
  `guerrero agent run` falla así contra un directorio que antes
  funcionaba, este archivo es sospechoso número uno.
- **Tipos de `@opencode-ai/sdk@1.18.18` desincronizados del binario real
  en más de un punto**, no solo el evento de permisos de 5.9d:
  `Config.permission` (root) declara solo 5 categorías fijas; el
  `GET /doc` real acepta cualquier nombre de tool (`additionalProperties`,
  hallazgo de 6n). Cualquier trabajo futuro contra este SDK debería
  preferir verificar contra `GET /doc` en vivo antes de asumir los tipos
  completos.
- **No existe ninguna ruta `/agent` ni `/chat` en `apps/api`** —
  `guerrero agent run` es CLI-only. Sigue sin tocarse, fuera de alcance
  de esta fase.
- **`AgentSession` no se persiste** — cada corrida de `agent run` es
  efímera (`sessionId` es un UUID nuevo por invocación, sin historial
  real entre turnos).
- **`MemoryEmbedding` sigue sin generarse automáticamente en la
  promoción** (gap operacional de Fase 4, reconfirmado vigente — no
  tocado en esta fase, condición de reapertura de Fase 4 no cumplida
  todavía).
- **`external_directory` no se fuerza explícitamente en `Config.permission`**
  — 5.9c documenta que se pide igual sin forzarlo (a diferencia de
  `webfetch`); no hay evidencia de que necesite el mismo tratamiento que
  `read`/Code Intelligence.

## 11. Criterio de cierre

```text
☑ LLM real conectado, con evidencia de qué modelo funciona y por qué
☑ BuiltContext (Memory + Project Intelligence) llega al modelo que
  corre la task — verificado con proxy HTTP real
☑ PolicyEngine decide algo real en el camino de ejecución real —
  verificado con permission.asked real, en vivo
☑ Integración con un motor de ejecución real (OpenCode) — sesiones,
  prompts, permisos, subagentes, todo verificado contra el binario real
☑ Al menos un consumidor real de Code Intelligence, alcanzable en
  runtime — servidor MCP real, verificado con proxy HTTP real
☑ guerrero agent run funciona end-to-end contra infraestructura 100%
  real (Postgres + Ollama + opencode), reproducido
☑ Build + typecheck + lint + tests unitarios + al menos un test de
  integración real
☑ Documento de cierre
☐ 6p resuelto — diferido explícitamente (§9), no bloquea el resto
```

## 12. Checkpoint Git

| Commit | Contenido |
|---|---|
| `9c24d9d` | Fase 5.1 — `OllamaProvider` endurecido |
| `3db584a` | Fase 5.2 — `AgentOrchestrator` consume `BuiltContext` |
| `17bd29a` | Fase 5.3 — `PolicyEngine` cableado por-paso |
| `86e3c3a` | Fase 5.4a — Memory expuesta a `ContextBuilder` |
| `5ad3370` | Fase 5.4b — `CodeIntelligenceToolHandler` |
| `122fcdb` | Fase 5.5 — `OpenCodeExecutionEngine` real |
| `25ff014` | Fase 5.5b — bridge de permisos real |
| `54ce787` | Fase 5.6 — primer composition root real |
| `5ee24ec` / `2364976` | Fase 5.7 / 5.7b — provider Ollama custom, fix de hang |
| `8da755b` | Fase 5.8 — flag `--model` |
| `017f9d7`…`99cbe5c` | Fase 5.9-5.9e — tool-calling, brecha de permisos, deadlock, causa raíz, texto vacío |
| `344aaf1`…`d8c6973` | Fase 5.10-5.13 — tools deshabilitadas, subagentes, `maxSteps`, `AllowReadRule` (código) |
| `01a273e` | Fase 5.14 — contexto real conectado |
| `4a01114` | Fase 5.4c — servidor MCP real |
| `8f23144` | Housekeeping — comentario de `project-intelligence` |
| `ab88f47` | Fase 6n — `AllowReadRule` real en runtime |
| `8ff7ec9` | Decisión sobre 6p (diferido) |
| (este commit) | Este documento de cierre |

## 13. Frontera hacia Fase 6 (Developer Tools, real: Fase 8)

`docs/roadmap-maestro.md` §3 ya lo señala: el gap de vocabulario que
bloqueaba a `PolicyRule` está resuelto (6n), así que lo que falta para
que Fase 6/Developer Tools tenga sentido ya no es un problema de
wiring — es que no existe todavía ninguna `PolicyRule` real que apruebe
`edit`/`bash` (correctamente: sin capacidades reales de edición/
ejecución construidas, no hay nada legítimo que aprobar ahí). Auditar
Fase 6 es el siguiente paso real cuando haya evidencia concreta de que
hace falta — no se abre por inercia de fase, mismo criterio aplicado en
toda esta fase y en 4.x-6.x.
