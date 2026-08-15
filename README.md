# Guerrero Dev

Orquestador de agentes, herramientas y conocimiento de código. Decisiones de arquitectura: [`docs/fase-2-seleccion-tecnologica.md`](./docs/fase-2-seleccion-tecnologica.md) y [`docs/fase-3-foundation.md`](./docs/fase-3-foundation.md).

Este repositorio es el resultado de **Fase 3 — Foundation**: el esqueleto ejecutable del monorepo (arranca, tiene configuración, logging, health checks, dominio, contratos, PostgreSQL, Docker, tests y CI) sobre el que se construyen las fases siguientes. Todavía no modifica código, no aprende, no tiene memoria semántica y no conecta Cline/OpenCode — eso es Fase 4 en adelante.

## Stack

TypeScript · Node.js 24 LTS · pnpm workspaces · Fastify · PostgreSQL + pgvector · MCP (Fase 7) · Cline SDK / OpenCode SDK (Fase 7) · Ollama.

## Estructura

```text
apps/
  api/   — Fastify: health checks, /api/v1/projects (real, sobre Postgres), /api/v1/sessions (placeholder)
  cli/   — comando `guerrero doctor`

packages/
  shared/                 — ILogger (interfaz) + errores puros, sin dependencias externas
  domain/                 — entidades por capacidad: agent/, project/, memory/, execution/, permissions/, shared/
  application/            — casos de uso (agent/, projects/, memory/, analysis/) + puertos en common/ports/
  infrastructure/         — implementaciones concretas: database/ (Postgres), llm/ (Ollama), configuration/, logging/, git/, filesystem/, execution/ (placeholders)
  agent-core/             — AgentOrchestrator, ContextBuilder, Planner, ToolSelector, PolicyEvaluator, AgentLoop (skeletons; PolicyEvaluator es funcional)
  execution/               — implementaciones de IExecutionEngine (NoopExecutionEngine hoy; Cline/OpenCode en Fase 7)
  memory/                  — sistema de memoria (Fase 4)
  project-intelligence/    — AST/grafo/RAG de código (Fase 5-6)
  mcp/                     — cliente/servidores MCP (Fase 7)
```

Principio arquitectónico: las dependencias externas apuntan hacia `infrastructure`, nunca hacia `domain`. `domain` no depende de ningún otro package.

`apps/web` no forma parte de esta fase — ver su propio README.

## Requisitos

- Node.js 24 LTS (ver `.nvmrc`)
- pnpm 9+ (`corepack enable`)
- Docker (para PostgreSQL + pgvector vía `docker-compose.yml`)
- Ollama corriendo en el host (para LLM local — no está en Docker Compose a propósito, ver `docs/fase-3-foundation.md`)

## Empezar

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm build
pnpm typecheck
pnpm test
pnpm --filter @guerrero-dev/cli exec node dist/index.js doctor
```

## Scripts raíz

| Script | Qué hace |
|---|---|
| `pnpm build` | Compila todos los packages/apps (`tsc -b`) |
| `pnpm dev` | Corre apps en modo watch |
| `pnpm typecheck` | Typecheck de todos los packages + `tests/` |
| `pnpm lint` | ESLint sobre todo el monorepo |
| `pnpm format` / `format:check` | Prettier |
| `pnpm test` | Tests unitarios (Vitest) |
| `pnpm test:integration` | Tests de integración contra PostgreSQL real (requiere `docker compose up -d postgres`) |
| `pnpm test:e2e` | Tests e2e de la API contra PostgreSQL real |
| `pnpm migrate` | Aplica migraciones pendientes a mano |

## Estado — Definition of Done (Fase 3.19)

- [x] Monorepo pnpm, Node 24 LTS, TypeScript, ESLint, Prettier
- [x] Domain package (por capacidad)
- [x] Application package (casos de uso + puertos)
- [x] Infrastructure package (Postgres real; Ollama provider real; resto placeholder)
- [x] Agent Core skeleton (PolicyEvaluator funcional)
- [x] Execution contracts (`IExecutionEngine`, `NoopExecutionEngine`)
- [x] PostgreSQL + pgvector, Docker Compose
- [x] Configuration, structured logging, health checks
- [x] CLI (`guerrero doctor`)
- [x] Unit, integration y e2e tests
- [x] GitHub Actions (con servicio Postgres)
- [x] README

Deliberadamente NO instalado todavía: `@cline/sdk`, SDK de OpenCode — eso es Fase 7, después de validar el contrato `IExecutionEngine`.
