# Guerrero Dev

Repo: [github.com/Guerrero-077/guerrero-dev](https://github.com/Guerrero-077/guerrero-dev)

Orquestador de agentes, herramientas y conocimiento de código. Decisiones de arquitectura: [`docs/fase-2-seleccion-tecnologica.md`](./docs/fase-2-seleccion-tecnologica.md), [`docs/fase-3-foundation.md`](./docs/fase-3-foundation.md) y [`docs/fase-3-implementacion.md`](./docs/fase-3-implementacion.md).

Este repositorio implementa un **vertical slice mínimo**: CLI y API funcionando de punta a punta contra PostgreSQL (crear/listar proyectos), demostrando que la arquitectura por capas funciona. Todavía no modifica código, no aprende, no tiene memoria semántica y no conecta Cline/OpenCode — eso es Fase 4 en adelante.

## Stack

TypeScript · Node.js 24 LTS · pnpm workspaces · Fastify · PostgreSQL + pgvector · Drizzle ORM · MCP (Fase 7) · Cline SDK / OpenCode SDK (Fase 7) · Ollama.

## Estructura

```text
apps/
  api/   — Fastify: server.ts + plugins/database.ts + routes/
  cli/   — comandos `guerrero doctor` y `guerrero project add|list`

packages/
  shared/                 — ILogger (interfaz) + errores puros, sin dependencias externas
  domain/                 — por capacidad: agent/, project/, memory/, execution/, permissions/, shared/ (Entity, Result, HardwareProfile, Model)
  application/            — casos de uso individuales (projects/AddProject.ts, GetProject.ts, ListProjects.ts, ...) + puertos en common/ports/
  infrastructure/         — database/ (Drizzle + Postgres), llm/ (Ollama), configuration/, logging/, git/, filesystem/, execution/ (placeholders)
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
- Ollama corriendo en el host (opcional — no bloquea `guerrero doctor`)

## Empezar

```bash
cp .env.example .env
pnpm install
docker compose up -d postgres
pnpm build
pnpm typecheck
pnpm test
node apps/cli/dist/index.js doctor
```

## Probar el vertical slice

```bash
node apps/cli/dist/index.js project add GESCOMPH D:\Projects\GESCOMPH
node apps/cli/dist/index.js project list
node apps/cli/dist/index.js project get <id>
```

O vía la API (`node apps/api/dist/index.js`, en otra terminal):

```bash
curl -X POST http://localhost:3000/api/v1/projects \
  -H "content-type: application/json" \
  -d '{"name":"GESCOMPH","path":"D:/Projects/GESCOMPH"}'

curl http://localhost:3000/api/v1/projects
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

## Estado

Vertical slice completo y verificado (build, typecheck, lint, format, 14 tests unitarios en verde; API y CLI probados a mano). Pendiente de correr contra un PostgreSQL real: `docker compose up -d postgres` y `guerrero doctor` debería reportar `Status: READY`. Ver `docs/fase-3-implementacion.md` para el detalle de la verificación y qué queda deliberadamente fuera de esta fase.
