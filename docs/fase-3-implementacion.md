# Guerrero Dev — Fase 3: Implementación de Foundation

**Fecha:** 2026-08-15

## Precisión sobre el estado anterior

`docs/fase-3-foundation.md` no era solo diseño: ese monorepo se construyó, compiló y se corrió realmente (`pnpm build`, `pnpm typecheck`, `pnpm lint`, `pnpm test` en verde; API y CLI arrancados y probados a mano) antes de commitear. Lo que faltaba era **decidir Drizzle sobre queries SQL crudas** y **acotar el alcance a un vertical slice mínimo** — eso es lo que hace esta pasada.

## Objetivo de esta pasada

Un vertical slice mínimo que arranque, conecte PostgreSQL y demuestre que la arquitectura funciona de punta a punta:

```text
                     Guerrero Dev
                          │
                    ┌─────┴─────┐
                    │           │
                  CLI          API
                    │           │
                    └─────┬─────┘
                          │
                    Application
                          │
                        Domain
                          │
                    Infrastructure
                          │
                     PostgreSQL
```

## Decisión: Drizzle ORM, no Prisma

Drizzle se elige porque el roadmap necesita SQL relativamente avanzado — pgvector, búsquedas vectoriales, índices, consultas híbridas — y no se quiere que la capa de persistencia esconda demasiado PostgreSQL.

**Cómo se usa exactamente**: Drizzle es una capa de *queries tipadas* sobre el pool `pg` ya existente (`createDrizzleClient(pool)`), no un sistema de migraciones. El DDL sigue siendo SQL escrito a mano (`database/migrations/0001_init.sql`) con el runner propio de Fase 3.7 — `packages/infrastructure/src/database/schema/projects.ts` define los tipos para las queries, pero la fuente de verdad del esquema real es la migración SQL. Esta es una decisión deliberada: drizzle-kit (generación de migraciones desde el schema) se puede adoptar más adelante si el equipo lo prefiere, pero no es necesario para este vertical slice y hubiera añadido una herramienta más de la que "no queremos llenar el proyecto innecesariamente".

## Domain: Entity, Result, Project.path

Se añadieron dos tipos base en `domain/shared/`:

```typescript
interface Entity {
  readonly id: string;
}

type Result<T, E = Error> = Success<T> | Failure<E>;
```

`Project` ahora extiende `Entity`, todos sus campos son `readonly`, y el campo antes llamado `rootPath` pasa a llamarse **`path`** (consistente con el CLI: `guerrero project add <name> <path>`). Esto implicó renombrar la columna `root_path` → `path` en la migración — seguro de hacer porque el proyecto no tiene datos reales desplegados todavía.

`Result` se usa donde el fallo es parte normal del flujo (`AddProject` — nombre/path vacíos), no en todos lados: `GetProject`/`ListProjects` siguen devolviendo `Project | null` / `Project[]` directamente, porque una lista vacía o un id inexistente no son "errores".

## Application: casos de uso individuales, no un service

`ProjectService` se reemplazó por tres clases con una responsabilidad cada una:

```text
packages/application/src/projects/
├── AddProject.ts     — construye la entidad (id, timestamps) y la persiste
├── GetProject.ts
└── ListProjects.ts
```

`IProjectRepository.create()` ahora recibe un `Project` ya completo, no un DTO — la identidad y los timestamps los decide el caso de uso, no el repositorio ni la base de datos.

## Infrastructure: DrizzleProjectRepository

```text
packages/infrastructure/src/database/
├── client.ts                          — createDrizzleClient(pool)
├── schema/projects.ts                 — tabla tipada, espejo de la migración
├── repositories/DrizzleProjectRepository.ts
├── migrate.ts / migrations/0001_init.sql
└── pool.ts
```

## PostgreSQL: schema realmente mínimo

La migración 0001 se redujo a **solo `projects`** (antes incluía `agent_sessions`, `tool_requests`, `policy_decisions`, `memory_records`). `agent_sessions`/`agent_messages`/`agent_runs` llegan cuando agent-core los necesite de verdad (Fase 7); la tabla de memoria con `vector(n)`, cuando se congele el modelo de embeddings (Fase 4). La extensión `pgvector` sí se instala ya (`CREATE EXTENSION IF NOT EXISTS vector`) para que `guerrero doctor` pueda verificarla — sin crear ninguna columna `vector(n)` todavía.

## API: server.ts + plugins/database.ts

`app.ts` se renombró a `server.ts` (`buildServer()`, ahora async). Se agregó `plugins/database.ts`, un plugin Fastify (`fastify-plugin`) que decora la instancia con `pgPool`, `db` (Drizzle) y `projectRepository`, para que las rutas no reciban el pool a mano. Endpoints sin cambios de forma, con el campo `path`:

```text
GET  /health
GET  /health/ready
GET  /api/v1/health
GET  /api/v1/projects
GET  /api/v1/projects/:id
POST /api/v1/projects   { "name": "GESCOMPH", "path": "D:/Projects/GESCOMPH" }
GET  /api/v1/sessions   (placeholder)
```

## CLI: `guerrero project add|list`

El CLI habla con Application, no con PostgreSQL directamente — `apps/cli/src/context.ts` construye pool → Drizzle → repositorio → casos de uso, y las rutas se limitan a invocarlos:

```bash
guerrero project add GESCOMPH D:\Projects\GESCOMPH
guerrero project list
```

## `guerrero doctor`: secciones agrupadas

Reescrito con cuatro secciones (Environment, Infrastructure, Application, AI) y una caja de título, más chequeos nuevos: TypeScript (resuelve el paquete), PostgreSQL (TCP alcanzable), pgvector (extensión instalada), Database (conexión aplicativa real vía `SELECT 1`), Configuration (`loadConfig()` no lanza), API (puerto libre). `Local model` y `Embeddings` se muestran como `○` (informativo, no bloquea "READY") porque deliberadamente no hay todavía un `ModelRegistry` ni una dimensión de embeddings congelada.

Salida real, verificada en el sandbox de build (Node 22, sin Docker/Postgres/Ollama — por eso varios ítems fallan/advierten, correctamente):

```text
╭───────────────────────────╮
│    GUERRERO DEV DOCTOR    │
╰───────────────────────────╯

Environment
  ✗ Node.js 22 — se requiere Node.js 24 LTS o superior
  ✓ pnpm
  ✓ TypeScript 5.9.3
  ✓ Git

Infrastructure
  ✗ Docker — no se encontró `docker` en PATH
  ✗ PostgreSQL — connect ECONNREFUSED 127.0.0.1:5432
  ✗ pgvector — connect ECONNREFUSED 127.0.0.1:5432

Application
  ✓ API
  ✗ Database — connect ECONNREFUSED 127.0.0.1:5432
  ✓ Configuration

AI
  ⚠ Ollama — no responde en http://localhost:11434
  ⚠ GPU — no detectada
  ○ Local model — sin seleccionar — ModelRegistry llega en Fase 4+
  ○ Embeddings — dimensión no congelada — ver Fase 3.8

Status: NOT READY
```

Con Node 24 + Docker + `docker compose up -d postgres`, los ítems en rojo pasan a `✓` y el estado cambia a `READY`.

## Qué NO se hizo en esta fase (bloqueado explícitamente)

RAG, embeddings reales, Cline, OpenCode, Ollama integrado al flujo del agente, agente autónomo, fine-tuning, microservicios. Todo eso es Fase 4 en adelante.

## Verificación

En el mismo sandbox de build aislado (Node 22, sin red a nodejs.org por lo que no se pudo instalar Node 24; sin Docker/PostgreSQL reales):

- `pnpm install`, `pnpm build` (11 proyectos), `pnpm typecheck` (incluye `tests/`), `pnpm lint`, `pnpm format:check`: todo en verde.
- `pnpm test`: **14 tests unitarios pasan** (10 nuevos: `AddProject`/`GetProject`/`ListProjects`), 7 de integración/e2e se saltan correctamente sin `RUN_INTEGRATION_TESTS`.
- Prueba manual: API real arrancada — `GET /health` responde `{"status":"ok"}`; `POST /api/v1/projects` y `GET /api/v1/projects` devuelven `500 ECONNREFUSED` de forma controlada (JSON, sin crash) porque no hay PostgreSQL en el sandbox — confirma que el pipeline API → Application → Domain → Repository → Drizzle → pool llega hasta el intento de conexión real.
- `guerrero doctor`, `guerrero project add`, `guerrero project list` corridos a mano: formato y manejo de errores exactamente como se esperaba, reportando con precisión el estado real del entorno (ver salida arriba).

Lo único que **no** se pudo validar en este sandbox es el camino feliz completo contra un PostgreSQL real (crear un proyecto y volver a leerlo) — eso queda para cuando corras `docker compose up -d postgres && pnpm build && node apps/api/dist/index.js` en tu máquina, o para el pipeline de CI (que sí levanta un servicio PostgreSQL real).

## Siguiente paso

Con el vertical slice demostrado, `guerrero doctor` en READY (en tu máquina, con Docker levantado) es la condición de salida real de esta fase. Después: Fase 4 — Memory System.
