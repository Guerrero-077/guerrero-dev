# Fase 5 — Project Intelligence: Mapa (diseño, sin código)

**Estado:** Congelado para commit (revisado y ajustado tras la ronda de
revisión de Santiago). No autoriza implementación todavía — mismo
criterio que cada subfase de Fase 4: alcance y criterios de aceptación
definidos antes de escribir código. Este mapa **no es permiso implícito**
para implementar 5.1–5.9 de una sola vez: cada subfase necesita su propio
diseño específico antes de empezar.
**Precede a:** `docs/fase-4-memory-engine-closure.md` (`8003f1b`, Fase 4 CLOSED).
**Basado en auditoría real de** `8003f1b` — no en arquitectura imaginaria.
Ver §0 para el resumen de esa auditoría.

---

## 0. Punto de partida real (auditoría de `8003f1b`)

Antes de diseñar, esto es lo que existe hoy, verificado leyendo el código,
no la documentación de Fase 3:

```text
packages/project-intelligence/   stub literal de Fase 3 (un archivo, una constante)
domain/project/Project.ts        { id, name, path, createdAt, updatedAt } — solo identidad
application/analysis/            AnalysisService: placeholder, siempre "not_analyzed"
application/projects/             CRUD puro (Add/Get/List) sobre IProjectRepository
agent-core/ContextBuilder.ts     TODO literal: "incorporar memoria semántica y contexto de proyecto"
infrastructure/filesystem/       placeholder, sin lectura/listado/watch implementado
infrastructure/git/               real (Fase 4.8): GitCommitCollector, GitHistorySource, parsers
database: tabla `projects`       solo id/name/path/timestamps, sin columnas de representación
```

Hallazgo de proceso: `docs/fase-a-auditoria.md` ya registró una vez que se
confundió trabajo de Fase 4.8 con "Fase 5 en progreso". La recomendación
de ese documento era no tocar Fase 5 hasta cerrar lo anterior — ya cerrado
en `8003f1b`, así que no hay bloqueo, pero es la razón para mantener el
mismo rigor aquí.

Hallazgo de alineación: el roadmap original (`docs/fase-3-foundation.md`,
"Siguiente paso") ya separaba `FASE 5 → Project Intelligence` de
`FASE 6 → Code Intelligence` como fases distintas — el límite que excluye
AST/grafo/RAG de Fase 5 (§2 de este documento) coincide con ese roadmap,
no lo contradice. Una línea suelta del mismo documento describe
`project-intelligence/` como "AST/grafo/RAG (Fase 5-6)", mezclando ambas
fases en un comentario de estructura de carpetas — imprecisión heredada,
corregida aquí: Fase 5 no incluye AST/grafo/RAG.

## 1. Objetivo de Fase 5

Que Guerrero Dev pueda responder, para un proyecto dado, sin ejecutar
ningún LLM y sin analizar el contenido semántico del código:

> ¿Qué es este proyecto, de qué está hecho, y cómo está organizado?

No "puede listar archivos" — **una representación estructurada y
consultable** que `ContextBuilder` (agent-core) pueda inyectar como
contexto de proyecto en cada `AgentTask`, sustituyendo el TODO que ya
existe ahí. El objetivo se considera cumplido cuando ese TODO se resuelve
con datos reales de un proyecto real (`guerrero-dev` mismo, dogfooding),
no con un fixture sintético.

## 2. Límites

**Dentro de Fase 5:**

```text
Project Intelligence
        │
        ├── descubrimiento del proyecto (qué archivos/carpetas existen)
        ├── estructura (monorepo, apps/packages, capas)
        ├── tecnologías (lenguajes, frameworks, package managers, runtime)
        ├── componentes/proyectos (sub-proyectos dentro de un monorepo)
        ├── configuración relevante (tsconfig, workspace config, CI)
        ├── dependencias (declaradas, no resueltas transitivamente)
        ├── relaciones de alto nivel (qué depende de qué, a nivel de paquete)
        └── representación consultable (persistida, con contrato de lectura)
```

**Explícitamente fuera:**

```text
❌ análisis profundo de código (AST, símbolos, grafo de llamadas)  → Fase 6
❌ ejecución de herramientas                                        → Agent/Execution
❌ integración Cline/OpenCode                                       → Fase 7
❌ razonamiento LLM sobre arquitectura ("qué convención sigue esto") → Fase 6+
❌ memoria avanzada no especificada                                 → Memory Engine, no aquí
❌ escritura automática de MemoryCandidate desde Project Intelligence → ver §9, diferido explícito
❌ filesystem watch / indexación incremental en tiempo real         → sin evidencia todavía, ver §6
❌ queryProject(...) de forma libre                                  → sin segundo consumidor real, ver §7
```

La pregunta "¿dónde debería modificar algo?" (de la lista original de
preguntas para Agent Core) cruza a Fase 6 — Fase 5 puede decir "el backend
vive en `apps/api`", no "la ruta que maneja auth está en la línea 40 de
`server.ts`". Frontera:

```text
Fase 5 → ¿qué es / cómo está organizado?
Fase 6 → ¿qué hace el código / dónde está / cómo se relaciona?
```

## 3. Modelo conceptual — qué es persistente y qué es derivable

**Decisión central de esta fase:** todo lo que produce Project
Intelligence es, por definición, **derivable/reconstruible** — se puede
volver a calcular re-escaneando el proyecto. Esto es categóricamente
distinto de Memory (§9), donde una `Memory` puede representar una decisión
que ya no está en ningún archivo (por ejemplo, *por qué* se descartó una
alternativa).

**Precisión de semántica (congelada):** `ProjectProfile` no es una verdad
absoluta sobre el proyecto. Es **el último snapshot derivado conocido del
proyecto, a partir de las fuentes inspeccionadas en el momento del
escaneo**. `scannedAt` no es un timestamp técnico decorativo — es parte
del significado del modelo: no dice "esto es lo que el proyecto es", dice
"esto es lo que pudimos determinar cuando lo escaneamos". Cualquier
consumidor (`ContextBuilder`, y eventualmente Fase 6/7) debe tratar el
perfil como una inferencia con fecha, no como hecho garantizado.

Consecuencia directa: Project Intelligence **no necesita** el ciclo de
vida de `MemoryStatus` (`candidate → active → superseded → archived`).
Necesita únicamente "el estado conocido más reciente" + "cuándo se
escaneó por última vez" (staleness). No hay evidencia todavía de que se
necesite histórico de cómo cambió la estructura de un proyecto en el
tiempo — si aparece esa necesidad real, es Memory quien la cubre (un
`fact` puede decir "en 2026-08 este proyecto migró de X a Y"), no una
segunda tabla de versiones dentro de Project Intelligence. Mismo
criterio que Fase 4 aplicó a `memory_events`/`memory_versions`: no se
crean sin evidencia de que hacen falta.

**Forma propuesta de la representación** (`ProjectProfile`, nombre
provisional):

```text
ProjectProfile
 ├── schemaVersion       (entero — ver nota de versionado abajo)
 ├── projectId           (FK a Project — identidad ya existe, no se toca)
 ├── scannedAt            (semántica de inferencia con fecha, no metadato técnico — ver arriba)
 ├── technologies[]       (con evidencia — ver §3b, requisito contractual, no opcional)
 ├── components[]         (sub-proyectos: nombre, path relativo, tipo — apps/api, packages/domain, etc.)
 ├── configuration{}      (hallazgos de config relevante: workspace tool, CI presente, etc.)
 ├── dependencies[]       (declaradas por componente, no resueltas transitivamente)
 └── structure            (árbol de alto nivel: carpetas de primer/segundo nivel, no el filesystem completo)
```

`Project` (dominio, Fase 3) se queda como identidad pura —
`name`/`path`/timestamps, sin tocar su contrato existente. No se
convierte en algo como `Project { ...technologies, dependencies,
structure }` — eso mezclaría identidad con snapshot de inteligencia.
`ProjectProfile` es una entidad nueva, separada, relacionada por
`projectId` — mismo principio de separación de responsabilidades que
Memory Engine ya aplicó (`Memory` vs `MemorySource` vs `MemoryEmbedding`
como conceptos distintos en vez de una tabla que lo intenta guardar
todo).

**Por qué no un array plano de "todo el filesystem":** el riesgo es real
— sin este límite, `structure` tiende a crecer hasta ser un espejo
completo del árbol de archivos. Límite propuesto: `structure` captura
organización (carpetas de alto nivel, cuáles son "componentes"), no una
lista exhaustiva de archivos. Si Agent Core necesita saber si existe un
archivo específico, esa es una pregunta de Fase 6 (o una llamada directa
a filesystem en el momento), no algo que Project Intelligence deba
precomputar y guardar.

### 3a. `schemaVersion` — versionado de esquema, no versionado histórico

`project_profiles` guarda una sola fila vigente por proyecto (§5) — no
hay bitácora de perfiles pasados. Pero el **esquema** del JSON (qué
campos tiene `ProjectProfile`) puede evolucionar cuando Fase 6 necesite
representar algo nuevo. Sin un `schemaVersion` explícito dentro del JSON,
un cambio de forma futuro dejaría filas viejas con una estructura
desconocida y sin forma de distinguirlas. `schemaVersion: 1` en este
documento congela la v1 — no implica crear `project_profile_versions` ni
ningún tipo de historial; es exclusivamente una marca de compatibilidad
de forma, análoga a `provider`/`model`/`dimensions` en
`memory_embeddings` (Fase 4.5), que tampoco implementó versionado
completo, solo lo mínimo para no quedar ciego ante un cambio futuro.

### 3b. Evidencia — requisito contractual, no característica opcional

`technologies[]` debe registrar **por qué** se detectó cada tecnología,
no solo el nombre. Conceptualmente (el tipo exacto se congela en 5.1, no
aquí):

```text
TechnologyEvidence {
  name: string;                                                    // "Fastify"
  category: "language" | "framework" | "runtime" | "package_manager";
  sourceFile: string;    // "apps/api/package.json" — relativo, ver §4
  evidence: string;      // "dependencies.fastify"
}
```

En vez de `technologies: ["Fastify"]`. Razón: cuando el agente afirme
"este proyecto usa Fastify", debe poder trazarse por qué Project
Intelligence llegó a esa conclusión — mismo enfoque determinista y
trazable que ya se usó en Fase 4.8 (`DeterministicCommitNoiseFilter`,
`DeterministicCandidateExtractor`: cada decisión con su regla y su
evidencia, nunca una afirmación sin origen).

## 4. Fuentes de información

**Decisión:** la fuente primaria es `git ls-files` (vía un adapter nuevo,
`listTrackedFiles` o similar), no un filesystem walk crudo.

Razón: `infrastructure/git/` ya existe con maquinaria real de Fase 4.8
(`GitCommitCollector`, `GitHistorySource`), aunque orientada a historial
de commits, no al estado actual del árbol — se necesita un adapter nuevo
y angosto, no reutilizar esas clases tal cual. La ventaja sobre un
filesystem walk: `git ls-files` respeta `.gitignore` automáticamente (no
hay que reimplementar esa lógica para evitar indexar `node_modules/`,
`dist/`, etc. — el mismo problema que Fase 4.8.x ya resolvió para commits
con `DeterministicCommitNoiseFilter`, aquí se evita de raíz).

**Contrato congelado para 5.2: rutas relativas al root del proyecto, no
absolutas.** `listTrackedFiles` debe devolver rutas como
`apps/api/src/index.ts`, nunca `C:\Dev\agente\guerrero-dev\apps\api\src\index.ts`.
Esto hace que `ProjectProfile` sea portable (no depende de dónde está
clonado el repo en disco), reproducible (los tests no dependen de una
ruta absoluta específica), independiente de Windows/Linux (sin mezclar
separadores `\`/`/`), y mucho más fácil de comparar/testear. Este
requisito entra explícitamente en el contrato de 5.2, no queda implícito.

**Limitación conocida, aceptada explícitamente:** un proyecto sin `.git`
inicializado no tiene nada que listar por esta vía. No se resuelve en
Fase 5 v1 con un fallback a filesystem — no hay evidencia todavía de que
Guerrero Dev vaya a operar sobre proyectos sin control de versiones.
Documentado como limitación conocida, mismo criterio que
`RiskSignal`/`ConflictDetector` en Fase 4: no se construye sin caso real
que lo justifique.

**Lectura de contenido (subfase propia — ver §10):** una vez
identificados los archivos relevantes (`package.json`,
`pnpm-workspace.yaml`, `tsconfig*.json`, lockfiles, `Dockerfile`,
manifiestos de otros ecosistemas), se leen directamente por path. Esto
**no** requiere que `infrastructure/filesystem/` deje de ser un
placeholder para listar/watchear; solo necesita una función de lectura
puntual (`readFile`), mucho más angosto que lo que ese módulo promete en
su comentario actual ("lectura, listado, watch"). Se le da subfase propia
(5.3) en vez de dejarla implícita dentro de la detección de tecnologías
— la lección de `CommitCollector` en Fase 4.8 fue precisamente que una
pieza de infraestructura tratada como "detalle menor" dentro de otra
subfase termina apareciendo a medio implementar cuando ya se está
construyendo lo que depende de ella.

**Detección de tecnologías:** basada en reglas deterministas sobre
archivos de manifiesto conocidos (existencia de `package.json` →
Node/TypeScript candidato; `"fastify"` en `dependencies` → Fastify;
`pnpm-workspace.yaml` → monorepo pnpm; etc.) — mismo enfoque que
`DeterministicCommitNoiseFilter`/`DeterministicCandidateExtractor` en
Fase 4.8: reglas explícitas con evidencia adjunta (§3b), no heurísticas
basadas en LLM. Válido para v1; si el golden-dataset de proyectos reales
muestra falsos negativos sistemáticos, se revisita con evidencia — mismo
criterio aplicado en 4.8.x al filtro de ruido.

## 5. Representación / persistencia

**Esquema propuesto:** una tabla nueva, `project_profiles`, con
`project_id` (FK, único — un perfil vigente por proyecto, no histórico) y
columnas `JSONB` para `technologies`, `components`, `configuration`,
`dependencies`, `structure`, más `scanned_at` y `schema_version` (ver
§3a; puede vivir como columna propia o dentro del JSON — decisión de
5.6, no de este mapa).

**Por qué JSONB y no completamente normalizado:** a diferencia de Memory
(que necesita integridad relacional para deduplicación, relaciones
`contradicts`/`supersedes`, y consultas por similitud vectorial),
`ProjectProfile` se lee como una unidad completa (`ContextBuilder` lo
inyecta entero en el contexto) y se escribe como una unidad completa (un
re-scan reemplaza todo el perfil, no hace UPDATE incremental campo por
campo). No hay evidencia todavía de necesitar `WHERE technologies @>
'["fastify"]'` a nivel SQL — si aparece esa necesidad real (por ejemplo,
Fase 6 quiere "todos los proyectos que usan X"), se decide entonces con
el caso real delante, mismo criterio que Fase 4 aplicó repetidamente
(pesos de ranking, versionado de embeddings, etc.: puntos de partida, no
diseño anticipado).

**Una fila por proyecto, no histórico:** consistente con §3 — esto es un
snapshot vigente, no una bitácora. Si se necesita saber "cómo era la
estructura hace un mes", eso es una pregunta para Memory (si alguien la
consideró relevante y la guardó como `fact`), no para Project
Intelligence.

## 6. Indexación y actualización — `scan` vs `get`, sin ambigüedad

**Corrección respecto al borrador anterior:** la versión previa mezclaba
tres conceptos distintos (`scan`, `refresh` con umbral de 24h, y `read`)
bajo la etiqueta "on-demand". Se separan de forma explícita y se congela
así:

```text
scan(projectId)
    │  Operación explícita que produce/reemplaza el ProjectProfile.
    ▼
Git → ProjectProfileScanner (detectores) → ProjectProfile → Postgres (UPSERT)

getProjectProfile(projectId)
    │  Operación de solo lectura. Nunca escanea, nunca tiene efectos secundarios.
    ▼
Postgres → ProjectProfile | null
```

**`ContextBuilder` nunca escanea.** Consume exclusivamente
`getProjectProfile()` (§7/§8). Que una operación de lectura del Agent
Core dispare, aunque sea indirectamente, un escaneo con I/O de filesystem
y escritura en PostgreSQL sería mezclar una consulta con un efecto
secundario costoso — se descarta explícitamente.

**El umbral de "re-scan si `scannedAt` tiene más de 24h" queda fuera del
contrato de v1.** No está medido (el propio criterio de Fase 4 es no
inventar números sin evidencia — mismo caso que los pesos de
`MemoryCandidateScorer` o los defaults de `MemoryRanker`). Quién decide
cuándo escanear (CLI explícito, un futuro trigger automático, etc.) es
una decisión de la subfase 5.7 (scan service), no de este mapa. Lo único
congelado aquí es que `scan` y `get` son operaciones separadas, y que
`get` jamás escanea por su cuenta.

No hay watch/indexación incremental en tiempo real — eso exigiría que
`infrastructure/filesystem/` implemente watch de verdad, fuera de alcance
sin evidencia de que el costo de un re-scan completo sea un problema
real.

## 7. Consulta

**Superficie mínima, no la lista completa de getters especulativos.**
Un único método de lectura para v1:

```typescript
getProjectProfile(projectId: string): Promise<ProjectProfile | null>
```

No `getTechnologies()`, `getStructure()`, etc. por separado todavía —
mismo criterio que el contrato congelado de `IMemoryCandidateScorer` en
Fase 4.7: una interfaz angosta hasta que un segundo consumidor real
demuestre que necesita accesos parciales. Si `ContextBuilder` solo
necesita "el perfil completo del proyecto para inyectarlo en el prompt",
no hay razón para exponer más superficie que esa.

`queryProject(...)` (de la propuesta original) queda explícitamente fuera
de Fase 5 — implica algún tipo de lenguaje de consulta o razonamiento
sobre la representación, que no tiene sentido antes de que exista un
segundo consumidor con preguntas concretas. Se revisita cuando Fase 6/7
tengan un caso real.

## 8. Contrato hacia Agent Core

Puerto nuevo en `application/common/ports/`, **estrictamente de lectura**:

```typescript
interface IProjectIntelligenceProvider {
  getProjectProfile(projectId: string): Promise<ProjectProfile | null>;
}
```

Deliberadamente **no** incluye `scanProject()`, `refreshProject()`,
`analyzeProject()` ni ningún método que dispare construcción del perfil
— eso es responsabilidad de un servicio de aplicación separado (§8a), no
del puerto que consume Agent Core. Agent Core es consumidor del perfil,
no dueño del proceso de indexación:

```text
Project Intelligence application service
        │
        └── scan(projectId)     ← construye/reemplaza el ProjectProfile

Agent Core
        │
        └── IProjectIntelligenceProvider
                 │
                 └── getProjectProfile(projectId)   ← solo lee
```

Consumido directamente por `ContextBuilder.build()` — reemplaza la mitad
del TODO existente ("...y contexto de proyecto"; la mitad de memoria
semántica es aparte, de Fase 4/Memory, no de este documento). No se
decide todavía el formato exacto de cómo el `ProjectProfile` se convierte
en texto dentro del `systemPrompt` — eso depende de cómo responda el LLM
en Fase 7, y no hay LLM real conectado todavía para validarlo con
evidencia. Se deja como decisión pendiente explícita, no como
implementación especulativa.

### 8a. Quién construye `ProjectProfile` — responsabilidad explícita

Pieza que faltaba en el borrador anterior: un componente nombrado,
responsable exclusivamente de construir el perfil, separado de quien lo
persiste y separado de quien lo expone a Agent Core:

```text
ProjectProfileScanner
        │
        ├── tracked files          (§4 — listTrackedFiles)
        ├── manifest readers       (§4 — readFile puntual)
        ├── technology detectors   (§4 — reglas deterministas + evidencia)
        ├── component detector
        └── structure detector
                │
                ▼
          ProjectProfile
                │
                ▼
 IProjectIntelligenceRepository    (persistencia — UPSERT en project_profiles)
                │
                ▼
 IProjectIntelligenceProvider      (solo lectura, consumido por ContextBuilder)
                │
                └── repository.get()
```

`ProjectProfileScanner` no persiste directamente — recibe/usa el
repositorio para guardar, pero la detección (pura, sin PostgreSQL) queda
separada de la persistencia, mismo principio que Fase 4.7 separó
`MemoryCandidateEvaluator` (puro) de `MemoryCandidatePromoter`
(transaccional).

## 9. Integración con Memory Engine

Frontera confirmada, con el ejemplo ya usado en la conversación:

```text
"guerrero-dev usa TypeScript + pnpm + Fastify"        → Project Intelligence (derivable, re-escaneable)
"En Fase 4 usamos Ollama por ejecución local con GPU"  → Memory (decisión, no reconstruible del filesystem)
```

**Decisión explícita: Project Intelligence NO escribe `MemoryCandidate`
en Fase 5 v1.** Conectar un segundo productor al pipeline de Fase 4
(`Detection → Evaluation → Promotion`) es una extensión arquitectónica
real — ese pipeline se diseñó y probó contra Git como única fuente
(Fase 4.8/4.9); añadir Project Intelligence como fuente alternativa
exige decidir cosas que hoy no están decididas (¿un cambio de stack
detectado genera un candidato automáticamente? ¿con qué confianza?) y no
hay presión funcional real todavía que lo justifique. Se documenta como
diferido, no como pendiente, mismo criterio que `RiskSignal` en Fase 4.

**Consecuencia directa sobre la tabla de diferidos de Fase 4:**

| Diferido de Fase 4 | ¿Depende de Fase 5 v1? |
|---|---|
| `RiskSignal` producers | 🟢 No — Project Intelligence no toca `CandidateExtractionResult` en v1 |
| `ConflictDetector` real | 🟢 No — Project Intelligence no escribe en Memory en v1, no hay escritura concurrente nueva |
| Embedding en promoción (gap operacional) | 🟢 No bloquea Fase 5 — pero se conserva como **riesgo operacional activo de Fase 4**, no se degrada a "deferred" simple: una `Memory` promovida por el camino actual puede quedar sin `MemoryEmbedding`, invisible para retrieval híbrido hasta que exista reindexado. Fase 5 no lo activa (no promueve memorias), pero si una futura iteración conecta Project Intelligence a Memory, este riesgo pasa a ser directamente relevante — ver condición de reapertura abajo. |

Los tres quedan confirmados como no-bloqueantes para Fase 5 v1, con razón
concreta en vez de "por determinar". **Condición de reapertura única
para los tres:** si una iteración futura conecta Project Intelligence a
Memory (por ejemplo, "avisar cuando el stack detectado cambia respecto al
último perfil conocido" generando un `MemoryCandidate`), esa es la señal
para revisar esta tabla completa — no antes.

## 10. Subfases propuestas (implementación, todavía no autorizada)

Solo como mapa de descomposición — cada una necesita su propio contrato +
decisiones + criterios de aceptación + tests + integración real +
commit independiente antes de empezar la siguiente, mismo criterio que
Fase 4. `readFile` (filesystem) recibe subfase propia (5.3) en vez de
quedar implícita — ver razón en §4.

```text
5.1  Domain: ProjectProfile (entidad) + tipos de soporte + TechnologyEvidence
5.2  Git tracked-files source (listTrackedFiles, rutas relativas — contrato en §4)
5.3  Filesystem readFile (lectura puntual de manifiestos — sin listado/watch)
5.4  Detección determinista de tecnologías (reglas + evidencia obligatoria — §3b)
5.5  Detección de componentes + estructura (sub-proyectos en monorepo)
5.6  Persistencia: migración project_profiles + IProjectIntelligenceRepository
5.7  Scan application service (ProjectProfileScanner + orquestación) + IProjectIntelligenceProvider
5.8  Integración real con ContextBuilder (agent-core) — solo lectura, ver §6/§8
5.9  End-to-end contra guerrero-dev real (dogfooding — ver §11)
```

El orden importa: 5.1–5.5 son puros/deterministas (sin PostgreSQL), igual
que Fase 4.7 separó evaluación pura de promoción transaccional. 5.6 recién
introduce persistencia real. 5.9 cierra igual que 4.9 — contra
infraestructura real, no contra fixtures sintéticos.

## 11. Dogfooding — obligatorio, no opcional

`guerrero-dev` (este mismo repositorio) es el caso de prueba de 5.9, no
un `FakeProject` sintético:

```text
guerrero-dev
    ↓
git ls-files
    ↓
detectors (con evidencia)
    ↓
ProjectProfile
    ↓
Postgres
    ↓
ContextBuilder
```

Las aserciones de 5.9 deben verificar hechos concretos ya conocidos de
este repo, no solo `expect(profile).toBeDefined()`:

```text
TypeScript                ✅
pnpm                       ✅
Fastify                    ✅
monorepo                   ✅
apps/api                   ✅
packages/application       ✅
packages/domain             ✅
packages/infrastructure    ✅
```

Si el detector no identifica algo que sabemos que existe, el problema es
del detector, no del fixture — mismo nivel de evidencia exigido en Fase
4.8/4.9.

## 12. Criterios de cierre de Fase 5 (v1)

```text
☐ ProjectProfile modelado y con al menos un escaneo real de guerrero-dev
  produciendo resultados correctos (verificados a mano contra lo que
  sabemos que es cierto de este repo — ver §11)
☐ technologies[] con evidencia trazable (sourceFile + evidence) en el
  100% de las entradas, no solo en las de ejemplo
☐ Persistencia real contra PostgreSQL (no fake), migración versionada,
  con schemaVersion presente en el perfil persistido
☐ scan y getProjectProfile verificados como operaciones separadas —
  getProjectProfile no dispara I/O de filesystem ni escritura en Postgres
☐ IProjectIntelligenceProvider consumido de verdad por ContextBuilder,
  no solo definido como contrato
☐ Build + typecheck + lint + tests unitarios + tests de integración reales
☐ Repetibilidad: correr scan() dos veces sobre el mismo proyecto no
  duplica ProjectProfile, componentes ni tecnologías — UPSERT verificado
  contra PostgreSQL real, mismo criterio que la repetibilidad exigida en
  Fase 4.9 (A/B/C/D corridas múltiples sin residuo)
☐ Staleness verificable: tras un scan, scannedAt queda actualizado y el
  perfil anterior queda reemplazado — demostrado contra Postgres real,
  sin necesidad de resolver todavía la política de "cuándo" volver a
  escanear (eso es 5.7, no un criterio de cierre de v1)
☐ Diferidos de Fase 4 revisados contra el resultado real (confirmar que
  la tabla de §9 sigue siendo cierta después de implementar, no solo en
  el diseño)
☐ Documento de cierre análogo a docs/fase-4-memory-engine-closure.md
```

Explícitamente fuera del criterio de cierre de v1: AST/grafo/código
(Fase 6), watch en tiempo real, `queryProject` de forma libre, política
de staleness automática (umbral de re-scan), y cualquier escritura
automática hacia Memory.

---

Este mapa no autoriza ningún commit de código. El siguiente paso, si se
acepta este documento, es 5.1 — mismo patrón que cada subfase de Fase 4:
diseño de esa subfase específica, antes de escribir su código.
