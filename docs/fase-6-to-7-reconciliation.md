# Reconciliación de roadmap — Fase 4-6 CLOSED, siguiente cuello de botella real

## Estado: informativo (no autoriza implementación)

Documento de gobernanza/auditoría, mismo registro que
`docs/fase-a-auditoria.md` — no es un mapa de subfase ni un cierre.
Reconcilia el roadmap real del proyecto contra el estado real del
código tras el cierre de Fase 6.x, y determina cuál es el siguiente
cuello de botella real antes de abrir cualquier diseño nuevo. No
autoriza ningún commit de código; el siguiente paso (auditoría formal
de Fase 7) se abre en una conversación separada, no aquí.

## 1. Origen de este documento

Durante la conversación de cierre de Fase 6, se presentó un "roadmap de
8 fases" (Agent Core / Memory System / Project Intelligence / Code
Intelligence / Personal Engineering Profile / Developer Tools /
Controlled Coding Agent / Continuous Learning) como si fuera el
"roadmap conceptual original" del proyecto. **No lo es.** Verificado con
`grep` exhaustivo sobre todo `guerrero-dev` (READMEs, `docs/*.md`, ADRs
en `docs/adr/`, descripciones de `package.json`) por los términos
"Developer Tools", "Personal Engineering Profile", "Continuous
Learning", "Controlled Coding Agent" — **cero resultados en cero
archivos**. Ese roadmap de 8 fases no existe como artefacto del
repositorio.

El único roadmap documentado y verificable en `guerrero-dev` es el de
`docs/fase-3-foundation.md`, sección "Siguiente paso" (líneas 191-197):

```text
FASE 4 → Memory System
FASE 5 → Project Intelligence
FASE 6 → Code Intelligence
FASE 7 → Cline/OpenCode Integration
```

Esta es exactamente la numeración usada en toda la ejecución real del
proyecto: `docs/fase-4-memory-engine-closure.md`,
`docs/fase-5-project-intelligence-closure.md`,
`docs/fase-6-code-intelligence-closure.md` — las tres marcadas CLOSED.
**No hay ningún desfase de numeración que reconciliar.** Nuestro "6.1–6.5"
es literalmente la Fase 6 de este roadmap, no una numeración interna
paralela.

`docs/fase-a-auditoria.md` es un documento de gobernanza histórico
(detectó trabajo de la subfase 4.8 mal etiquetado como "Fase 5 en
progreso"), ya superado por los cierres formales posteriores de Fase
4/5/6.

## 2. Hallazgo central — el cuello de botella real no es más "Intelligence"

Verificado directamente en `packages/agent-core/src/AgentOrchestrator.ts:35-47`:

```typescript
async run(task: AgentTask, options: ExecutionOptions = {}): Promise<ExecutionResult> {
  await this.contextBuilder.build(task);   // resultado descartado, ni se asigna a variable

  const plan = await this.planner.plan(task);
  this.toolSelector.selectToolSteps(plan.steps);
  // policyEngine se recibe por constructor (línea 28) pero NUNCA se invoca aquí
  return this.executionEngine.execute(plan, options);
}
```

`ILLMProvider.generate()` (`packages/application/src/common/ports/ILLMProvider.ts:14`)
tiene una implementación real: `OllamaProvider.ts` en
`infrastructure/llm/`, un cliente HTTP real contra Ollama (`/api/tags`,
`/api/generate`), sin mocks. Pero **no se invoca desde ningún lugar de
`agent-core`, `AgentService`, ni ninguna ruta de `apps/api`**. No existe
ninguna ruta `/agent` ni `/chat` — `apps/api/src/routes/` solo contiene
`sessions.ts`, `health.ts`, `projects.ts`.

Esto no es un hallazgo nuevo: ya estaba documentado como deuda explícita
desde el cierre de Fase 5
(`fase-5-project-intelligence-closure.md:183-184`):

```text
BuiltContext descartado por AgentOrchestrator.run()     → Fase 7 (conectar con Planner/ejecución real)
Formato de systemPrompt no validado contra un LLM real  → Fase 7
```

Y su §13 ("Frontera hacia Fase 6/7", líneas 317-320) ya define el
alcance correcto de Fase 7:

```text
Fase 7 → LLM real conectado, Planner/AgentLoop/ToolSelector reales,
         BuiltContext conectado a la ejecución, formato definitivo de
         prompt validado con evidencia real, integración Cline/OpenCode.
```

Es decir: **Fase 7 ya estaba correctamente anticipada, con el alcance
correcto, antes de que existiera Fase 6.** Fase 6 (Code Intelligence) no
tocó esta deuda — correctamente, no era su responsabilidad. La deuda
sigue exactamente donde estaba: sin LLM conectado y sin que
`BuiltContext` llegue a ejecutarse, ninguna de las capacidades de
Intelligence ya construidas (Project, Code, Memory) puede influir en una
respuesta real del agente.

## 3. Estado real por área

### Agent Core (Fase 3, skeleton)

- `ContextBuilder` — real y funcional: consume `ProjectProfile` (Fase 5)
  vía `IProjectIntelligenceProvider`, construye `systemPrompt` +
  `messages`. Es la única pieza de `agent-core` con dato real fluyendo.
  9 tests reales cubriéndola.
- `AgentOrchestrator` / `AgentLoop` / `Planner` / `ToolSelector` —
  skeleton: sin LLM, sin loop multi-turno real, `BuiltContext`
  descartado, `PolicyEngine` inyectado pero no invocado en `run()`. Sin
  tests de la orquestación completa (solo piezas sueltas verificadas
  individualmente).
- `PolicyEvaluator` — la única lógica real de esta carpeta además de
  `ContextBuilder` (fail-closed, 3 tests reales), pero no conectada a
  `AgentOrchestrator.run()`.
- No existe ruta `/agent` ni `/chat` en `apps/api`.

### Memory (Fase 4, CLOSED)

Descompuesto en las cuatro sub-capacidades que distinguía la propuesta
original de reconciliación:

| Sub-capacidad | Estado | Evidencia |
|---|---|---|
| Persistencia | ✅ CLOSED | Drizzle real + migraciones (`0002_memory_tables.sql`, `0003_memory_embeddings_vector.sql`) + UoW transaccional (`DrizzleMemoryPromotionUnitOfWork`) |
| Formación | ✅ CLOSED (solo Git) | `CandidateDetectionService` + pipeline determinista real; extracción vía LLM explícitamente diferida desde el diseño original |
| Retrieval | 🟡 parcial | `DrizzleMemoryCandidateRetriever` hace hybrid search real con pgvector, pero **solo lo usa internamente el deduplicador** — ningún consumidor externo (CLI/API/agent-core) lo invoca; `apps/cli/src/index.ts:19` tiene el comentario `// guerrero memory search` sin implementación |
| Validación | 🟡 parcial | Validación/scoring/dedup deterministas reales; `ConflictDetector` es `NoopMemoryConflictDetector` (siempre `[]`), diferido explícitamente en el cierre de Fase 4 con condición de reapertura ya escrita ("Fase 5 introduce concurrencia... o requiere esa señal") — no se cumplió, decisión correcta |

Hallazgo adicional relevante: **`ContextBuilder` no consume Memory en
absoluto** — grep de `"Memory"` dentro de `ContextBuilder.ts` da cero
resultados. Memory (Fase 4) y Project Intelligence (Fase 5) nunca se
combinaron, pese a que Fase 5 se construyó después de Fase 4.

Gap operacional ya documentado en el cierre de Fase 4, reconfirmado
vigente: `MemoryEmbedding` no se genera automáticamente en la
promoción — cualquier `Memory` nueva queda invisible para el retrieval
híbrido (que hace `INNER JOIN memory_embeddings`) hasta un reindexado
manual.

### Project Intelligence (Fase 5, CLOSED)

Única capacidad de Intelligence realmente conectada a `agent-core` hoy,
vía `IProjectIntelligenceProvider` → `ContextBuilder`.

### Code Intelligence (Fase 6, CLOSED)

Estructuralmente sólida y verificada contra el repo real (6.5), pero
**sin ningún consumidor**: cero imports desde `apps/api`, `apps/cli` o
`agent-core`. Es una isla separada de Project Intelligence — no existe
ningún archivo que combine `ProjectProfile` (`domain/project`) con
`CodeIndex` (`domain/code`); cada uno solo es alcanzable vía su propio
servicio de aplicación (`application/project-intelligence` /
`application/code-intelligence`).

### `packages/project-intelligence` (paquete standalone)

Confirmado que sigue siendo el placeholder literal de Fase 3, sin
tocar — decisión correcta, ya explícita en los cierres de Fase 5 y 6.
Detalle de higiene documental (no bloqueante): su comentario dice
"implementación real llega en Fase 5-6" pero la implementación real
aterrizó en `domain/project` + `domain/code` en su lugar, nunca en este
paquete — el comentario quedó desactualizado. Ya reconocido en el mapa
de Fase 6 §9a: se corrige junto con el resto de documentación obsoleta,
no como parte de ninguna fase todavía.

### Roadmap más allá de Fase 7

Búsqueda exhaustiva (READMEs, `docs/*.md`, ADRs, `package.json`) — cero
menciones de nada más allá de Fase 7 en todo el repo. Único hallazgo
tangencial: `docs/adr/0002-agent-engine-abstraction.md:32` menciona
`OpenHandsExecutionEngine (futuro, no comprometido)` como posible motor
de ejecución adicional dentro del alcance de Fase 7 — no es una fase
nueva, es una opción explícitamente no comprometida dentro de la
integración Cline/OpenCode ya planificada.

## 4. Clasificación necesario / componible / evolutivo

Reemplaza la tabla provisional propuesta antes de esta auditoría —
misma estructura, ahora con evidencia real verificada:

| Capacidad | Clasificación | Evidencia |
|---|---|---|
| LLM real conectado a `AgentOrchestrator` / `BuiltContext` consumido | **Necesario** | Sin esto, cero capacidades de Intelligence ya construidas llegan a influir una respuesta real |
| `PolicyEngine` invocado dentro de `run()` | **Necesario** (ya existe, falta cablear) | `PolicyEvaluator` real, fail-closed, pero no llamado desde `AgentOrchestrator.run()` |
| Memory expuesta a `ContextBuilder` | **Componible** | `DrizzleMemoryCandidateRetriever` ya funciona con pgvector real; falta exponerlo como segundo provider de contexto, mismo patrón que `IProjectIntelligenceProvider` |
| Code Intelligence expuesto al agente | **Componible** | `ICodeAnalyzer` / queries puras ya reales (6.1-6.5); falta un consumidor, sea como tool o como segundo proveedor de contexto |
| `MemoryEmbedding` autogenerado en promoción | **Componible** | Gap operacional ya documentado en el cierre de Fase 4, no requiere diseño nuevo |
| `ConflictDetector` real | **Evolutivo** | Sin evidencia de necesidad — condición de reapertura ya escrita en el cierre de Fase 4, no cumplida |
| Cline/OpenCode SDK adapters, git/file/terminal tooling | **Evolutivo** | Correctamente fuera de alcance hasta que el loop base (LLM conectado) funcione |
| Corregir comentario obsoleto de `packages/project-intelligence` | Housekeeping menor, no bloqueante | Cosmético — ver §3 |

## 5. Conclusión y siguiente paso

No hay ningún desfase de numeración que resolver: el roadmap real
(Fase 4→7) es interno y consistente, y Fase 6 = Code Intelligence tal
como se ejecutó. Lo que sí confirma esta auditoría es que **Fase 7 ya
tiene alcance correcto y ya documentado desde el cierre de Fase 5, y es
genuinamente el siguiente cuello de botella real del producto** — no
una elección arbitraria por ser "la siguiente numeración".

El siguiente paso es abrir la auditoría formal de Fase 7, con el mismo
ritual usado en 4.x–6.x (audit → decisiones → propuesta formal →
aprobación → implementación), **en una conversación separada** — este
documento no la abre ni la resuelve. Queda explícitamente sin decidir
todavía si Fase 7 se aborda de una sola vez o se subdivide en
incrementos (p. ej. un incremento inicial acotado solo al loop LLM
básico — `AgentOrchestrator` real, `PolicyEngine` cableado — dejando la
integración Cline/OpenCode para un incremento posterior, mismo criterio
de incrementos por capacidad ya usado en Fase 6.x/6.y/6.z). Esa es la
primera decisión de esa auditoría futura, no de este documento.
