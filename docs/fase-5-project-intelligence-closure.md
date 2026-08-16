# Fase 5 — Project Intelligence

## Estado: CLOSED

Cierre formal de Fase 5, siguiendo el mismo criterio de rigor que
`docs/fase-4-memory-engine-closure.md`: este documento captura el estado
final verificado tras la última subfase (5.9), no una fotografía tomada
antes del último cambio. Toda la evidencia de este documento fue
re-verificada en el mismo turno en que se escribió, contra Git real y
PostgreSQL real, no reconstruida de memoria de checkpoints anteriores.

## 1. Objetivo de la fase

Que Guerrero Dev pueda responder, para un proyecto dado, sin ejecutar
ningún LLM y sin analizar el contenido semántico del código:

> ¿Qué es este proyecto, de qué está hecho, y cómo está organizado?

Una representación estructurada y consultable (`ProjectProfile`) que
`ContextBuilder` (agent-core) pueda inyectar como contexto de proyecto,
sustituyendo la mitad del `TODO` que existía ahí desde Fase 3
("incorporar memoria semántica y contexto de proyecto"). El objetivo se
consideró cumplido con datos reales de `guerrero-dev` (dogfooding), no
con fixtures sintéticos — ver §5.

## 2. Alcance aprobado

**Dentro de Fase 5:**

```text
descubrimiento del proyecto (qué archivos/carpetas existen, vía Git)
estructura (monorepo, apps/packages, carpetas de nivel 1/2)
tecnologías (lenguajes, frameworks, package managers, runtime) con evidencia obligatoria
componentes (sub-proyectos dentro de un monorepo)
representación consultable (persistida en PostgreSQL, con contrato de lectura)
```

**Explícitamente fuera** (ver docs/fase-5-project-intelligence-map.md §2):

```text
análisis profundo de código (AST, símbolos, grafo de llamadas)  → Fase 6
integración Cline/OpenCode                                       → Fase 7
razonamiento LLM sobre arquitectura                               → Fase 6+
escritura automática de MemoryCandidate desde Project Intelligence → diferido, ver §7
filesystem watch / indexación incremental en tiempo real          → sin evidencia, no construido
queryProject(...) de forma libre                                  → sin segundo consumidor, no construido
```

## 3. Arquitectura final

```text
IGitTrackedFilesSource (5.2)
        │
        ├── trackedFiles ──────────────────────────────┐
        │                                               │
IComponentStructureDetector (5.5)                        │
        │                                               │
        ├── structure[]                                  │
        └── components[]                                 │
                                                          │
IPackageManifestReader (5.4, compone IFileReader 5.3)     │
        │                                               │
        ▼                                               │
ITechnologyDetector (5.4)                                 │
        │                                               │
        ├── technologies[] ◄────────────────────────────┘
        │
        ▼
ProjectProfileScanner (5.7)
        │
        ▼
IProjectIntelligenceRepository (5.6, UPSERT en project_profiles)
        │
        ▼
IProjectIntelligenceProvider (5.7, solo lectura)
        │
        ▼
ContextBuilder (5.8, agent-core)
        │
        ▼
systemPrompt provisional (tecnologías + componentes)
```

`ProjectProfile`/`Technology`/`ProjectComponent`/`ProjectDependency` (dominio,
5.1) no cambiaron desde su congelación inicial — cero modificaciones al
contrato de dominio a lo largo de 5.2-5.9.

## 4. Estado por subfase

| Subfase | Contenido | Commit |
|---|---|---|
| 5.1 | Dominio: `ProjectProfile`, `Technology`, `ProjectComponent`, `ProjectDependency`, invariantes | `83adc17` |
| 5.2 | `IGitTrackedFilesSource` / `GitTrackedFilesSource` (`git ls-files -z`) | `4741f53` |
| 5.3 | `IFileReader` / `FileReader` (lectura puntual, protección contra path traversal) | `1b3e044` |
| 5.4 | `IPackageManifestReader`, `ITechnologyDetector` / `DeterministicTechnologyDetector` | `03dfb7b` |
| 5.5 | `IComponentStructureDetector` / `DeterministicComponentStructureDetector` | `eebec1f` |
| 5.6 | Persistencia: `project_profiles` (migración 0004), `IProjectIntelligenceRepository` / `DrizzleProjectIntelligenceRepository` | `e27192c` |
| 5.7 | `IProjectProfileScanner` / `ProjectProfileScanner`, `IProjectIntelligenceProvider` / `ProjectIntelligenceProvider` | `389b412` |
| 5.8 | `ContextBuilder` consume `IProjectIntelligenceProvider`; `AgentOrchestrator` inyecta `ContextBuilder` | `e3257a3` |
| 5.9 | Acceptance test de §12 + este documento de cierre | (commit de este documento) |

## 5. Evidencia de verificación — matriz criterio → evidencia → test → estado

| # | Criterio (mapa §12) | Evidencia | Test | Estado |
|---|---|---|---|---|
| 1 | `ProjectProfile` con ≥1 escaneo real, resultados correctos verificados a mano | Scan real contra este repo: 17 `technologies`, 12 `components`, 25 `structure`, inspeccionados a mano contra hechos conocidos (§6) | `project-profile-scanner.test.ts`, `fase-5-acceptance.test.ts` | ✅ |
| 2 | `technologies[]` con evidencia trazable en el 100% de las entradas | `isValidTechnology` sobre las 17 tecnologías del scan real: 0 inválidas | `fase-5-acceptance.test.ts` (assertion directa sobre el scan real, no solo fixtures) | ✅ |
| 3 | Persistencia real contra PostgreSQL, migración versionada, `schemaVersion` presente | `schemaVersion === 1` leído vía `findByProjectId` desde PostgreSQL, no del retorno de `scanProject()` | `project-intelligence-repository.test.ts`, `fase-5-acceptance.test.ts` | ✅ |
| 4 | `scan`/`getProjectProfile` separados — `get` nunca hace I/O de filesystem/Git/escritura | `ProjectIntelligenceProvider` solo puede inyectar `IProjectIntelligenceRepository` — no puede alcanzar Git/filesystem por construcción del tipo | `ProjectIntelligenceProvider.test.ts` | ✅ |
| 5 | `IProjectIntelligenceProvider` consumido de verdad por `ContextBuilder` | `ContextBuilder` lo requiere en el constructor, lo llama en cada `build()` | `ContextBuilder.test.ts` (con provider fake — ver §9 sobre la cadena completa) | ✅ |
| 6 | Build + typecheck + lint + unit + integración reales | Ver §8, comandos y salidas reales de este cierre | todos | ✅ |
| 7 | Repetibilidad — `scan()` dos veces no duplica | Segundo scan preserva `id`, `COUNT(*) = 1` verificado por SQL directo antes y después | `project-intelligence-repository.test.ts`, `fase-5-acceptance.test.ts` | ✅ |
| 8 | Staleness — `scannedAt` se actualiza, perfil anterior reemplazado | `scannedAt` del segundo scan ≥ el del primero, verificado contra Postgres real | `project-profile-scanner.test.ts`, `fase-5-acceptance.test.ts` | ✅ |
| 9 | Diferidos de Fase 4 (§9 del mapa) siguen ciertos tras implementar | `grep` de `Memory`/`RiskSignal`/`ConflictDetector`/`MemoryCandidate` en todo `project-intelligence/`: cero referencias de código real, solo 3 comentarios citando Memory Engine como precedente de estilo | — (verificación de ausencia) | ✅ |
| 10 | Documento de cierre análogo a `fase-4-memory-engine-closure.md` | Este documento | — | ✅ |

## 6. Dogfooding real — hechos verificados contra `guerrero-dev`

Scan real ejecutado contra este mismo repositorio (commit `e3257a3` +
el test de aceptación), verificado a mano:

```text
technologies (17, 0 inválidas):
  pnpm        <- pnpm-workspace.yaml :: file exists
  pnpm        <- package.json        :: packageManager
  TypeScript  <- package.json        :: devDependencies.typescript
  Node.js     <- package.json        :: engines.node
  Fastify     <- package.json        :: devDependencies.fastify
  TypeScript  <- apps/api/package.json      :: devDependencies.typescript
  Fastify     <- apps/api/package.json      :: dependencies.fastify
  TypeScript  <- apps/cli/package.json      :: devDependencies.typescript
  TypeScript  <- packages/{agent-core,application,domain,execution,
                 infrastructure,mcp,memory,project-intelligence,shared}/package.json

components (12, 0 inválidos):
  apps/api (app), apps/cli (app), apps/web (app)
  packages/{agent-core,application,domain,execution,infrastructure,
            mcp,memory,project-intelligence,shared} (package)

structure (25 entradas de nivel 1/2):
  .github, .github/workflows, apps, apps/api, apps/cli, apps/web,
  docker, docker/postgres, docs, docs/adr, docs/benchmarks,
  packages, packages/{...9 paquetes...}, scripts, tests,
  tests/e2e, tests/integration
```

Coincide exactamente con lo que el mapa (§11) exigía verificar: TypeScript,
pnpm, Fastify, monorepo, `apps/api`, `packages/application`,
`packages/domain`, `packages/infrastructure` — todos presentes y con
evidencia trazable.

## 7. Diferidos de Fase 4 — confirmados ciertos tras implementar (§9 del mapa)

| Diferido de Fase 4 | ¿Depende de Fase 5? | Confirmación tras implementar |
|---|---|---|
| `RiskSignal` producers | 🟢 No | Project Intelligence nunca importa `RiskSignal` ni `CandidateExtractionResult` |
| `ConflictDetector` real | 🟢 No | Project Intelligence nunca escribe en `IMemoryRepository` ni ningún puerto de Memory |
| Gap de `MemoryEmbedding` en promoción | 🟢 No activado | Project Intelligence no promueve memorias — el riesgo operacional sigue siendo de Fase 4, sin cambios |

Condición de reapertura (mapa §9): si una iteración futura conecta
Project Intelligence a Memory (p. ej., generar un `MemoryCandidate` cuando
el stack detectado cambia respecto al último perfil conocido). **No
ocurrió en 5.1-5.9** — `dependencies[]`/`configuration{}` de
`ProjectProfile` siguen vacíos por diseño (ver §8), y ningún componente de
Project Intelligence importa un tipo de Memory salvo en comentarios que
citan `CandidateDetectionService` como precedente de estilo de
orquestación, no como dependencia real.

## 8. Limitaciones deliberadamente aceptadas (decisiones de diseño, no defectos)

| Limitación | Origen | Razón |
|---|---|---|
| `apps/web` se detecta como componente pese a estar excluido en `pnpm-workspace.yaml` | 5.5 | Project Intelligence no interpreta el contenido de `pnpm-workspace.yaml` (decisión de 5.4: solo existencia, sin parsing YAML) — el componente se detecta por evidencia Git (`package.json` tracked), no por validación de configuración de workspace |
| `ProjectProfile.dependencies[]` vacío | 5.4/5.6 | Sin subfase que lo llene — decisión explícita de no ensanchar el alcance de 5.4 solo porque el parser ya tenía los datos a mano |
| `ProjectProfile.configuration{}` vacío | igual | mismo criterio |
| Sin política de staleness (umbral de "cuándo" re-escanear) | mapa §6 | Explícitamente fuera del contrato de v1 — `scan`/`get` quedan separados, pero nadie decide todavía cuándo invocar `scan` |
| Sin deduplicación semántica entre evidencias de `technologies[]` | 5.4 | "Una tecnología representa una evidencia concreta" — TypeScript declarado en 10 manifiestos produce 10 entradas, no 1 |
| `parsePackageManifest` no soporta JSONC (comentarios en `package.json`) | 5.4 | Ningún manifiesto real de este repo los tiene; sin evidencia de necesitarlo |

## 9. Deuda trasladada a fases posteriores

```text
BuiltContext descartado por AgentOrchestrator.run()     → Fase 7 (conectar con Planner/ejecución real)
Formato de systemPrompt no validado contra un LLM real  → Fase 7
AST / grafo de símbolos / RAG sobre código              → Fase 6 (packages/project-intelligence standalone, sin tocar)
```

### Corrección explícita sobre `tests/e2e/api.test.ts`

Los checkpoints de las subfases 5.3 a 5.8 reportaron repetidamente
`tests/e2e/api.test.ts` como **"fallo preexistente, no relacionado"**. Esa
afirmación era incorrecta y se corrige aquí formalmente: no era un defecto
del test ni una regresión de ningún código. Cada subfase compiló y
verificó únicamente los paquetes que tocaba (`application`,
`infrastructure`, etc.), sin ejecutar nunca `pnpm run build` para **todo**
el monorepo — por eso `apps/api/dist/server.js` nunca existía y el import
`@guerrero-dev/api/server` fallaba al cargar el módulo, no al ejecutar sus
aserciones. Verificado en el cierre de 5.9: tras `pnpm run build` completo,
`tests/e2e/api.test.ts` pasa **5/5, real, contra PostgreSQL real**. No hay
ningún fallo real asociado a este archivo en ningún punto de Fase 5.

### `pnpm run typecheck` no es reproducible desde un checkout limpio

`packages/application` falla con `TS6310` (`tsc -b --noEmit` rechaza
referencias a proyectos que sí emiten) si se ejecuta `pnpm run typecheck`
sin haber corrido `pnpm run build` antes. Verificado como **preexistente**
contra el commit base `7d64152` (anterior a cualquier código de Fase 5)
mediante `git stash` — no lo introdujo Project Intelligence. El
procedimiento de verificación correcto, documentado en §11, es
`pnpm run build && pnpm run typecheck`, no `pnpm run typecheck` de forma
aislada.

### Deuda de integración del workspace (no bloqueante)

```text
Scanner → Repository → PostgreSQL           ✅ verificado (5.7)
Provider → Repository → ProjectProfile       ✅ verificado (5.6/5.7)
ContextBuilder → Provider → ProjectProfile   ✅ verificado (5.8, con provider fake)
Scanner → PostgreSQL → Provider → ContextBuilder   ⚠️ no compuesto en un único test
```

`@guerrero-dev/agent-core` no está declarado en las `devDependencies` de
la raíz del workspace (a diferencia de `api`/`application`/`domain`/
`infrastructure`), así que ningún test en `tests/` puede importarlo hoy —
por eso no existe un test E2E que componga las cuatro piezas reales de
punta a punta. Cada frontera de esa cadena está verificada de forma
independiente (ver arriba); lo que falta es la composición en un único
test. Es deuda de integración del workspace, preexistente a Fase 5,
identificada aquí — **no bloquea el cierre**: no es un criterio explícito
de §12, y resolverla implicaría modificar la configuración de
dependencias del workspace solo para habilitar un test, no una necesidad
funcional real.

## 10. Comandos de verificación (reproducibles)

```bash
pnpm run build                                                     # obligatorio antes de typecheck
pnpm run typecheck
pnpm exec eslint .
pnpm run format:check
pnpm test                                                           # unitarios
RUN_INTEGRATION_TESTS=true pnpm exec vitest run tests/integration --no-file-parallelism
RUN_INTEGRATION_TESTS=true pnpm exec vitest run tests/e2e
```

**Resultado real de esta ejecución** (commit `e3257a3` + el commit de este
cierre, PostgreSQL 16 + pgvector real — ver nota de entorno abajo):

```text
build:               11/11 paquetes, sin errores
typecheck:            11/11 paquetes + tests/tsconfig.json, sin errores
eslint:               sin errores ni warnings
format:check:         sin violaciones
unit tests:          310 passed, 72 skipped, 0 failed
integration tests:    66 passed, 0 failed  (18 archivos)
e2e tests:              5 passed, 0 failed
```

**Nota de entorno:** en el entorno donde se ejecutó esta verificación,
Docker Hub estaba bloqueado por política de red de la sesión (403 al
intentar bajar `pgvector/pgvector:pg17`), así que no se pudo levantar
PostgreSQL vía `docker-compose.yml`. Se usó `postgresql-16` +
`postgresql-16-pgvector` del repositorio de paquetes de Ubuntu como
alternativa equivalente (mismo motor, misma extensión) — documentado ya
en el cierre de 5.6, reconfirmado aquí porque 5.9 volvió a ejecutar toda
la suite de integración contra esa misma instancia.

## 11. Criterio de cierre

> El alcance definido para Project Intelligence (5.1-5.8) fue implementado
> y verificado contra infraestructura real (Git, PostgreSQL). Los diez
> criterios de §12 del mapa están cumplidos con evidencia directa, no
> asumida — incluyendo una verificación de aceptación dedicada (5.9,
> `tests/integration/fase-5-acceptance.test.ts`) que corre contra el scan
> real de este mismo repositorio, no solo contra fixtures. Las
> limitaciones deliberadamente aceptadas (§8) y la deuda trasladada (§9)
> están documentadas explícitamente, no ocultas, y ninguna bloquea el
> objetivo de la fase.

Esto **no** significa que Project Intelligence esté terminado en sentido
absoluto: `dependencies[]`/`configuration{}` siguen vacíos, no hay
política de staleness, y el resultado del scan todavía no llega a
ejecutarse contra un LLM real. Cerrar Fase 5 significa que el alcance
definido para esta fase quedó cubierto y verificado, con sus fronteras
explícitas — igual que Fase 4.

## 12. Checkpoint Git

```text
Repositorio:  Guerrero-077/guerrero-dev
Rama:         claude/fase-5-doc-verification-zbeh3d
HEAD local:   (el commit de este documento, hijo directo de e3257a3)
origin:       sincronizado antes de este commit (sin diff con e3257a3)
Working tree: limpio (solo artefactos ignorados: dist/, node_modules/, *.tsbuildinfo)
```

Commits de la cadena de cierre de Fase 5:

```text
e3257a3 feat(agent-core): Fase 5.8 - ContextBuilder consume IProjectIntelligenceProvider
389b412 feat(application): Fase 5.7 - ProjectProfileScanner + Provider
e27192c feat(infrastructure): Fase 5.6 - persistencia de ProjectProfile
eebec1f feat(application): Fase 5.5 - deteccion de componentes y estructura
03dfb7b feat: Fase 5.4 - deteccion determinista de tecnologias
1b3e044 feat(infrastructure): Fase 5.3 - FileReader
4741f53 feat(infrastructure): Fase 5.2 - GitTrackedFilesSource
83adc17 feat(project): Fase 5.1 - modelo de dominio de ProjectProfile
7d64152 docs: Fase 5 - mapa de Project Intelligence (diseno, sin codigo)
```

## 13. Frontera hacia Fase 6/7

```text
Fase 6 → análisis profundo de código: AST, símbolos, grafo de llamadas,
         RAG sobre código. Vive en packages/project-intelligence
         (el paquete standalone, sin tocar durante Fase 5).
Fase 7 → LLM real conectado, Planner/AgentLoop/ToolSelector reales,
         BuiltContext conectado a la ejecución, formato definitivo de
         prompt validado con evidencia real, integración Cline/OpenCode.
```

Project Intelligence (Fase 5) entrega la representación estructurada del
proyecto; qué hace un LLM real con ella, y cómo se combina con análisis de
código más profundo, queda fuera de esta fase por diseño.
