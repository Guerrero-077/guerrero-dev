# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Qué es esto

Guerrero Dev — orquestador de agentes, herramientas y conocimiento de código. Monorepo TypeScript/Node.js (pnpm workspaces) construido como una secuencia de fases (ver `docs/fase-*.md` y `docs/adr/`), cada una con su propio alcance explícito y criterios de cierre. Actualmente pasó la Fase 4 (Memory Engine, CERRADA) y está en la Fase 5 (Project Intelligence, hasta ahora solo diseño — ver `docs/fase-5-project-intelligence-map.md`). La documentación y los mensajes de commit están en español; el código (identificadores, comentarios) está en inglés por convención del proyecto.

## Comandos

```bash
pnpm install                 # después de clonar o de un pull con cambios de dependencias
docker compose up -d postgres    # PostgreSQL + pgvector, requerido para todo lo demás
pnpm build                   # tsc -b en todos los packages/apps — correr antes de typecheck/integration/e2e
pnpm dev                     # apps en modo watch (tsx watch)
pnpm typecheck               # tsc -b --noEmit para cada package + tests/tsconfig.json
pnpm lint                    # eslint . (flat config, typescript-eslint recommended + prettier)
pnpm format / format:check   # prettier
pnpm test                    # solo tests unitarios (vitest run) — packages/*/src/**/*.test.ts, apps/*/src/**/*.test.ts
pnpm test:watch              # vitest en modo watch
pnpm test:integration        # tests/integration/**, necesita Postgres real, corre con --no-file-parallelism (serializado a propósito — ver más abajo)
pnpm test:e2e                # tests/e2e/**, necesita Postgres real + un apps/api ya compilado (importa el export ./app compilado de apps/api)
pnpm migrate                 # tsx scripts/migrate.ts — aplica migraciones SQL pendientes a mano
pnpm benchmark:embeddings    # tsx scripts/benchmark-embeddings.ts
```

Correr un solo archivo de test: `pnpm vitest run path/to/file.test.ts` (o `pnpm vitest run -t "test name"`). Para un solo archivo de integración/e2e, mantené la variable `RUN_INTEGRATION_TESTS=true` y `--no-file-parallelism`, por ejemplo: `cross-env RUN_INTEGRATION_TESTS=true pnpm vitest run tests/integration/foo.test.ts --no-file-parallelism`.

CI (`.github/workflows/ci.yml`) corre, en este orden: lint → format:check → build → typecheck → unit → integration → e2e, contra un contenedor de servicio real `pgvector/pgvector:pg17`. **El build tiene que pasar antes que typecheck/tests** porque `apps/api` expone un subpath `./app` vía `exports` que los tests importan desde `dist/`, no desde el código fuente.

Prueba manual del vertical slice:
```bash
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js project add <name> <path>
node apps/cli/dist/index.js project list
node apps/cli/dist/index.js project get <id>
```

Requiere Node.js 24 LTS (`.nvmrc`), pnpm 9+ (`corepack enable`), Docker para Postgres. Ollama corre nativo en el host (no en Docker) para poder usar la GPU del host — es opcional, `guerrero doctor` no falla duro sin él.

## Arquitectura

### Capas (dirección estricta de dependencias)

```
apps/cli, apps/api
        │
        ▼
   agent-core, execution, memory, project-intelligence, mcp   (implementaciones)
        │
        ▼
      application            (casos de uso + puertos/interfaces, sin deps externas salvo domain+shared)
        │
        ▼
       domain                (entidades, value objects, invariantes — cero dependencias externas)

       shared                (interfaz ILogger + errores puros — del que dependen todos, que no depende de nada)
```

**Las dependencias externas apuntan hacia `infrastructure`, nunca hacia `domain`.** `domain` no depende de ningún otro package. Esto se respeta por convención, no por tooling — respetalo al agregar código: domain/application solo referencian otros packages internos y definen puertos (`common/ports/I*.ts` en `application`); los adapters concretos (Drizzle, Ollama, Pino, `fs`/`git` de node) viven en `infrastructure`.

Packages (`packages/`):
- `shared` — interfaz `ILogger` + clases de error puras, sin dependencias externas.
- `domain` — organizado por capacidad: `agent/`, `project/`, `memory/`, `execution/`, `permissions/`, `shared/` (`Entity`, `Result<T,E>`, `HardwareProfile`, `Model`). `Result` se usa solo donde el fallo es un resultado esperado y modelable (p. ej. validación) — no en todos lados.
- `application` — casos de uso individuales (`projects/AddProject.ts`, `GetProject.ts`, `ListProjects.ts`; `memory/services/*`) más todos los puertos en `common/ports/` (`IProjectRepository`, `IMemoryRepository`, `IExecutionEngine`, `ILLMProvider`, `IEmbeddingProvider`, `IPolicyEngine`, etc.). Tanto los casos de uso nuevos como los puertos nuevos van acá.
- `infrastructure` — `database/` (schema de Drizzle + repositorios + migraciones SQL que se corren con `pnpm migrate`), `llm/` y `embeddings/` (adapters de Ollama), `git/` (colección/parseo de commits), `configuration/`, `logging/` (Pino).
- `agent-core` — `AgentOrchestrator`, `ContextBuilder`, `Planner`, `ToolSelector`, `PolicyEvaluator`, `AgentLoop`. Mayormente skeletons; `PolicyEvaluator` (implementación de `IPolicyEngine`) es la única pieza funcional y está deliberadamente desacoplada del motor de ejecución — cambiar de motor de ejecución nunca toca la política de aprobación.
- `execution` — implementaciones de `IExecutionEngine` (ADR 0002). `OpenCodeExecutionEngine` es el motor real y primario desde ADR 0003 (ver también `NoopExecutionEngine` para tests sin autonomía real); `ClineExecutionEngine` queda diferido sin fecha, no descartado. No agregues `@cline/sdk` sin evidencia real de que hace falta.
- `memory` — cascarón del package para la Fase 4 (Memory Engine); la implementación real está repartida entre `domain/memory`, `application/memory`, `infrastructure/database` (memories/memory_sources/memory_relations/memory_embeddings + pgvector).
- `project-intelligence` — cascarón del package para la Fase 5/6 (AST/grafo/RAG de código); por ahora solo diseño, ver `docs/fase-5-project-intelligence-map.md`.
- `mcp` — servidores MCP reales que exponen capacidades del agente como herramientas: `CodeIntelligenceMcpServer` (envuelve `CodeIntelligenceToolHandler`, cableado a `Config.mcp` de OpenCode desde Fase 6.3/5.4c) es el primer caso, ya cerrado y probado. Es el patrón de referencia para exponer cualquier capacidad nueva al agente — antes de wiring ad-hoc, considerar un servidor MCP.

Apps (`apps/`):
- `api` — Fastify. `server.ts` construye la app (expuesta vía los subpaths `./server`/`./app` para que los tests puedan importar una instancia ya compilada), `src/index.ts` la levanta, `plugins/database.ts` cablea el pool de la DB, `routes/` son delgadas — llaman a casos de uso de `application`.
- `cli` — basada en Commander. `src/index.ts` registra los comandos (`doctor`, `project add|list|get`); `src/commands/` tiene las implementaciones, `src/context.ts` construye las dependencias compartidas (pool de DB, repositorios) que usan los comandos.
- `web` — **excluida del workspace de pnpm** (`pnpm-workspace.yaml` tiene `!apps/web`) y fuera de alcance de la fase actual; no la cablees en los scripts de la raíz. Revisá su propio README antes de tocarla.

### Memory Engine (Fase 4, CERRADA — leer antes de cambiar nada bajo `memory/`)

Pipeline completo (Git → PostgreSQL/pgvector), todas las etapas respaldadas por implementaciones reales, no dobles de test, y verificadas contra infraestructura real:

```
GitCommitCollector → DeterministicCommitAnalyzer → DeterministicCommitNoiseFilter
  → DeterministicCandidateExtractor → CandidateDetectionService → MemoryCandidate
  → MemoryCandidateEvaluator (DeterministicMemoryCandidateValidator, MemoryCandidateDeduplicator
       [Ollama + pgvector], NoopMemoryConflictDetector, MemoryCandidateScorer)
  → MemoryEvaluation → MemoryCandidatePromoter (+ DrizzleMemoryPromotionUnitOfWork, transaccional)
  → PostgreSQL (memories/memory_sources/memory_relations) + pgvector (memory_embeddings)
```

Gaps conocidos y deliberados (documentados en `docs/fase-4-memory-engine-closure.md`, no deuda accidental — no los "arregles" en silencio):
- **`MemoryEmbedding` nunca se escribe durante la promoción.** `IMemoryPromotionUnitOfWork` no toca `memory_embeddings`, así que una `Memory` recién promovida es invisible para `DrizzleMemoryCandidateRetriever` (hace inner join con `memory_embeddings`) hasta que ocurra un reindexado aparte. Es un gap de contrato conocido, no un bug a parchear por reflejo — la Fase 5 es el disparador para revisitarlo.
- `NoopMemoryConflictDetector` siempre devuelve `[]` — la detección de conflictos está sin implementar a propósito.
- El tipo `RiskSignal` existe sin productores ni consumidores todavía.

**Regla para trabajo de Fase 5+ que toque contratos de Memory Engine:** no cambies contratos de Fase 4 en silencio como efecto secundario de trabajo de Fase 5 — tratalo como una decisión explícita y documentada de frontera entre fases (esta es la regla vigente del documento de cierre, no solo una sugerencia).

### Convenciones

- ESM en todos lados (`"type": "module"`), resolución de módulos Node16/NodeNext, TS strict mode más `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride` (`tsconfig.base.json`) — escribí código que cumpla esto, no código que necesite que se relaje.
- Cada package se compila de forma independiente vía TS project references (`tsc -b`); `main`/`types`/`exports` en cada `package.json` apuntan a `dist/`. Si agregás un import nuevo entre packages, asegurate de que pase por los `exports` públicos del package, no por un path relativo profundo hacia el `src/` de otro.
- Errores: clases de error puras en `shared`; `Result<T, E>` (`domain/shared/Result.ts`) solo para casos de uso donde el fallo es un resultado esperado.
- Los tests viven junto al código como `*.test.ts` para tests unitarios (vitest); `tests/integration/**` y `tests/e2e/**` en la raíz del repo son los únicos que pueden hablar con Postgres/Ollama/Git reales, protegidos detrás de `RUN_INTEGRATION_TESTS=true`.
- Las migraciones son archivos SQL numerados en `packages/infrastructure/src/database/migrations/`, aplicados con `pnpm migrate` (nunca edites una migración ya aplicada — agregá una nueva).
