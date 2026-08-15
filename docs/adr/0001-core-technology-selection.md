# ADR 0001 — Core Technology Selection

**Estado:** Aceptado
**Fecha:** 2026-08-14
**Contexto detallado:** [`docs/fase-2-seleccion-tecnologica.md`](../fase-2-seleccion-tecnologica.md)

## Contexto

Guerrero Dev es un orquestador de agentes, herramientas y conocimiento de código — más cercano a un sistema de agentes + tooling que a un producto de machine learning. Necesitábamos elegir lenguaje, runtime, framework de API, ORM, base de datos y contenedores antes de escribir la primera línea de Foundation.

## Decisión

| Área | Elegido |
|---|---|
| Lenguaje | TypeScript |
| Runtime | Node.js 24 LTS |
| Package manager | pnpm (workspaces) |
| API | Fastify |
| CLI | Commander |
| Validación | Zod |
| ORM / query layer | Drizzle ORM |
| Base de datos | PostgreSQL |
| Extensión vectorial | pgvector |
| Testing | Vitest |
| Contenedores | Docker / Docker Compose |
| CI | GitHub Actions |

**Node 24, no Node 26**: Node 24 es la rama LTS activa; Node 26 seguía como Current (entra en LTS en octubre 2026). Para un proyecto que depende de SDKs de terceros, PostgreSQL, Docker y tooling de agentes, se prioriza LTS + estabilidad sobre las novedades de la rama Current.

**Drizzle, no Prisma**: el roadmap necesita SQL relativamente avanzado — pgvector, búsquedas vectoriales, índices, consultas híbridas — y no queríamos que la capa de persistencia esconda demasiado PostgreSQL. Drizzle se usa como capa de queries tipadas sobre un pool `pg` normal; el DDL sigue siendo SQL escrito a mano (ver ADR de implementación en `docs/fase-3-implementacion.md`).

## Alternativas rechazadas

- **Python** — excelente para ML/fine-tuning/data science, pero Guerrero Dev es agente + herramientas + MCP + código + git + memoria + orquestación, terreno donde el ecosistema de agentes en TypeScript (Cline SDK, OpenCode SDK, MCP SDK oficial) tiene ventaja clara. Python queda abierto como servicio especializado futuro si aparece una necesidad real (p. ej. un paso de ML puntual).
- **C#** — viable en MCP, LLM, PostgreSQL y APIs, pero el ecosistema de agentes es inferior. Hubiéramos estado luchando contra el ecosistema en vez de aprovecharlo.
- **Prisma** — buena opción general, pero para memoria + pgvector + project intelligence queríamos control fino del schema y SQL sin abstracción pesada.
- **MongoDB** — no hay necesidad de un modelo documental; el dominio (proyectos, sesiones, memoria) es relacional con una extensión vectorial, que PostgreSQL + pgvector cubre en una sola base de datos.
- **Redis** — no se introduce desde el inicio. Si el proyecto crece y los benchmarks lo justifican, se agrega — no antes.
- **Microservicios** — over-engineering para el tamaño actual del sistema. Monorepo con packages bien separados (domain/application/infrastructure) da la misma disciplina arquitectónica sin el costo operativo de servicios distribuidos.

## Consecuencias

- El monorepo pnpm comparte tipos/contratos entre `apps/api`, `apps/cli` y todos los `packages/*` sin publicar paquetes npm.
- Una sola base de datos (PostgreSQL) simplifica operación mientras el proyecto es pequeño; pgvector se instala desde Foundation para no requerir una migración estructural cuando llegue Memory Engine.
- Si en el futuro se justifica Python, Redis, o un cambio de ORM, se documenta en un nuevo ADR — esta decisión no es irreversible, pero cambiar de idea debe costar una decisión explícita, no un drift silencioso.
