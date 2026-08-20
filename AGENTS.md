# AGENTS.md

This file provides guidance to AI coding agents when working with code in this repository.

## Qué es esto

Guerrero Dev — orquestador de agentes, herramientas y conocimiento de código. Monorepo TypeScript/Node.js (pnpm workspaces) construido como una secuencia de fases (ver `docs/fase-*.md` y `docs/adr/`). La documentación y los mensajes de commit están en español; el código (identificadores, comentarios) está en inglés por convención del proyecto.

## Comandos

```bash
pnpm install                 # después de clonar o de un pull con cambios de dependencias
docker compose up -d postgres    # PostgreSQL + pgvector, requerido para todo lo demás
pnpm build                   # tsc -b en todos los packages/apps — correr antes de typecheck/integration/e2e
pnpm dev                     # apps en modo watch (tsx watch)
pnpm typecheck               # tsc -b --noEmit para cada package + tests/tsconfig.json
pnpm lint                    # eslint . (flat config, typescript-eslint recommended + prettier)
pnpm format / format:check   # prettier
pnpm test                    # solo tests unitarios (vitest run)
pnpm test:watch              # vitest en modo watch
pnpm test:integration        # tests/integration/**, necesita Postgres real, serializado (--no-file-parallelism)
pnpm test:e2e                # tests/e2e/**, necesita Postgres real + apps/api compilado
pnpm migrate                 # tsx scripts/migrate.ts — aplica migraciones SQL pendientes a mano
pnpm benchmark:embeddings    # tsx scripts/benchmark-embeddings.ts
```

Un solo archivo: `pnpm vitest run path/to/file.test.ts` (o `pnpm vitest run -t "test name"`).
Un solo archivo de integración/e2e: `cross-env RUN_INTEGRATION_TESTS=true pnpm vitest run tests/integration/foo.test.ts --no-file-parallelism`.

CI (`.github/workflows/ci.yml`) corre: lint → format:check → build → typecheck → unit → integration → e2e. **El build tiene que pasar antes que typecheck/tests** porque `apps/api` expone un subpath `./app` vía `exports` que los tests importan desde `dist/`.

Prueba manual:
```bash
node apps/cli/dist/index.js doctor
node apps/cli/dist/index.js project add <name> <path>
node apps/cli/dist/index.js project list
node apps/cli/dist/index.js project get <id>
```

Requiere: Node.js ≥ 24 LTS (`.nvmrc`), pnpm 9+ (`corepack enable`), Docker para Postgres. Ollama corre nativo en el host (opcional).

## Arquitectura

### Capas (dirección estricta de dependencias)

```
apps/cli, apps/api
        │
        ▼
   agent-core, execution, memory, project-intelligence, mcp   (implementaciones)
        │
        ▼
      application            (casos de uso + puertos/interfaces)
        │
        ▼
       domain                (entidades, value objects, invariantes — cero deps externas)

       shared                (ILogger + errores puros — del que dependen todos)
```

**Las dependencias externas apuntan hacia `infrastructure`, nunca hacia `domain`.** `domain` no depende de ningún otro package.

### Packages (`packages/`)

| Package | Estado | Qué hace |
|---------|--------|----------|
| `shared` | Completo | `ILogger` + `GuerreroError` hierarchy. Cero dependencias. |
| `domain` | Completo | Entidades por capacidad: `agent/`, `project/`, `memory/`, `execution/`, `code/`, `permissions/`, `shared/` (`Entity`, `Result<T,E>`, `HardwareProfile`, `Model`). |
| `application` | Completo | Casos de uso (`projects/AddProject`, `GetProject`, `ListProjects`), 14+ puertos en `common/ports/`, 12 memory services, code intelligence queries, project intelligence services. |
| `infrastructure` | Completo | Drizzle ORM + repos, Ollama (LLM + embeddings), Git adapters, ts-morph (code analysis), Pino logger, config (Zod), FileReader. |
| `execution` | Completo | `NoopExecutionEngine` (stub) + `OpenCodeExecutionEngine` (real, ~510 líneas, SSE, permisos, subagents). |
| `agent-core` | Mayormente funcional | `AgentOrchestrator`, `ContextBuilder`, `PolicyEvaluator` son reales; `Planner`, `ToolSelector`, `AgentLoop` son skeletons. `AllowScopedMutationRule` (Fase 6.3) es la primera PolicyRule real con alcance de escritura. |
| `memory` | Placeholder | Cascarón que exporta `PACKAGE_NAME`. La implementación real vive en `domain/memory`, `application/memory`, `infrastructure/database`. |
| `project-intelligence` | Placeholder | Cascarón. Implementación real en `application/project-intelligence` + `infrastructure/project-intelligence`. |
| `mcp` | Primer servidor real | `CodeIntelligenceMcpServer` (Fase 5.4c) envuelve `CodeIntelligenceToolHandler` como herramientas MCP. `server.ts` es el entrypoint para spawnear vía `Config.mcp`. |

### Apps (`apps/`)

| App | Estado | Qué hace |
|-----|--------|----------|
| `api` | Funcional | Fastify. Routes: `GET /health`, `GET/POST /api/v1/projects`, `GET /api/v1/projects/:id`, `GET /api/v1/sessions` (placeholder). Plugin `database.ts` cablea pool + Drizzle. |
| `cli` | Funcional | Commander. Comandos: `doctor` (diagnóstico completo), `project add|list|get`, `agent run <projectId> <instruction> [--model]`. |
| `web` | Excluida | `!apps/web` en `pnpm-workspace.yaml`. Fuera de alcance. No la toques. |

### Memory Engine (Fase 4, CERRADA)

Pipeline completo: Git → PostgreSQL/pgvector.

```
GitCommitCollector → DeterministicCommitAnalyzer → DeterministicCommitNoiseFilter
  → DeterministicCandidateExtractor → CandidateDetectionService → MemoryCandidate
  → MemoryCandidateEvaluator (Validator, Deduplicator [Ollama+pgvector], ConflictDetector [noop], Scorer)
  → MemoryCandidatePromoter (DrizzleMemoryPromotionUnitOfWork, transaccional)
  → PostgreSQL (memories/memory_sources/memory_relations) + pgvector (memory_embeddings)
```

### Code Intelligence (Fase 6, CERRADA)

Análisis de código vía ts-morph (sintáctico, sin type-checker): `CodeSymbol`, `DependencyEdge`, `CodeIndex`. Búsqueda literal de strings. Todo confinado a `infrastructure/code-intelligence/`.

### Convenciones

- **ESM** en todos lados (`"type": "module"`), resolución Node16/NodeNext.
- **TS strict** + `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitOverride`.
- **Imports entre packages**: solo vía `exports` públicos de cada `package.json`, nunca paths relativos al `src/` de otro package.
- **Migraciones**: archivos SQL numerados en `packages/infrastructure/src/database/migrations/`. Nunca edites una ya aplicada — agregá una nueva.
- **Tests unitarios** junto al código como `*.test.ts`. **Integration/e2e** en `tests/` raíz, protegidos por `RUN_INTEGRATION_TESTS=true`.
- **Errores**: clases de error puras en `shared`; `Result<T,E>` solo donde el fallo es esperado y modelable.
- **Commits y ramas**: ver `CONTRIBUTING.md` para conventional commits, nombres de ramas, y flujo de merge.

## Estado de fases

| Fase | Nombre | Estado |
|------|--------|--------|
| 0 | Research & Architecture | CERRADA |
| 1 | Foundation + Agent Core Skeleton | CERRADA |
| 2 | Memory Engine | CERRADA |
| 3 | Project Intelligence | CERRADA |
| 4 | Code Intelligence | CERRADA |
| 5 | Agent Core Real (LLM connected) | CERRADA (sub-fases 5.5b–5.14) |
| 6 | Developer Tools | En progreso — Fase 6.1-6.3 cerradas (edit habilitado, AllowScopedMutationRule, MCP Code Intelligence) |
| 7 | Autonomous Workflows / MCP | NO INICIADA |

## Gaps conocidos (deliberados — no los "arregles" en silencio)

1. **`MemoryEmbedding` nunca se escribe durante la promoción.** `IMemoryPromotionUnitOfWork` no toca `memory_embeddings`, así que una `Memory` recién promovida es invisible para `DrizzleMemoryCandidateRetriever` (inner join con `memory_embeddings`) hasta que ocurra un reindexado aparte. Reabrir en Fase 5.

2. **`NoopMemoryConflictDetector`** siempre devuelve `[]`. Detección de conflictos sin implementar a propósito.

3. **`RiskSignal`** existe sin productores ni consumidores.

**Regla de frontera entre fases:** no cambies contratos de Fase 4 en silencio como efecto secundario de trabajo de Fase 5+ — tratalo como una decisión explícita y documentada.

## Configuración

Ver `.env.example` para todas las variables. Claves:
- `DATABASE_URL` — PostgreSQL (sincronizado con `docker-compose.yml`)
- `OLLAMA_BASE_URL` — http://localhost:11434
- `OLLAMA_DEFAULT_MODEL` — `qwen2.5:7b-instruct-q4_K_M` (único modelo confirmado con tool-calling confiable)
- `OLLAMA_EMBEDDING_MODEL` — `qwen3-embedding:4b` (1024 dims, MRL truncation)

## Antes de diagnosticar errores

Consultá `memory.md` en la raíz del repo. Contiene errores conocidos, workarounds activos, y patrones de debugging. No repitas diagnósticos ya documentados — empezá desde ahí.
