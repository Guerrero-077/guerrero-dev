# Fase 4.1 — Memory Engine: diseño completo

**Estado:** Diseño aceptado (100%). Implementación en curso — ver orden en §10.
**Precede a:** `docs/fase-3-implementacion.md` (Foundation, cerrado en el commit `2e3240e`).

## Decisión central

La memoria es un subsistema de conocimiento con ciclo de vida, evidencia, confianza y
recuperación contextual. **pgvector es solamente una herramienta de búsqueda dentro de
ese subsistema** — no es el diseño en sí.

## 1. Modelo conceptual

No hay una única entidad `Memory`. Trabajamos con cinco conceptos (`Memory`, `Evidence`,
`Relation`, `Lifecycle`, `Retrieval`/`Context Builder`) más un sexto transversal,
`MemoryCandidate`, que decide qué información merece convertirse en memoria.

```text
                         MEMORY ENGINE
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
          ▼                   ▼                   ▼
       Memory             Evidence            Relation
          │                   │                   │
          ▼                   ▼                   ▼
      Lifecycle           Sources            Conflicts
          │
          ▼
      Retrieval
          │
          ▼
     Context Builder

MemoryCandidate  (transversal — controla qué se persiste)
```

## 2. Qué queremos recordar (`MemoryType`)

| Tipo | Qué es | Ejemplo |
|---|---|---|
| `fact` | Información verificable | "Miller utiliza PostgreSQL." |
| `decision` | Decisión arquitectónica | "Miller utiliza arquitectura modular." |
| `preference` | Preferencia del desarrollador | "Prefiere interfaces para desacoplar infraestructura." |
| `pattern` | Patrón observado | "Utiliza Repository + Service en 7/8 proyectos." |
| `experience` | Experiencia pasada | "Se solucionó un problema de concurrencia en RefreshTokenRepository." |
| `knowledge` | Conocimiento técnico adquirido | "Este proyecto utiliza JWT con refresh tokens rotativos." |

Esto separa "Miller usa PostgreSQL" (fact, scope project) de "Guerrero prefiere
PostgreSQL" (preference, scope global) — son afirmaciones distintas con vida propia.

## 3. Scope (`MemoryScope`)

`global | project | session`. Evita contaminar un proyecto con información de otro:

```text
global:  "Prefiere soluciones desacopladas."
project: "Miller utiliza PostgreSQL."
session: "Estamos modificando ProjectRepository."
```

## 4. Lifecycle (`MemoryStatus`)

```text
candidate
    │
    ▼
active
    │
    ├──────────────┐
    ▼              ▼
superseded       invalidated
    │              │
    └──────┬───────┘
           ▼
        archived
```

No se elimina información antigua inmediatamente: el sistema debe poder responder
"¿por qué Guerrero Dev cree esto?".

## 5. Confianza

`confidence` vive en `0.0..1.0` pero no es la verdad absoluta — una memoria con
`confidence = 0.97` puede quedar obsoleta igual. Por eso siempre viaja junto a
`lastVerifiedAt`, `source` y `status`.

## 6-7. Evidence y jerarquía

Una memoria como "Miller utiliza PostgreSQL" debe poder apuntar a su evidencia
(`source = repository`, `file = package.json`, `detectedAt = ...`) o a
`source = conversation`, diferenciando "el usuario dijo X" de "el código demuestra X".

Jerarquía inicial (no implica que el código "siempre tenga razón" — implica que el
sistema conoce la procedencia de cada afirmación):

```text
Repository / Code
       ↑
Tests
       ↑
Configuration
       ↑
Explicit user statement
       ↑
Agent inference
```

## 8. MemoryCandidate

Antes de persistir, el agente genera un `MemoryCandidate` (`type`, `content`, `scope`,
`source`, `confidence`) que pasa por:

```text
Candidate → Deduplicate → Conflict detection → Confidence evaluation → Persist
```

Esto evita que cada conversación genere memoria basura.

## 9-13. Modelo PostgreSQL propuesto

```text
projects
     │
     └──────────────┐
                    ▼
                 memories
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
       sources   relations embeddings
```

No se crean todavía `memory_events` ni `memory_versions` — primero se valida el
comportamiento real.

### `memories`

```sql
memories
────────────────────────────
id                  UUID PK
project_id          UUID NULL
scope               VARCHAR
type                VARCHAR
content             TEXT
status              VARCHAR
confidence          REAL
importance          REAL
created_at          TIMESTAMP
updated_at          TIMESTAMP
last_verified_at    TIMESTAMP NULL
expires_at          TIMESTAMP NULL
```

`importance` (0..1) distingue "el proyecto usa TypeScript" de "el sistema depende de
una decisión arquitectónica crítica".

### `memory_sources`

```sql
memory_sources
────────────────────────────
id                  UUID PK
memory_id           UUID FK
source_type         VARCHAR   -- repository | file | commit | conversation | test | agent_observation | manual
source_reference    TEXT      -- p.ej. "src/infrastructure/database.ts" o "commit: 8a72..."
excerpt             TEXT NULL
metadata            JSONB
created_at          TIMESTAMP
```

### `memory_relations`

```sql
memory_relations
────────────────────────────
id
source_memory_id
target_memory_id
relation_type       -- supports | contradicts | supersedes | derived_from | related_to
confidence
created_at
```

Ejemplo: Memory A ("Miller utiliza PostgreSQL") `superseded_by` Memory B ("Miller
utiliza SQL Server").

## 14. Embeddings — decisión deliberada

`embedding` **no** vive dentro de `memories`. Se separa en `memory_embeddings` porque
eventualmente puede haber varios modelos de embedding coexistiendo o una migración de
uno a otro:

```sql
memory_embeddings
────────────────────────────
id
memory_id
provider
model
dimensions
embedding    vector(1024)
created_at
```

Schema definitivo desde Fase 4.5 (§14c) — `provider` se agregó y `embedding` pasó
de `vector` sin dimensión a `vector(1024)` una vez que el benchmark de Fase 4.4
confirmó el modelo y la dimensión con evidencia real (§14b).

## 14b. Fase 4.4 — Embedding Provider: decisión

**Hardware de desarrollo:** i5 HX, 24 GB RAM, RTX 3050 6 GB VRAM (ver también "Nota
de hardware" al final de este documento).

**Decisión:**

```text
Embedding model:    qwen3-embedding:4b
Runtime:             Ollama
Embedding dimensions: 1024 (candidata — ver nota metodológica)
Technique:            Matryoshka Representation Learning (MRL)
Architecture:         Single embedding provider (texto + código + español)
License:              Apache 2.0
```

**Por qué 4B y no 8B:** `qwen3-embedding:8b` en Q4_K_M ocupa 4.7GB de los 6GB de
VRAM disponibles, sin margen si Ollama corre un LLM generativo en paralelo — la
concurrencia real de Guerrero Dev (embeddings + LLM local) descarta el 8B como
default. `qwen3-embedding:4b` (2.5GB) deja margen operativo y queda 1.13 puntos
MTEB multilingüe por debajo del 8B (69.45 vs 70.58). El 8B queda disponible como
benchmark opcional vía `BENCHMARK_MODELS`, no como dependencia del sistema.

**Por qué modelo único y no especializado:** se evaluó dividir texto/conversación
de código en dos embedding providers distintos. Se descarta por ahora — no hay
evidencia que justifique la complejidad operativa de dos providers antes de medir
si un modelo único rinde mal específicamente en código. Si el benchmark lo
muestra, `embeddinggemma` (68.76 MTEB Code v1) queda identificado como candidato a
provider especializado de código.

**Nota metodológica sobre 1024 dimensiones:** `qwen3-embedding:4b` tiene 2560
dimensiones nativas. 1024 es la dimensión *candidata* vía truncamiento MRL — no se
afirma "pérdida mínima" sin medirla contra casos de recuperación reales. Ver
resultados del benchmark real más abajo.

**Resultados del benchmark real (corrido en el hardware de desarrollo, no
simulado):**

| Métrica | qwen3-embedding:4b | qwen3-embedding:8b |
|---|---:|---:|
| Dimensión | 1024 (OK) | 1024 (OK) |
| Cold start | 5.46s / 0.47s (según si Ollama ya tenía otro modelo cargado) | 10.25s |
| Warm p50 | 228ms / 171ms | 561ms |
| Warm p95 | 2048ms / 213ms | 748ms |
| Throughput (batch) | 17.9–21.4 emb/s | 2.57 emb/s |
| Determinismo (similitud mínima entre repeticiones) | 0.9999999999999997 | 0.9999999999999991 |
| Recall@5 | 100% (8/8) | 100% (8/8) |
| MRR | 0.875 | 0.875 |

Dos corridas del 4B (`2026-08-15T15-05-37-423Z.json`, `2026-08-15T15-09-09-757Z.json`)
y una comparativa 4B vs 8B confirman: **el 8B no mejora Recall@5 ni MRR sobre este
corpus — el ranking por query es idéntico entre ambos modelos** — pero cuesta ~8x
más throughput y ~2x más cold start. Esto refuerza, con evidencia y no solo con el
argumento de VRAM, que 4B es la elección correcta. El MRR de 0.875 (no 1.0) viene
de dos queries que rankean en 2º lugar en vez de 1º (revocación de refresh tokens
y connection pool timeout) — en ambos casos el corpus tiene un texto hermano muy
parecido semánticamente; no es un problema del truncamiento a 1024, aparece igual
en el 8B con su propio truncamiento a 1024.

Lo que este benchmark **no** mide todavía: si 1024 pierde algo frente a la
dimensión nativa (2560) del propio 4B — ambas corridas usan el provider truncando
a 1024 en los dos modelos, así que no hay punto de comparación contra "sin
truncar". Si en algún momento se quiere aislar ese efecto, `EMBEDDING_DIMENSIONS`
es configurable y el mismo script puede correr una vez a 2560 para comparar. No se
considera bloqueante para cerrar la decisión: 100% recall y 0.875 MRR sobre un
corpus representativo de las 7 categorías ya es evidencia suficiente de que 1024
funciona en términos absolutos.

**Batch desde el diseño:** `IEmbeddingProvider.embedBatch(texts)` existe junto a
`embed(text)` desde el contrato inicial (no se agrega después) — analizar un
repositorio de cientos de memorias debe resultar en un request HTTP a Ollama, no
en N requests secuenciales. `OllamaEmbeddingProvider` implementa ambos sobre
`/api/embed` con un solo POST por batch.

**Versionado de embeddings (pendiente, no implementado todavía):** `model` +
`dimensions` en `memory_embeddings` cubren la mayoría del problema de
identificación, pero no distinguen versiones internas del mismo modelo/dimensión
si en el futuro cambia el truncamiento o el modelo se reentrena. Se deja anotado
para cuando se implemente la migración real de `memory_embeddings`: agregar
`provider` y `embedding_version`, con política de regeneración incremental (no
`DELETE ALL` automático al cambiar de modelo — coexistencia de embeddings viejos y
nuevos durante la migración).

**Estado de Fase 4.4:**

```text
☑ IEmbeddingProvider (embed + embedBatch)
☑ Embedding value object (ya existía desde Fase 4.2)
☑ Ollama provider (OllamaEmbeddingProvider — trunca MRL + renormaliza L2)
☑ modelo seleccionado (qwen3-embedding:4b) — confirmado con benchmark real, ver arriba
☑ dimensiones verificadas contra retrieval real (Recall@5 100%, MRR 0.875, corpus de 14 memorias / 8 queries)
☑ generación determinista/verificable (similitud > 0.9999999 entre repeticiones, test de integración + benchmark)
☑ manejo de errores/timeouts
☑ configuración mediante DI (OLLAMA_EMBEDDING_MODEL, EMBEDDING_DIMENSIONS)
☑ tests unitarios (fetch mockeado)
☑ integration test con Ollama (tests/integration/embedding-provider.test.ts, gated por RUN_INTEGRATION_TESTS) — corrido contra Ollama real
☑ benchmark local reproducible (scripts/benchmark-embeddings.ts — pnpm benchmark:embeddings) — corrido, resultados arriba
☑ documentación de la decisión (esta sección)
☑ pgvector dimension definida en schema/migración (`vector(1024)` + índice HNSW) — implementado en Fase 4.5 (§14c)
```

**Fase 4.4 — CERRADA.** Benchmark real + integration tests reales (17/17 passed,
incluyendo `embedding-provider.test.ts` 4/4 contra Ollama de verdad) confirman
`qwen3-embedding:4b` + `1024` dimensiones con evidencia, no solo argumento de
VRAM: el 8B no mejora Recall@5 ni MRR sobre el corpus (ranking idéntico por
query), así que gastar VRAM adicional no aporta valor. La migración a
`vector(1024)` + HNSW quedó implementada en Fase 4.5 (§14c) — ver ahí el detalle.

**Dos bugs encontrados al correr `RUN_INTEGRATION_TESTS=true pnpm test:integration`
contra el entorno real, corregidos en esta misma iteración:**

1. `tests/integration/embedding-provider.test.ts` fallaba por timeout (5000ms por
   defecto en vitest) cuando el cold start de Ollama tardaba justo un poco más
   (5.46s medido). El test de dimensión no debía pagar el costo de cargar el
   modelo — eso ya lo mide el benchmark. Se movió el warmup a `beforeAll` (con
   hook timeout ampliado a 30s), así cada `it` corre en caliente.
2. `packages/infrastructure/src/database/migrate.ts` — `runMigrations` no tenía
   ningún lock: cuando vitest corre varios archivos de test de integración en
   paralelo (cada uno con su propio pool llamando `runMigrations`), dos procesos
   podían leer `schema_migrations` vacía a la vez y ejecutar el mismo SQL en
   paralelo, chocando contra `pg_type_typname_nsp_index` al crear el mismo
   tipo/extensión dos veces. Se agregó `pg_advisory_lock`/`pg_advisory_unlock`
   de sesión alrededor de todo el runner para serializar el arranque entre
   procesos concurrentes. No es un bug de Fase 4.4 (viene de Fase 3/4.3), pero
   bloqueaba validar 4.4 de punta a punta, así que se corrigió acá.

## 14c. Fase 4.5 — Embedding Persistence: decisión

Cierra lo que 0002_memory_tables.sql dejó deliberadamente provisional (§14): la
tabla `memory_embeddings` existía, pero sin repository, sin mapper y con
`embedding vector` sin dimensión fija.

**Migración `0003_memory_embeddings_vector.sql`:**

```sql
ALTER TABLE memory_embeddings ADD COLUMN provider TEXT NOT NULL DEFAULT 'ollama';
ALTER TABLE memory_embeddings ALTER COLUMN provider DROP DEFAULT;
ALTER TABLE memory_embeddings ADD CONSTRAINT memory_embeddings_provider_valid
  CHECK (provider IN ('ollama'));
ALTER TABLE memory_embeddings ALTER COLUMN embedding TYPE vector(1024);
CREATE INDEX memory_embeddings_embedding_hnsw_idx
  ON memory_embeddings USING hnsw (embedding vector_cosine_ops);
```

Asume la tabla vacía (cierto: no existía repository antes de esta fase, nada pudo
haber insertado filas). `provider` queda restringido a `'ollama'` vía CHECK —
agregar un proveedor nuevo (cloud, por ejemplo) es una migración explícita que
extiende el CHECK, no un valor libre sin control.

**Por qué HNSW con `vector_cosine_ops` y no `vector_l2_ops`:**
`OllamaEmbeddingProvider` devuelve vectores L2-normalizados (ver Fase 4.4) y el
benchmark completo se midió en cosine similarity — usar `vector_cosine_ops` es
consistente con cómo se generaron y evaluaron los embeddings, no una elección por
default.

**Por qué sin tuning de `m`/`ef_construction`/`ef_search` todavía:** no hay volumen
real ni consultas reales que midan si los defaults de pgvector (m=16,
ef_construction=64) son insuficientes. Ajustar esos parámetros sin datos sería
optimizar a ciegas. Se revisita en Fase 4.6 (Retrieval) cuando haya tráfico de
búsqueda real que medir — mismo criterio que ya se aplicó en Fase 4.4 para no
sobre-diseñar antes de tener evidencia.

**`IMemoryEmbeddingRepository` — deliberadamente sin `searchSimilar()`:**

```typescript
export interface IMemoryEmbeddingRepository {
  create(embedding: MemoryEmbedding): Promise<MemoryEmbedding>;
  findByMemoryId(memoryId: string): Promise<MemoryEmbedding[]>;
  deleteByMemoryId(memoryId: string): Promise<void>;
}
```

`findByMemoryId` devuelve un array, no `| null`: una misma memoria puede tener más
de un embedding coexistiendo (distintos providers/modelos durante una migración
futura). `searchSimilar()` pertenece conceptualmente a Retrieval (Fase 4.6), no a
Persistence — esta fase solo sabe guardar, leer y borrar, no sabe qué significa
"similar". Separación limpia: 4.5 = almacenar/recuperar embeddings, 4.6 = encontrar
embeddings similares.

**Versionado — se implementó lo mínimo, no un sistema completo:** `provider` +
`model` + `dimensions` viajan en cada fila (`ollama` / `qwen3-embedding:4b` /
`1024`). No se agrega todavía un `embedding_version` separado — cuando haga falta
migrar de modelo se diseña esa estrategia entonces, con casos reales sobre la
mesa, no antes.

**Ciclo de vida — lo que este schema permite pero todavía no implementa:** una
`Memory` puede persistirse sin su embedding (por ejemplo si Ollama está caído en
ese momento) porque `memory_embeddings` es una tabla separada, no una columna de
`memories` — perder el embedding temporalmente no significa perder la memoria. El
flujo `Memory persisted ✅ / embedding ⏳ → background worker → embedding
generado` queda habilitado por este modelo de datos, pero el worker no se
implementa en esta fase.

**Estado de Fase 4.5:**

```text
☑ memory_embeddings — provider + vector(1024) (migración 0003)
☑ índice HNSW (vector_cosine_ops, defaults sin tuning)
☑ IMemoryEmbeddingRepository (create, findByMemoryId, deleteByMemoryId — sin searchSimilar)
☑ MemoryEmbeddingMapper
☑ DrizzleMemoryEmbeddingRepository
☑ MemoryEmbedding.provider (dominio)
☑ integration tests (tests/integration/memory-embedding-repository.test.ts: CRUD,
  coexistencia de varios embeddings por memoria, cascade delete, CHECK de
  dimensión/provider, FK memory_id)
☑ build + typecheck estricto + unit tests + lint + prettier
☑ verificación end-to-end contra PostgreSQL+pgvector real — `RUN_INTEGRATION_TESTS=true
  pnpm test:integration`: 4 archivos, 24/24 passed (7 nuevos de
  memory-embedding-repository.test.ts + 4 de embedding-provider.test.ts +
  11 de memory-repository.test.ts + 2 de project-repository.test.ts)
```

**Fase 4.5 — CERRADA.** Igual criterio que en 4.4: no se dio por cerrada hasta
pasar contra PostgreSQL+pgvector real, no solo contra build/typecheck. Commit
recomendado: `feat(memory): add embedding persistence`.

## 14d. Fase 4.6 — Retrieval: frontera de responsabilidades (decisión)

Antes de tocar código se definió la frontera exacta entre persistencia,
retrieval semántico y ranking híbrido — evitar esto habría significado que
`IMemoryEmbeddingRepository` (Fase 4.5) empezara a absorber lógica de búsqueda,
o que `IMemoryRetriever` terminara conociendo SQL/Drizzle.

```text
┌────────────────────────────────────────────┐
│ Persistence (Fase 4.5, cerrada)            │
│ IMemoryEmbeddingRepository                  │
│ → CRUD de embeddings, nada de búsqueda      │
└────────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────┐
│ Semantic Retrieval (Fase 4.6, pendiente)   │
│ IMemoryCandidateRetriever                   │
│ → SQL + pgvector + filtros + candidate pool │
│ → sin ranking híbrido                       │
└────────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────┐
│ Application Retrieval (Fase 4.6, pendiente)│
│ IMemoryRetriever                            │
│ → orquesta embedding + candidatos + ranking │
└────────────────────────────────────────────┘
                       │
                       ▼
┌────────────────────────────────────────────┐
│ Ranking (Fase 4.6, implementado)           │
│ IMemoryRanker / MemoryRanker                │
│ → semantic + confidence + importance +      │
│   recency + project relevance, puro         │
└────────────────────────────────────────────┘
```

**`searchSimilar()` deliberadamente fuera de `IMemoryEmbeddingRepository`:**
mezclarlo ahí habría hecho que un contrato de persistencia (CRUD) empezara a
expresar una capacidad de infraestructura (búsqueda). Se creó
`IMemoryCandidateRetriever` en su lugar, con una responsabilidad más angosta:
traer candidatos semánticamente relevantes, no decidir cuál es "el mejor".

**`MemorySearchCandidate` vs. `MemoryCandidate` (dominio):** dos conceptos
distintos que ya existían con nombres parecidos. `MemoryCandidate` (Fase 4.1
§8, dominio) es candidato a *convertirse* en memoria nueva (pipeline
Candidate → Deduplicate → Conflict detection → Confidence evaluation →
Persist). `MemorySearchCandidate` (Fase 4.6, application) es una memoria ya
existente, candidata a ser *recuperada*. Reusar el nombre habría sido
ambiguo, así que se usó uno distinto a propósito.

**`MemorySemanticQuery` en vez de pasar `MemorySearchQuery` completo:** el
candidate retriever no necesita saber qué es `text` ni `types`/`scopes` — solo
embedding + `projectId` (para filtrar en SQL, no en memoria después) +
`limit`. Pasarle el objeto completo habría acoplado infraestructura a
conceptos de aplicación que no le corresponden.

**`candidateK` > `topK` (pendiente en la implementación del candidate
retriever):** si se piden 5 resultados finales pero solo se traen 5
candidatos semánticos, un candidato #6 con muchísima más confianza/importancia
nunca puede ganar en el ranking híbrido. El candidate retriever debe traer un
pool más grande (ej. 50) del que el ranker elige el top K real.

**Ranking — decisiones tomadas en `MemoryRanker` (implementado y testeado,
15 tests puros sin I/O):**

- `MemoryRankingWeights` es una interfaz configurable, no constantes de
  clase — `DEFAULT_PROJECT_RANKING_WEIGHTS` y `DEFAULT_GLOBAL_RANKING_WEIGHTS`
  son puntos de partida explícitamente provisionales, a validar con el
  benchmark de retrieval (Recall@K, MRR, semantic-only vs. hybrid) antes de
  considerarlos definitivos.
- `projectRelevance` con peso 0 en `DEFAULT_PROJECT_RANKING_WEIGHTS`: si la
  búsqueda ya filtró por `project_id` en SQL, todas las memorias candidatas
  son del mismo proyecto — sumar un 1.0 artificial a todas por igual no
  ordena nada. El factor solo aporta información en búsquedas globales
  (`DEFAULT_GLOBAL_RANKING_WEIGHTS`, peso 0.20), donde `projectRelevance`
  distingue memorias del proyecto de contexto (1), conocimiento `global` (1,
  aplica en cualquier proyecto) y memorias de otro proyecto específico (0) —
  el ejemplo original (Fase 4.1 §22) de "JWT + Refresh Tokens" de GESCOMPH
  puntuando bajo al preguntar por autenticación en Miller (OAuth+Sessions).
- Recencia con decay exponencial de **media vida real**
  (`exp(-ageDays·ln2/halfLifeDays)`, no `exp(-ageDays/halfLifeDays)`): a
  `ageDays === halfLifeDays` el valor es exactamente 0.5, consistente con
  qué significa "media vida". Se usa `lastVerifiedAt` si existe (una memoria
  reverificada recientemente es "fresca" aunque sea vieja), si no
  `updatedAt`. `DEFAULT_RECENCY_HALF_LIFE_DAYS = 180` es un punto de partida,
  no una medición.
- `reasons` es explicativo (debugging/observabilidad), no participa en el
  score — umbrales fijos (`0.7`/`0.8`) marcados explícitamente como
  provisionales en el código.

**`DrizzleMemoryCandidateRetriever` (adapter pgvector, Fase 4.6 cont.):**

```sql
SELECT m.*, (me.embedding <=> $queryVector) AS distance
FROM memory_embeddings me
JOIN memories m ON m.id = me.memory_id
WHERE ($projectId IS NULL OR m.project_id = $projectId)
ORDER BY me.embedding <=> $queryVector
LIMIT $candidateLimit;
```

La conversión `semanticSimilarity = 1 - distance` (cosine distance de pgvector:
0 = idéntico, 2 = opuesto) se hace **exclusivamente en este adapter**.
Application recibe un número "más alto es más similar" y nunca se entera de
`<=>`, `vector_cosine_ops` ni pgvector — ese fue el punto explícito que se pidió
encapsular bien. `projectId` se resuelve como filtro SQL antes de ordenar por
distancia, no como post-filtro en memoria.

Deliberadamente sin filtro por `type`/`scope` en este adapter: `MemorySemanticQuery`
(acordado explícitamente) solo expone `embedding` + `projectId` + `limit`. Ese
filtrado se mueve a `MemoryRetriever` (Application) como post-filtro sobre el
candidate pool, antes de rankear — mantiene el adapter ajustado exactamente al
contrato en vez de crecerlo por su cuenta.

**`MemoryRetriever` (orquestación, Fase 4.6 cont.):** implementa `IMemoryRetriever`
inyectando `IEmbeddingProvider` + `IMemoryCandidateRetriever` + `IMemoryRanker`.
`candidateLimit` es configurable vía `MemoryRetrieverOptions.candidateLimit`, con
default `max(topK*10, 50)` — exactamente lo que se pidió: no una regla rígida,
sino un punto de partida que el benchmark de retrieval puede reemplazar
(`50 → 100 → 200 candidatos` y comparar Recall@5). Los pesos (`projectWeights`/
`globalWeights`) y el half-life de recencia también son inyectables, no
constantes.

**Estado de Fase 4.6:**

```text
☑ IMemoryCandidateRetriever / IMemoryRanker / IMemoryRetriever (puertos)
☑ MemorySearchQuery / MemorySemanticQuery / MemorySearchCandidate / MemorySearchResult
☑ MemoryRankingWeights (+ defaults project/global) / MemoryRankingContext
☑ MemoryRanker (puro, sin I/O) — 15 tests unitarios
☑ DrizzleMemoryCandidateRetriever (adapter pgvector, semanticSimilarity
  encapsulado, filtro project_id en SQL)
☑ MemoryRetriever (orquestación: embed -> candidatos -> post-filtro
  type/scope -> ranking -> slice a topK) — 10 tests unitarios con fakes,
  sin I/O real
☑ tests unitarios: 25 nuevos (MemoryRanker 15 + MemoryRetriever 10), 58/58 en
  el suite completo
☑ integration test de candidate retrieval (tests/integration/
  memory-candidate-retriever.test.ts): orden por similitud coseno con valor
  exacto verificado (vectores construidos con similitud conocida contra la
  query, no aleatorios), límite respetado, filtro de proyecto en SQL,
  memorias sin embedding excluidas
☑ build + typecheck estricto + lint + prettier
☑ verificación end-to-end contra PostgreSQL+pgvector real — `RUN_INTEGRATION_TESTS=true
  pnpm test:integration`: 5 archivos, 28/28 passed (4 nuevos de
  memory-candidate-retriever.test.ts, incluyendo el orden exacto por
  similitud coseno verificado contra pgvector real — no solo compilación)
☐ benchmark de retrieval con ground truth (Recall@K, MRR, Precision@K,
  semantic-only vs. hybrid) — siguiente incremento, fuera del alcance de 4.6
```

**Fase 4.6 — CERRADA.** Mismo criterio que en 4.4 y 4.5: no se marcó cerrada
hasta pasar contra PostgreSQL+pgvector real, no solo contra build/typecheck.
Commit recomendado: `feat(memory): add hybrid retrieval (candidate retrieval +
ranking)`.

Con esto, el Memory Retrieval Engine está funcional de punta a punta:
`texto → embedding (Ollama) → candidatos semánticos (pgvector/HNSW) →
ranking híbrido → resultados`. Lo que queda fuera de 4.6, explícitamente para
después: el benchmark de retrieval con ground truth (Recall@K/MRR real,
semantic-only vs. hybrid, y la validación de si `candidateLimit =
max(topK*10, 50)` es el valor correcto o si conviene otro).

## 14e. Fase 4.7 — Candidate Engine: decisión

Decide qué `MemoryCandidate` (dominio, Fase 4.1 §8) merece convertirse en
`Memory` persistida — explícitamente sin tocar todavía la fuente de
extracción (`CandidateDetector` sobre Git, deferido a 4.8). Dos etapas
separadas, revisadas antes de escribir código:

```text
MemoryCandidate
      │
      ▼
┌─────────────┐
│  Validator  │  estructural: ¿el candidato está bien formado?
└──────┬──────┘  (no decide duplicate/conflict/accepted)
       ▼
┌──────────────────────┐
│ Deduplicator +        │  ambas se consultan SIEMPRE en paralelo
│ ConflictDetector       │  (Promise.all) — no son mutuamente
│ (parallel)             │  excluyentes: un candidato puede a la vez
└──────────┬─────────────┘  duplicar A y contradecir B
           ▼
      ┌───────────┐
      │  Scorer   │  score(candidate) — solo señales propias del
      └─────┬─────┘  candidato (confidence/importance/fuente),
            ▼         nunca similitud (eso es Deduplicator)
       ┌───────────┐
       │  Policy   │  accepted = score >= threshold — independiente
       └─────┬─────┘  de duplicate/conflict (dimensiones distintas)
             ▼
      MemoryEvaluation
             │
             ▼
      ┌──────────────┐
      │  Promoter    │  dentro de IMemoryPromotionUnitOfWork (transacción)
      └──────┬───────┘
             ▼
  Memory (created/updated) + Source + Relations(contradicts)
```

**`MemoryEvaluation` implementado literal según el diseño original (§24-27)**
— `{ accepted, confidence, importance, duplicateOf, conflictsWith, reason }`,
sin campos `status`/`action` propios. El outcome (`rejected`/`duplicate`/
`conflict`/`accepted`) se deriva con `evaluationOutcome()`, que es
**reporting/clasificación únicamente — nunca control de flujo.**
`duplicateOf` y `conflictsWith` no son mutuamente excluyentes (un candidato
puede simultáneamente actualizar una memoria duplicada Y contradecir otra),
así que ninguna operación de persistencia puede decidirse con un `switch`
sobre ese outcome. Precedencia de la etiqueta (solo para logs/UI):
`rejected > conflict > duplicate > accepted` — un conflicto requiere
atención, un duplicado solo confirma lo ya sabido.

**Seis puertos, responsabilidad angosta cada uno:**
`IMemoryCandidateValidator`, `IMemoryCandidateDeduplicator` (devuelve
`MemoryDuplicateMatch { memoryId, similarity }`, no solo el id — se
conserva evidencia), `IMemoryConflictDetector`, `IMemoryCandidateScorer`
(contrato congelado en `score(candidate): { score }`, sin pasar
`similarity` — el scorer todavía no está implementado; su fórmula futura
combinaría `confidence`/`importance`/jerarquía de `sourceType` ya
documentada en `MemorySource.ts`, pendiente de pesos reales),
`IMemoryCandidateEvaluator` (orquestador puro, sin PostgreSQL) e
`IMemoryCandidatePromoter` (sí usa infraestructura, pero solo a través de
`IMemoryPromotionUnitOfWork`).

**`MemoryCandidateEvaluator`:** implementación del orquestador. Regla
explícita: `Deduplicator`/`ConflictDetector` se consultan siempre, sin
short-circuit — preserva evidencia completa incluso en candidatos
rechazados. 10 tests unitarios, incluyendo el caso duplicate+conflict
simultáneo.

**`IMemoryPromotionUnitOfWork` — frontera transaccional angosta, no un
`ITransactionManager` genérico:** `Memory` + `MemorySource` +
`MemoryRelation` deben persistirse atómicamente (las tres o ninguna).
Deliberadamente acoplado a esos tres repositorios específicos en vez de
generalizado — introducir una abstracción transaccional genérica sin un
segundo caso de uso real habría sido diseño anticipado. El puerto es dueño
solo de la transacción, no de reglas de promoción — `runInTransaction(work)`
recibe los tres repos ya atados a la transacción, `work` decide qué hacer.
`DrizzleMemoryPromotionUnitOfWork` (adapter) aprovecha que `tx` (dentro de
`db.transaction()` de Drizzle) es directamente asignable a `DrizzleClient`
— construye instancias nuevas de `DrizzleMemoryRepository`/
`DrizzleMemorySourceRepository`/`DrizzleMemoryRelationRepository` atadas a
`tx`, sin repetir SQL.

**`MemoryCandidatePromoter` — mapeo mecánico de `MemoryEvaluation` a
operaciones, sin reglas de negocio propias:**

```text
duplicateOf != null           -> update Memory existente + Source
                                  (precedencia sobre `accepted`: un
                                  duplicado nunca se descarta por score)
duplicateOf == null && accepted  -> create Memory + Source
duplicateOf == null && !accepted -> ningún registro (action: "rejected")

Memory resultante (created/updated) + conflictsWith.length > 0
    -> crea Relation(contradicts) por cada id — independiente de si fue
       create o update
Memory NO resultante (rejected sin duplicado) + conflictsWith.length > 0
    -> NO crea relación — MemoryRelation exige sourceMemoryId, y un
       candidato rechazado sin duplicado nunca tiene id de Memory propio.
       La señal de conflicto sigue en MemoryEvaluation para
       logging/observabilidad, pero no se persiste como relación huérfana.
```

`MemoryPromotionResult` refleja esto sin ambigüedad: `action: "created" |
"updated" | "rejected"` (sin `"conflict"` como acción alternativa) +
`conflictRelationsCreated: readonly string[]` como efecto independiente —
`action: "updated"` y `conflictRelationsCreated: ["mem-b"]` pueden coexistir.

Decisión de implementación sin discusión previa explícita, documentada
aquí para que quede a la vista: `status: "active"` al crear una `Memory`
nueva desde el Promoter (no `status: "candidate"` ni un paso de activación
posterior) — no se diseñó una fase de activación en 4.7, y el propio
dominio dice "no tocar `MemoryStatus` sin un caso real que lo justifique".
Reversible con un cambio de una línea si aparece esa necesidad.

IDs y timestamps: sin `IIdGenerator`/`IClock` — se confirmó que Foundation
no tiene esa abstracción (`AddProject.ts` ya usa `randomUUID()` +
`new Date()` directo dentro del caso de uso), así que `MemoryCandidatePromoter`
sigue el mismo patrón en vez de introducir un puerto nuevo sin precedente.

**Estado de Fase 4.7:**

```text
☑ MemoryEvaluation (+ evaluationOutcome, reporting-only) / MemoryDuplicateMatch /
  MemoryCandidateScore / MemoryPromotionResult
☑ IMemoryCandidateValidator / IMemoryCandidateDeduplicator / IMemoryConflictDetector /
  IMemoryCandidateScorer / IMemoryCandidateEvaluator / IMemoryCandidatePromoter (puertos)
☑ MemoryCandidateEvaluator (orquestador puro) — 10 tests unitarios
☑ IMemoryPromotionUnitOfWork (puerto angosto) / DrizzleMemoryPromotionUnitOfWork (adapter)
☑ MemoryCandidatePromoter — 8 tests unitarios
☑ tests unitarios: 18 nuevos (Evaluator 10 + Promoter 8), 76/76 en el suite completo
☑ build + typecheck estricto + lint + prettier
☑ verificación end-to-end contra PostgreSQL real — `RUN_INTEGRATION_TESTS=true
  pnpm test:integration`: 6 archivos, 30/30 passed, incluyendo
  memory-promotion-unit-of-work.test.ts (2 tests: commit de las tres
  escrituras cuando todo tiene éxito, y ROLLBACK real y verificado —
  Memory+Source ausentes tras el fallo forzado de Relation — confirmando
  que la transacción es realmente atómica, no solo en el fake in-memory de
  los tests unitarios)
☐ IMemoryCandidateValidator / IMemoryCandidateDeduplicator / IMemoryConflictDetector /
  IMemoryCandidateScorer: implementaciones concretas, pendientes (el
  Evaluator y el Promoter están probados con fakes/contratos, no con
  detección de duplicados o scoring reales todavía)
☐ CandidateDetector (extracción desde Git) — deferido a Fase 4.8
```

**Fase 4.7 — CERRADA.** Mismo criterio que 4.4/4.5/4.6: no se marcó cerrada
hasta pasar contra PostgreSQL real, no solo build/typecheck. Commit
recomendado: `feat(memory): add candidate engine (evaluation + promotion)`.

Lo que queda explícitamente fuera de 4.7: implementaciones reales de
`Deduplicator`/`ConflictDetector`/`Scorer` (hoy solo existen como
contratos, testeados con fakes) y, sobre todo, quién produce el
`MemoryCandidate` en primer lugar — eso es Fase 4.8, con una decisión de
diseño pendiente (reglas deterministas vs. LLM vs. híbrido) que se discute
antes de escribir código, mismo criterio aplicado en 4.6→4.7.

## 14e-bis. Cierre de Fase 4.7 — Validator/Deduplicator/Scorer reales + ConflictDetector placeholder

Auditoría previa (`docs/fase-a-auditoria.md`, Gap 3) marcó 4.7 como
incompleta: `Evaluator`/`Promoter` solo probados con fakes, sin
implementaciones concretas de los cuatro puertos restantes. Antes de
escribir código se revisaron los contratos existentes y esta misma
sección (§14e) para no inventar comportamiento nuevo — tres decisiones
no estaban congeladas y se tomaron explícitamente acá, no en el código:

**`DeterministicMemoryCandidateValidator`** — sin ambigüedad: reutiliza
`isValidConfidence`/`isValidImportance`/`isScopeConsistent` de
`MemoryInvariants.ts` (dominio), sin agregar ninguna regla nueva.

**`MemoryCandidateScorer`** — el diseño original (§14e) ya proponía la
fórmula en concepto ("combinaría confidence/importance/jerarquía de
sourceType") sin pesos. Pesos elegidos:

```text
score = confidence * 0.5 + importance * 0.3 + sourceTypeWeight * 0.2

sourceTypeWeight (jerarquía de MemorySource.ts, §6-7):
  repository / file / commit / test / manual   -> 1.0
  conversation                                  -> 0.7
  agent_observation                             -> 0.4
```

Provisional, igual criterio que `DEFAULT_PROJECT_RANKING_WEIGHTS` en
`MemoryRanker` (Fase 4.6): punto de partida, no medición — se revisita
con benchmark real de promoción cuando haya evidencia de falsos
positivos/negativos.

**`MemoryCandidateDeduplicator`** — vive en `application/services`
(igual que `MemoryRetriever`), no en `infrastructure`: solo depende de
los puertos `IEmbeddingProvider` + `IMemoryCandidateRetriever` de Fase
4.6, reutilizando el mismo candidate pool semántico en vez de construir
una segunda infraestructura de búsqueda. Filtra el pool a memorias del
mismo `type` que el candidato antes de mirar similitud (un `"fact"`
nunca es duplicado de una `"decision"`). Umbral de similitud: **0.90**
— más permisivo que el 0.96 usado como ejemplo ilustrativo en §24-27
(ese número nunca fue una decisión congelada). Configurable por
constructor, sin benchmark real todavía que lo confirme.

**`NoopMemoryConflictDetector`** — placeholder consciente, siempre
devuelve `[]`. No hay ningún algoritmo determinista documentado en este
archivo para detectar contradicción semántica ("Clean Architecture" vs.
"arquitectura hexagonal"), y "conflict resolution avanzado" está
explícitamente fuera de alcance de Fase 4 (§31). Escribir una
heurística sin evidencia de que funciona habría sido inventar una regla
nueva — se prefirió dejarlo explícito y sin implementar, mismo criterio
que `NoopExecutionEngine` en `execution/`. **Este es el único punto que
sigue abierto dentro de 4.7** — reemplazar este placeholder por
detección real (heurística con evidencia o LLM) es el siguiente
incremento pendiente sobre Candidate Engine.

**Estado tras este cierre:**

```text
☑ DeterministicMemoryCandidateValidator — implementación real, 9 tests unitarios
☑ MemoryCandidateScorer — implementación real con pesos documentados arriba, 5 tests unitarios
☑ MemoryCandidateDeduplicator — implementación real (reusa retrieval de 4.6), 8 tests unitarios
☑ NoopMemoryConflictDetector — placeholder consciente y documentado, 2 tests unitarios
☑ build + typecheck estricto + suite completa — verificado en el entorno
  Windows real del desarrollador (no en este sandbox, que no tuvo acceso
  al registry de pnpm): 176/176 tests pasan (24 nuevos de esta sección,
  0 regresiones), 41 tests de integración/e2e correctamente `skipped`
  (requieren PostgreSQL/Ollama reales corriendo, no evaluados en este
  incremento)
☑ Verificación end-to-end contra PostgreSQL+Ollama real —
  `RUN_INTEGRATION_TESTS=true pnpm test:integration`: 7 archivos, 36/36
  passed. En el camino se encontró y corrigió un bug de aislamiento
  preexistente de Fase 4.6 en `memory-candidate-retriever.test.ts`
  (competía por `limit: 10` contra memorias `global` de otros archivos
  de test corriendo en paralelo contra la misma base — nunca se había
  visto porque, según `docs/fase-a-auditoria.md`, esta fue la primera
  vez que el suite completo de integración corrió contra Postgres real).
☑ `pnpm lint` + `pnpm format:check` — limpio.
☐ ConflictDetector real — deferido, ver arriba
```

**Fase 4.7 — CERRADA en todo lo verificable.** `ConflictDetector` queda
explícitamente como decisión arquitectónica pendiente (heurística vs.
LLM), no como deuda a rellenar artificialmente — ver razonamiento
arriba. El resto (Validator, Scorer, Deduplicator, Evaluator, Promoter)
está implementado, testeado con fakes, y verificado contra
PostgreSQL+Ollama reales de punta a punta.

Commit recomendado: `feat(memory): implement candidate validation and scoring`.

## 14f. Fase 4.8.x — Deterministic Commit Noise Filter: decisión

Primer incremento concreto de Fase 4.8 (Candidate Detection). Contexto
completo del pipeline híbrido (`ICommitAnalyzer` → `ICommitNoiseFilter` →
`ICandidateExtractor` → Fase 4.7) y de los contratos (`CommitSnapshot`,
`CommitSignal`, `RiskSignal`, `CandidateExtractionResult`) en §§15-18 y en
`docs/benchmarks/candidate-detection/`. Esta sección cierra únicamente el
primer implementador real: `DeterministicCommitNoiseFilter`.

**Diseño.** Tres reglas de alta confianza, en este orden:

1. Artefactos de build: descarta si los únicos `touchedPaths` son
   `.gitignore` y/o `*.tsbuildinfo`.
2. Generados de EF/ORM: descarta si el 100% de `touchedPaths` matchean
   `*.designer.cs` / `*.edmx` / `*.tt`.
3. README trivial: descarta si el único archivo tocado es `README.md` y
   `linesAdded + linesRemoved <= 5`.

Cualquier otro caso: `discard: false`. Deliberadamente **no** usa
`filesChanged`/`linesAdded`/`linesRemoved` como criterio de decisión
independiente — el golden dataset (23 commits) mostró magnitud engañosa en
ambas direcciones (`a2dd733`: 8 líneas, señal alta; `6537bec`: 4117
líneas, señal casi nula). Sesgo de diseño explícito: preferir falsos
negativos (dejar pasar ruido hacia 4.7) sobre falsos positivos (descartar
una decisión real) — 4.7 ya es el firewall de aceptación; 4.8 determinista
solo filtra "esto es casi seguro ruido", nunca decide "esto es memoria".

**Evidencia — medido, no ajustado hasta que "pareciera razonable",**
contra los 23 commits reales del golden dataset (`guerrero-dev` +
`gescomph-api`), vía `DeterministicCommitNoiseFilter.goldenDataset.test.ts`:

| Métrica | Resultado |
|---|---:|
| Precisión | **100%** |
| Recall de ruido | **75% (3/4)** |
| Falsos positivos | **0** |
| Falso negativo conocido | `6537bec` |

**Decisión congelada:** `6537bec` (diagrama EF autogenerado con archivos
`.cs` planos mezclados) queda como falso negativo conocido y aceptado. No
se introduce una regla basada en el layout específico de un repositorio
(p. ej. una carpeta `Diagrama/`) para corregirlo — haría que el filtro
sobreajustara a `gescomph-api` en vez de generalizar. El trade-off
explícito: en esta etapa es preferible dejar pasar ruido hacia 4.7 que
arriesgarse a eliminar una decisión arquitectónica real.

**Estado de Fase 4.8.x (Deterministic Noise Filter):**

```text
☑ DeterministicCommitNoiseFilter (implementación de ICommitNoiseFilter) — 3 reglas
☑ Tests unitarios por regla — 9 tests, incluyendo los casos borde conocidos
  (mezcla con código real, mezcla con pnpm-lock.yaml, mezcla con .cs plano)
☑ Golden dataset test — 23/23 commits reales, 5 assertions (0 FP exactos,
  3 TP exactos, 1 FN exacto conocido, precisión 100%, recall 75%)
☑ build + typecheck estricto + 90/90 tests (0 regresiones) + eslint + prettier
☑ Corrección post-hoc de 7 magnitudes truncadas en el golden dataset,
  descubierta al construir los fixtures — documentada en taxonomy.md
```

**Fase 4.8.x (Deterministic Noise Filter) — CERRADA.** Explícitamente
fuera de este incremento: `ICommitAnalyzer` concreto, `ICandidateExtractor`
concreto, y cualquier modelo LLM — el siguiente paso de diseño es validar
que `CommitSignal` contiene las señales necesarias (contra los mismos 23
commits) antes de escribir el extractor semántico.

## 14g. `CommitReference` — frontera de `recentRelatedCommits`: decisión

Antes de escribir `ICommitAnalyzer` concreto se validó `CommitSignal`
contra los 23 casos del golden dataset. Los campos existentes
(`filesChanged`/`linesAdded`/`linesRemoved`/`touchedPaths` + `message`/
`diff` de `CommitSnapshot`) cubren la señal cruda necesaria en los 23
casos sin necesidad de campos nuevos — la interpretación (patrones de
path, "esto es un vertical slice", etc.) sigue siendo trabajo downstream,
consistente con la frontera "observa, no interpreta" ya fijada.

Un solo punto sí necesitaba decisión antes de implementar: cómo calcula
`ICommitAnalyzer` los "commits relacionados recientes". El caso que lo
disparó fue una hipótesis, no un hecho verificado: se asumió que `bf7f9fb`
(persistencia) refuerza a `96f2719` (dominio) sin compartir paths. Al
implementar el integration test contra Git real (§14i) se descubrió que
esa hipótesis era falsa — `bf7f9fb` sí comparte paths exactos con
`96f2719` (`packages/domain/src/memory/index.ts` y
`packages/application/src/common/ports/index.ts`, ambos barrels que
`bf7f9fb` actualiza para exportar lo nuevo), y una heurística de solo-path-overlap
sí encuentra la relación. Corrección documentada aquí, no escondida: el
golden dataset no tiene todavía un ejemplo confirmado de relación
conceptual real sin ningún overlap estructural — la pregunta que motivó
este punto (¿qué hacemos si el overlap de paths no alcanza?) sigue siendo
válida en abstracto, simplemente no tenemos evidencia empírica de un caso
real que la fuerce.

**Decisión (congelada):** `recentRelatedCommits` se mantiene como
heurística puramente estructural — nunca se amplía con señales que
sugieren relación pero no la demuestran técnicamente (mismo autor, ventana
temporal, carpeta adivinada como feature, vocabulario compartido del
mensaje). Ampliarlo así mezclaría "estructura observable en Git" con
"significado arquitectónico" dentro de `ICommitAnalyzer` — construiría un
detector semántico disfrazado de heurística, exactamente lo que la
separación en tres puertos (`ICommitAnalyzer`/`ICommitNoiseFilter`/
`ICandidateExtractor`) buscaba evitar.

Heurísticas permitidas (estructura observable, sin interpretación):

```text
overlap de touchedPaths
overlap de directorio
continuidad de archivo renombrado (git log --follow)
```

Heurísticas explícitamente descartadas (interpretación disfrazada):

```text
mismo autor
ventana temporal
carpeta como proxy de feature
vocabulario compartido del mensaje
```

El tipo se renombra de `readonly string[]` a `readonly CommitReference[]`
(`CommitReference { sha: string }`, `packages/application/src/memory/models/CommitReference.ts`)
para que el nombre y el JSDoc dejen explícito que son candidatos de
contexto histórico, no relaciones semánticas confirmadas —
`ICandidateExtractor` es quien decide si una referencia es `reinforces`,
`supersedes`, u otra cosa.

La decisión de mantener `recentRelatedCommits` como heurística puramente
estructural se sostiene por sus propios méritos (evitar que
`ICommitAnalyzer` se convierta en un detector semántico disfrazado), no
por el ejemplo `bf7f9fb`/`96f2719` — ese caso, verificado contra Git real,
resultó ser precisamente uno que la heurística de path overlap resuelve
bien (ver §14i). Si en el futuro aparece en el golden dataset un caso real
de relación conceptual sin ningún overlap estructural, y
`ICandidateExtractor` falla sistemáticamente en encontrarla, esa sería la
evidencia que justificaría una segunda fuente de contexto histórico — no
una ampliación especulativa hoy.

## 14h. Fase 4.8.3 — `ICommitAnalyzer` determinista: decisión

Segundo incremento concreto de Fase 4.8. Contrato de `IGitHistorySource`
congelado en §14g antes de escribir código, sin abrir un fork
arquitectónico nuevo durante la implementación — el mismo criterio
aplicado en 4.7 (Evaluator/Promoter puros + puerto angosto + adapter).

**Diseño.** `DeterministicCommitAnalyzer` implementa `ICommitAnalyzer` con
dos responsabilidades separadas:

1. Estadísticas puras (`filesChanged`/`linesAdded`/`linesRemoved`/
   `touchedPaths`) derivadas enteramente de `commit.diff`/
   `commit.changedFiles` — sin I/O.
2. `recentRelatedCommits`: combina las tres heurísticas congeladas
   (path overlap, directory overlap, rename continuity) contra
   `IGitHistorySource` inyectado por constructor, con `before =
   commit.timestamp` siempre y `HISTORY_QUERY_LIMIT = 5` (tuning
   parameter, no arquitectónico). Deduplica por SHA, excluye
   defensivamente el propio commit, y trunca al límite. No interpreta
   intención arquitectónica — eso sigue siendo exclusivo de
   `ICandidateExtractor`.

**Evidencia.** 13 tests unitarios con `FakeGitHistorySource` (input→SHAs,
sin conocer conceptos como "overlap" o "rename" — el fake no es una
segunda implementación del analyzer disfrazada de mock):

```text
☑ estadísticas puras: archivo único, multi-capa (domain+application+infrastructure), diff con
  cabeceras +++/---, diff grande (620 líneas)
☑ path overlap: consulta findCommitsTouchingPaths con los touchedPaths exactos
☑ directory overlap: deriva el directorio y lo consulta por separado
☑ archivo en la raíz: no dispara consulta de directorio
☑ rename continuity: consulta findRenameHistory por cada touched path
☑ before = commit.timestamp siempre, en ambas operaciones
☑ deduplicación cross-consulta (path + directory + rename apuntando al mismo SHA -> una sola CommitReference)
☑ límite del resultado final a HISTORY_QUERY_LIMIT
☑ paths sin resultados configurados -> recentRelatedCommits vacío, no inventa relaciones
☑ nunca se autorreferencia, aunque la fuente lo devuelva por error
```

`pnpm build && pnpm typecheck && pnpm test && npx eslint . && npx prettier
--check .`: verde — 103/103 tests (13 nuevos del analyzer, 0
regresiones), sin errores de lint ni formato.

**Estado de Fase 4.8.3 (`ICommitAnalyzer` determinista):**

```text
☑ IGitHistorySource (puerto angosto, 2 operaciones, contrato congelado en §14g)
☑ DeterministicCommitAnalyzer (implementación de ICommitAnalyzer)
☑ FakeGitHistorySource + 13 tests unitarios (estadísticas puras + 3 heurísticas + dedup/límite/self-exclude)
☑ build + typecheck estricto + 103/103 tests (0 regresiones) + eslint + prettier
☑ GitHistorySource real (infrastructure, shell directo a Git vía execFile) — ver §14i
☑ Test de integración contra Git real — ver §14i
```

**Fase 4.8.3 — CERRADA a nivel de contrato + lógica pura**, y luego
completada con el adapter real e integración contra Git verdadero en el
mismo incremento (§14i) — ver ese apartado para el cierre definitivo,
incluyendo una corrección importante sobre el caso `bf7f9fb`/`96f2719` que
se había asumido sin verificar.

## 14i. Fase 4.8.3 — `GitHistorySource` real + integración contra Git: decisión

Cierre del incremento de `ICommitAnalyzer` determinista: adapter real de
`IGitHistorySource` vía shell directo (`execFile`, nunca `exec`), y su
verificación contra el historial real de este mismo repositorio.

**Diseño del adapter** (`packages/infrastructure/src/git/`):

```text
GitHistorySource.ts       — implementa IGitHistorySource, arma el comando, ejecuta, delega parseo/errores
parseCommitList.ts        — función pura: stdout -> SHAs válidas (40 hex), o GitHistorySourceError("invalid_output")
GitHistorySourceError.ts  — tipo de error normalizado (git_not_found/not_a_repository/timeout/invalid_output/unknown)
```

Comandos exactos, ejecutados con `execFile("git", args, { cwd: repoRoot,
timeout: 10_000, windowsHide: true })` — argumentos siempre como array,
nunca interpolación de string:

```text
findCommitsTouchingPaths: git --no-pager log --no-color --pretty=format:%H --before=<ISO> -n <limit> -- <paths...>
findRenameHistory:        git --no-pager log --no-color --follow --pretty=format:%H --before=<ISO> -n <limit> -- <path>
```

`--pretty=format:%H` da una SHA completa por línea, sin truncar, sin
pasar por `head`/`tail`/pipes — el mismo tipo de parsing optimista que
truncó las magnitudes del golden dataset (Fase 4.8.5) no puede repetirse
aquí. Guard crítico antes de invocar Git: `paths.length === 0` devuelve
`[]` sin ejecutar nada — `git log -- ` sin pathspecs no es "sin
resultados", es "sin filtro de path" (historial completo). `--before` es
inclusivo por semántica real de Git (verificado); el adapter no intenta
excluir el propio commit — esa autoexclusión sigue siendo responsabilidad
exclusiva de `DeterministicCommitAnalyzer`, ya testeada.

**Corrección importante descubierta al construir el integration test.**
§14g documentaba como caso motivador que `bf7f9fb` (persistencia) refuerza
a `96f2719` (dominio) "sin compartir paths". Al verificar contra Git real
(`git log -- <path>` sobre este mismo repositorio) esa premisa resultó
**falsa**: `bf7f9fb` sí comparte paths exactos con `96f2719` y `d3b5804` —
dos barrels `index.ts` (`packages/domain/src/memory/index.ts`,
`packages/application/src/common/ports/index.ts`) que `bf7f9fb` actualiza
al exportar el nuevo código de persistencia, y que ya habían sido tocados
por los commits de dominio anteriores. La causa: nunca se verificó la
premisa contra Git real antes de usarla para justificar una decisión de
diseño — exactamente el tipo de error que este proyecto intenta prevenir
con evidencia empírica en vez de intuición, y que en este caso se coló de
todos modos. Corregido en §14g/§14h, en el JSDoc de `CommitReference`/
`memory/index.ts`, y aquí. La decisión de mantener `recentRelatedCommits`
como heurística puramente estructural se sostiene por sus propios
méritos, no por ese ejemplo — el golden dataset no tiene todavía un caso
confirmado de relación conceptual real sin ningún overlap estructural.

**Evidencia — `tests/integration/git-history-source.test.ts`** (gateado
por `RUN_INTEGRATION_TESTS=true`, corre contra el historial real de este
repositorio, sin fixtures separados):

```text
☑ findCommitsTouchingPaths: devuelve [bf7f9fb, 96f2719, d3b5804] reales, más reciente primero
  (bf7f9fb incluido — before es inclusivo, la autoexclusión es del analyzer, no del adapter)
☑ respeta el límite de resultados
☑ path sin historial real -> lista vacía, no inventa nada
☑ paths vacíos -> vacío sin invocar Git (guard defensivo verificado)
☑ findRenameHistory sobre un archivo nunca renombrado -> coincide con su historial simple
☑ end-to-end: DeterministicCommitAnalyzer + GitHistorySource real sobre bf7f9fb ->
  recentRelatedCommits empieza con [96f2719, d3b5804], nunca se autorreferencia
```

Además, 8 tests unitarios de `parseCommitList` (formatos válidos, SHA
truncada/inválida, stdout vacío, líneas vacías intermedias, espacios).

`pnpm build && pnpm typecheck && RUN_INTEGRATION_TESTS=true pnpm test &&
npx eslint . && npx prettier --check .`: verde — 121 tests pasan (14
nuevos: 6 de integración + 8 del parser), 0 regresiones. Los 6 test files
que fallan con `RUN_INTEGRATION_TESTS=true` en un entorno sin PostgreSQL
corriendo (`ECONNREFUSED 127.0.0.1:5432`) son preexistentes y no
relacionados — dependen de Postgres real, no de este incremento.

**Estado de Fase 4.8.3 — CERRADA por completo**, contrato + lógica pura +
adapter real + integración contra Git verdadero. Con esto termina Fase
4.8.3. Siguiente incremento natural: `ICandidateExtractor` (interpretación
semántica) — fuera de alcance de este cierre.

## 14j. Fase 4.8.4 — DeterministicCandidateExtractor: decisión

**Objetivo.** Primera implementación concreta de `ICandidateExtractor`:
reglas puramente deterministas, sin LLM, que solo proponen candidatos
cuando pueden defender la decisión con evidencia estructural disponible
en `CommitSignal`. Ninguna regla afirma verdad semántica — `outcome` es
siempre `"pending_review"`, nunca `"ready"`.

**Método.** Antes de escribir código: revisión de los 23 casos del
golden dataset, clasificados en 🟢 deterministic / 🟡 needs more
evidence / 🔴 needs semantics. De ahí salieron 5 reglas 🟢 aprobadas,
cada una respaldada por evidencia estructural cruzando ambos
repositorios (`guerrero-dev` y `gescomph-api`):

- **ADR_PATH** — cualquier path bajo `docs/adr/` → `type: "decision"`.
- **DOCS_PATH** — el 100% de los paths bajo `docs/` (y ninguno bajo
  `docs/adr/`, mutuamente excluyente con ADR_PATH) → `type: "knowledge"`.
- **SCHEMA_PATH** — cualquier path bajo `database/migrations/` o
  `database/schema/` → `type: "fact"` (nunca `"decision"`, restricción
  explícita: un cambio de esquema no implica por sí solo una decisión
  arquitectónica).
- **INTERFACE_IMPL_DI_PATTERN** — un archivo `I<Nombre>.(cs|ts)` tocado
  junto con algún otro archivo cuyo nombre de archivo (sin extensión)
  *contiene* `<Nombre>` → `type: "pattern"`.
- **TEST_PATH_PATTERN** — mayoría (>50%) de los paths tocados bajo
  convención de test → `type: "pattern"`.

**Correcciones durante el diseño, hechas ANTES de cerrar (no después).**
Igual que en 4.8.3, cada regla se validó contra datos reales de commits
concretos antes de aprobarse, y dos supuestos iniciales resultaron
incorrectos:

- `INTERFACE_IMPL_DI_PATTERN` asumía originalmente (a) que siempre
  habría un archivo de registro DI dedicado (`*ServiceCollectionExtensions.cs`
  / `*DependencyInjection.cs`), y (b) que el nombre base de la
  implementación sería exactamente igual al de la interfaz. El commit
  real `a384c61` (gescomph-api) contradijo ambos supuestos: solo tocó
  `Program.cs` (sin archivo DI dedicado) y `IObligationNotifier.cs` se
  implementa en `SignalRObligationNotifier.cs` (prefijo, no coincidencia
  exacta). Se relajó la regla: sin exigencia de archivo DI, y
  coincidencia por substring en vez de igualdad.
- `TEST_PATH_PATTERN` asumía originalmente que el 100% de los paths
  debían seguir convención de test. El commit real `bb705ac`
  (gescomph-api, 64 archivos) mostró 63/64 bajo `Test/` con un archivo
  no-test también tocado (`RolFormPermissionRepository.cs`). Se cambió
  el umbral a mayoría (>50%) — el umbral más simple que separa
  `bb705ac` (~98%) de `a384c61` (12.5%, donde 1/8 archivos es test) sin
  ajustarse a ninguno de los dos números exactos.

**Hallazgo de precisión documentado (no es un bug).** El commit real
`5d6b4a7` (gescomph-api) es un bug fix ordinario, originalmente
clasificado 🔴 en la matriz de decisión por no tener marcador
estructural obvio. Sin embargo toca `IEstablishmentsRepository.cs` +
`EstablishmentsRepository.cs`, por lo que `INTERFACE_IMPL_DI_PATTERN`
dispara igual — un falso positivo genuino desde la perspectiva de la
regla, que no puede distinguir "se introduce un patrón nuevo" de "se
toca un par interfaz+implementación ya existente por razones no
relacionadas". Se documenta como costo aceptado porque `outcome` es
siempre `pending_review`: el único costo de este falso positivo es una
revisión humana extra, nunca una memoria promovida incorrectamente.

**Contrato de nombres de reglas.** `DeterministicCandidateRuleName` es
un union type estable (`"ADR_PATH" | "DOCS_PATH" | "SCHEMA_PATH" |
"INTERFACE_IMPL_DI_PATTERN" | "TEST_PATH_PATTERN"`). El identificador de
regla vive únicamente en `MemoryCandidate.source.metadata.rule` — no se
agregó un campo `ruleName` al contrato de `CandidateExtractionResult`,
ya que `metadata` (`Record<string, unknown>`, ya existente) cubre la
misma necesidad sin ampliar la superficie del contrato.

**Evidencia.**

- 22 tests unitarios (`DeterministicCandidateExtractor.test.ts`) sobre
  fixtures sintéticos pero fundamentados en los mismos casos reales que
  motivaron cada regla.
- 19 tests de regresión sobre el golden dataset
  (`DeterministicCandidateExtractor.goldenDataset.test.ts`), 18 casos
  reales (`touchedPaths` verificados con `git show --name-only` contra
  los repositorios reales) cruzando `guerrero-dev` y `gescomph-api`,
  incluyendo el caso `5d6b4a7` documentado arriba y el caso `6537bec`
  (el gap conocido del noise filter), confirmando que el extractor no
  "arregla" ese gap por accidente.
- Suite completa verificada en sandbox limpio (clon fresco +
  `pnpm install --frozen-lockfile`): build ✅, typecheck ✅, **152/152
  tests** (41 nuevos: 22 unitarios + 19 de regresión, 0 regresiones),
  eslint limpio ✅, prettier limpio ✅ (tras corregir formato en 3
  archivos nuevos).

**Estado de Fase 4.8.4 — CERRADA por completo.** `ICandidateExtractor`
tiene ahora su primera implementación concreta, completamente
determinista, con las 5 reglas documentadas arriba. Siguiente
incremento natural (no iniciado, pendiente de decisión): o bien cablear
`CandidateDetectionService` de punta a punta con implementaciones
reales, o diseñar un `ICandidateExtractor` basado en LLM para los casos
que las reglas deterministas correctamente declinan resolver
(`outcome: []` — 11 de los 18 casos verificados, ~mitad del dataset
completo de 23).

## 14k. Commit Collector: decisión arquitectónica nueva, no especificada originalmente

Auditoría de Fase 4.8 (`docs/fase-a-auditoria.md`, revisión adicional
post-4.8.4) encontró un hueco no reconocido hasta ese momento: ningún
puerto ni implementación traducía un commit real de Git a
`CommitSnapshot` — el único rastro era el nombre "Commit Collector" en
el JSDoc de `CommitSnapshot.ts`. Sin él, `DeterministicCommitAnalyzer`/
`DeterministicCommitNoiseFilter`/`DeterministicCandidateExtractor`
(4.8.x-4.8.4) solo podían probarse con `CommitSnapshot`/`CommitSignal`
construidos a mano — nunca contra un commit real de punta a punta.
Confirmado explícitamente antes de escribir código: esto **no** era un
requisito que el diseño original de 4.8 hubiera dejado pendiente por
escrito, es una decisión arquitectónica nueva para cerrar un vacío real.

**`ICommitCollector`** (`application/memory/ports`): puerto angosto,
`collect(sha): Promise<CommitSnapshot>`, mismo criterio que
`IGitHistorySource` — una sola responsabilidad, sin decidir ruido,
riesgo, ni candidatas.

**`GitCommitCollector`** (`infrastructure/git`), tres invocaciones de
Git separadas por responsabilidad:

```text
git show -s --format=%H␟%an␟%aI␟%B <sha>   -> metadata + mensaje completo
git show --no-color --format= <sha>         -> diff (format vacío suprime el header)
git show --no-color --format= --name-only <sha> -> changedFiles
```

`␟` = ASCII 0x1F (unit separator), elegido para no colisionar con texto
real de autor/mensaje — mismo criterio anti-parsing-optimista que ya
costó las magnitudes truncadas del golden dataset (§14i).

**Dos bugs reales encontrados corriendo la integration test contra Git
en Windows** (no reproducibles en Linux, corregidos en la misma
iteración, no ocultados):

1. El mensaje llegaba con un `\r` colgante. Verificado con `xxd` contra
   Git real: `git show -s --format=...` deja **dos** saltos de línea sin
   contenido real al final (el propio `%B`, que Git normaliza a un único
   `\n` al commitear — probado creando un commit real con
   `"subject\n\n\n\n"`, quedó guardado como `"subject\n"` — y el
   separador que el comando agrega después de todo el bloque
   formateado), y en Windows ese segundo salto llega como `\r\n`. Fix:
   normaliza `\r\n` -> `\n` y recorta *todos* los saltos de línea
   finales, no uno.
2. `EBUSY` de Windows al borrar un directorio temporal justo después de
   un `execFile("git", ...)` corrido adentro — condición de carrera del
   SO, no del código. Fix: `fs.rm` con `maxRetries`/`retryDelay`.

**Alcance estrictamente acotado** (acordado antes de implementar): NO
`RiskSignal`, NO wiring a `CandidateDetectionService`/CLI/API/cron, NO
LLM, NO Fase 5+. `CommitSnapshot` no se modificó.

**Estado:**

```text
☑ ICommitCollector (puerto)
☑ GitCommitCollector (adapter real, execFile, mismo patrón que GitHistorySource)
☑ parseCommitMetadata / parseChangedFiles (funciones puras) — 15 tests unitarios
☑ integration tests contra Git real — 6/6 (commit simple, múltiples archivos,
  caracteres especiales reales, commit_not_found, not_a_repository,
  commit --allow-empty en repo temporal desechable)
☑ build + typecheck estricto + lint + prettier — verificados en Windows real
  (dos rondas de bugs reales encontrados y corregidos, ver arriba)
```

**Commit Collector — CERRADO**, con el mismo criterio que el resto de
Fase 4: no se dio por cerrado hasta pasar contra Git real en el entorno
de desarrollo real, no solo build/typecheck. Commits:
`1bb42f3` (`feat(memory): add git commit collector`), `3ebc92a` y
`1dbcb79` (fixes de la verificación en Windows real).

## 14l. CandidateDetectionService: tests propios + validación real de punta a punta (Commit 2)

Auditoría de Fase 4.8 tras cerrar el Commit Collector (§14k) encontró un
segundo hueco: `CandidateDetectionService` orquesta `ICommitAnalyzer` →
`ICommitNoiseFilter` → `ICandidateExtractor` correctamente en el código,
pero no tenía ningún test propio (`CandidateDetectionService.test.ts` no
existía), y ningún punto del código conectaba
`GitCommitCollector` → `CandidateDetectionService` — la cadena completa
nunca había corrido, ni una vez, contra Git real.

Decisión explícita (antes de escribir código): no implementar
`RiskSignal` producers todavía, aunque fuera el hueco visible más obvio.
`RiskSignal` es solo un tipo — `DeterministicCandidateExtractor` ya lo
referencia en su contrato pero nunca lo produce (`riskSignals: []`
siempre) — construir un producer ahora habría agregado una dimensión
nueva sobre un orquestador todavía sin probar. El objetivo real de Fase
4.8 en este punto es que la detección de candidatas sea confiable desde
Git real, no ampliar el modelo de riesgo.

**Commit 2 — dos piezas, un mismo objetivo verificable:**

1. `CandidateDetectionService.test.ts` (9 tests, dobles de test
   "tontos" para `ICommitAnalyzer`/`ICommitNoiseFilter`/`ICandidateExtractor`,
   mismo criterio que `fakeGitHistorySource` en
   `DeterministicCommitAnalyzer.test.ts`): corte temprano cuando el
   noise filter descarta, propagación exacta del `CommitSignal` entre
   analyzer → noise filter → extractor, verificación por conteo de
   llamadas de que el extractor NO se ejecuta si `discard: true`, y que
   los resultados del extractor se devuelven sin transformar.
2. `tests/integration/candidate-detection-pipeline.test.ts`: cadena
   completa contra infraestructura real, ningún `CommitSnapshot`
   hardcodeado —

   ```text
   Git real -> GitCommitCollector -> CommitSnapshot ->
   DeterministicCommitAnalyzer (+ GitHistorySource real) -> CommitSignal ->
   DeterministicCommitNoiseFilter -> DeterministicCandidateExtractor ->
   CandidateDetectionService.detect()
   ```

   Dos commits reales ya verificados en tests anteriores (no se
   introduce evidencia nueva sin confirmar): `bf7f9fb` (21 archivos
   reales, dispara `SCHEMA_PATH` + `INTERFACE_IMPL_DI_PATTERN` — mismo
   commit ya usado en `git-commit-collector.test.ts` y
   `git-history-source.test.ts`) y `a1dc883` (solo `.gitignore` +
   `*.tsbuildinfo`, caso real del golden dataset y del docstring de
   `DeterministicCommitNoiseFilter`, confirma que el pipeline corta
   antes del extractor sin producir ninguna candidata).

**Alcance estrictamente acotado** (acordado antes de implementar): NO
`RiskSignal` producers, NO wiring a CLI/API/cron, NO LLM extraction, NO
Fase 4.9, NO Fase 5+. Ningún contrato existente (`CommitSnapshot`,
`CommitSignal`, `CandidateExtractionResult`, `RiskSignal`) se modificó.

**Estado — verificado en el entorno real:**

```text
☑ build (11 proyectos)
☑ typecheck estricto
☑ 200/200 tests unitarios (CandidateDetectionService.test.ts: 9/9)
☑ 44/44 tests de integración (candidate-detection-pipeline.test.ts: 2/2,
  1130ms — incluye bf7f9fb con SCHEMA_PATH+INTERFACE_IMPL_DI_PATTERN
  reales y a1dc883 cortado antes del extractor)
☑ lint limpio
☑ format:check limpio
```

**Commit 2 — CERRADO**, con el mismo criterio que el Commit Collector:
verificado contra Git real, PostgreSQL y el entorno real de desarrollo,
no solo build/typecheck en sandbox. Commit: `e24052a`
(`test(memory): verify candidate detection pipeline`).

## 14m. Fase 4.8 — CERRADA. RiskSignal: capacidad contractual diferida (decisión explícita, no pendiente)

Con el Commit Collector (§14k) y `CandidateDetectionService` verificado
de punta a punta contra Git real (§14l), se evaluó si `RiskSignal`
producers debía ser el siguiente incremento — era el único hueco
visible restante. Se revisó el código real antes de decidir, no la
memoria de auditorías previas:

```text
RiskSignal
    ↓
CandidateExtractionResult
    ↓
       ❌ frontera actual — sin wiring
MemoryCandidateEvaluator.evaluate(candidate: MemoryCandidate)
```

`MemoryCandidateEvaluator.evaluate()` (Fase 4.7) recibe únicamente
`MemoryCandidate`, no `CandidateExtractionResult` — ni `riskSignals` ni
`outcome: "pending_review"` tienen hoy ningún camino hacia scoring,
promotion, policy o conflict detection sin antes rediseñar esa frontera
entre 4.7 y 4.8. Confirmado por grep: ningún archivo del código
(scoring, promotion, policy, conflict) referencia `riskSignals` fuera
de su propia definición y de `DeterministicCandidateExtractor`/
`CandidateDetectionService`, que solo lo propagan vacío.

**Decisión explícita de alcance** (no "pendiente", no "olvidado"):

> `RiskSignal` permanece como capacidad contractual diferida. No se
> implementan productores mientras no exista un consumidor funcional y
> una especificación verificable de las señales de riesgo. La
> detección de candidatos de Fase 4.8 se considera completa con el
> pipeline determinista Git → CandidateDetectionService → Candidate,
> validado contra Git real.

Razón para no implementarlo ahora, no solo "falta de tiempo": el único
caso motivador conocido (`gescomph-api/92475e3`, bypass CSRF invisible
en el mensaje del commit, solo detectable leyendo el diff completo) es
estructuralmente más difícil que las 5 reglas deterministas actuales
del extractor (todas basadas en paths) — no hay evidencia todavía de
que un productor determinista lo capture sin inventar semántica.
Implementarlo ahora habría exigido decidir simultáneamente: qué
significa cada tipo de riesgo, qué reglas lo generan, cómo afecta al
scoring, cómo afecta a la promoción, cómo llega a revisión humana, y
cómo se diferencia de `confidence`/`importance` — eso ya no sería
"terminar 4.8", sería rediseñar la frontera 4.7↔4.8 sin necesidad
funcional demostrada. Mismo criterio que `NoopMemoryConflictDetector`
en 4.7 (§14e-bis): un placeholder documentado, no un gap oculto.

**Estado final de Fase 4.8:**

```text
FASE 4.8 — Candidate Detection
────────────────────────────────────────
Noise Filter                 ✅
Commit Analyzer              ✅
GitHistorySource             ✅
Candidate Extractor          ✅
GitCommitCollector           ✅
CandidateDetectionService    ✅
Git → Candidate E2E          ✅ (bf7f9fb, a1dc883 — Git real)
────────────────────────────────────────
RiskSignal producers         ⏸ DIFERIDO (decisión explícita arriba)
────────────────────────────────────────
FASE 4.8                     CERRADA
```

**Siguiente paso del plan original de Fase 4** (no Fase 5 todavía):
4.9 — End-to-End Scenarios, cruzando el pipeline completo
`Git → Detection → Candidate → Evaluation → Deduplication → Scoring →
Promotion → Memory` contra infraestructura real. Alcance y criterios de
aceptación de 4.9 se definen antes de escribir código, mismo criterio
que 4.7 y 4.8.

## 14n. Fase 4.9-A — Git real -> Memory persistida (primer escenario end-to-end)

Alcance acordado antes de escribir código: 4.9 tiene cinco escenarios
(A nuevo candidato, B duplicado, C score insuficiente, D commit
ruidoso, E conflicto — explícitamente fuera de alcance mientras
`NoopMemoryConflictDetector` siga siendo un placeholder). Se implementa
uno a la vez, empezando por A (happy path completo), porque si esa
columna vertebral funciona contra infraestructura real, B/C/D se
apoyan en la misma cadena.

**`tests/integration/candidate-promotion-e2e.test.ts`** conecta por
primera vez en código lo que hasta 4.8 solo existía como piezas
probadas por separado:

```text
Git real -> GitCommitCollector -> DeterministicCommitAnalyzer
(+ GitHistorySource real) -> DeterministicCommitNoiseFilter ->
DeterministicCandidateExtractor -> CandidateDetectionService ->
MemoryCandidateEvaluator (Validator + Deduplicator real con
OllamaEmbeddingProvider + DrizzleMemoryCandidateRetriever reales +
NoopMemoryConflictDetector + Scorer) -> MemoryCandidatePromoter
(+ DrizzleMemoryPromotionUnitOfWork real) -> PostgreSQL + pgvector
```

Reusa `bf7f9fb` (mismo commit ya verificado en 4.8): produce un
candidato `SCHEMA_PATH` con `confidence=0.5`/`importance=0.5`/
`sourceType="commit"`, score real `0.6` con la fórmula de
`MemoryCandidateScorer` — por encima del umbral `0.5` sin ajustar nada.

**Problema de repetibilidad encontrado antes de escribir el test, no
después:** `bf7f9fb` es determinista — el mismo candidato con el mismo
`content` en cada corrida. Contra el mismo PostgreSQL real sin reset
entre ejecuciones (así corre `pnpm test:integration` en el entorno de
Santiago), la segunda corrida de la suite encontraría la `Memory`
creada por la primera como "duplicado" (similitud ~1.0) — el escenario
dejaría de ser un CREATE. No es un bug de `MemoryCandidatePromoter`:
tratar un candidato idéntico como duplicado es correcto. Es un
problema de repetibilidad del fixture persistente.

**Decisión de aislamiento** (explícitamente NO `projectId`, porque
`DeterministicCandidateExtractor` siempre produce `scope: "global"`,
`projectId: null` — el proyecto de test no representa el ámbito real
de la memoria): limpieza SQL en `beforeAll`, acotada estrictamente a
`sourceReference = BF7F9FB`, no un reset global. Verificado en los
schemas de Drizzle antes de escribir el DELETE: `memory_sources`,
`memory_relations` y `memory_embeddings` tienen `ON DELETE CASCADE`
hacia `memories.id`, así que borrar la `Memory` encontrada por esa
`sourceReference` es suficiente y no puede tocar datos de otro
escenario o de otro archivo de test. El test además verifica su propia
limpieza (`0 MemorySource` para ese sha antes de correr el escenario),
no confía ciegamente en que el DELETE funcionó.

Explícitamente descartado: `TRUNCATE`, reset de esquema, contenido con
UUID aleatorio (habría alterado la evidencia real que el escenario
necesita demostrar), y modificar `CandidateExtractor`/`Promoter`/
contratos existentes para acomodar el test.

**Alcance estrictamente acotado**: NO 4.9-B/C/D todavía, NO
`RiskSignal`, NO `ConflictDetector` real, NO CLI/API/cron, NO Fase 5+.

**Estado: pendiente de verificación en el entorno real** — y no basta
una corrida. Se requieren dos ejecuciones consecutivas de
`RUN_INTEGRATION_TESTS=true pnpm test:integration`: la primera prueba
el CREATE contra un Postgres que puede tener residuos de una ejecución
previa a este cambio; la segunda prueba que la limpieza del `beforeAll`
deja el mismo estado inicial y el resultado vuelve a ser CREATE, no que
el candidato se detecta como su propio duplicado — exactamente el bug
de repetibilidad que motivó el diseño de la limpieza.

## 15-18. Contratos de dominio

```text
packages/domain/src/memory/
├── Memory.ts
├── MemoryCandidate.ts
├── MemorySource.ts
├── MemoryRelation.ts
├── MemoryEmbedding.ts
├── MemoryType.ts
├── MemoryScope.ts
└── MemoryStatus.ts
```

```typescript
export interface Memory {
  readonly id: string;
  readonly projectId: string | null;
  readonly scope: MemoryScope;
  readonly type: MemoryType;
  readonly content: string;
  readonly status: MemoryStatus;
  readonly confidence: number;
  readonly importance: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastVerifiedAt: Date | null;
  readonly expiresAt: Date | null;
}
```

`Candidate ≠ Memory`: `MemoryCandidate` no tiene `id`, `status` ni timestamps propios —
es la entrada al pipeline de evaluación, no una entidad persistida.

## 19-21. Repository y Retrieval (puertos de Application — Fase 4.4/4.6)

```typescript
export interface MemoryRepository {
  create(memory: Memory): Promise<Memory>;
  findById(id: string): Promise<Memory | null>;
  update(memory: Memory): Promise<Memory>;
  invalidate(id: string, reason: string): Promise<void>;
  findByProject(projectId: string): Promise<Memory[]>;
}

export interface MemoryRetriever {
  search(query: MemorySearchQuery): Promise<MemorySearchResult[]>;
}

export interface MemorySearchQuery {
  readonly text: string;
  readonly projectId?: string;
  readonly types?: MemoryType[];
  readonly scopes?: MemoryScope[];
  readonly limit?: number;
}

export interface MemorySearchResult {
  readonly memory: Memory;
  readonly score: number;
  readonly reasons: string[]; // p.ej. ["semantic_similarity", "same_project", "high_confidence"]
}
```

No se agregan más métodos de los que un caso de uso real necesita.

## 22-23. Hybrid retrieval

El score no es solo cosine similarity — pesos iniciales, no dogma, se miden con casos
reales:

```text
score = semanticSimilarity * 0.50
      + projectRelevance   * 0.20
      + confidence         * 0.15
      + importance         * 0.10
      + recency            * 0.05
```

Razón para no darle 100% al embedding: una memoria semánticamente parecida puede venir
de otro proyecto (p.ej. "JWT + Refresh Tokens" de GESCOMPH cuando se pregunta por
autenticación en Miller, que usa OAuth + Sessions). El filtro contextual debe pesar.

## 24-27. Memory Service y evaluación de candidatos (Fase 4.7)

Casos de uso previstos en `MemoryService`: `CreateMemory`, `EvaluateCandidate`,
`SearchMemory`, `UpdateMemory`, `InvalidateMemory`, `RelateMemories`. Primera
implementación: solo `CreateMemory`, `SearchMemory`, `EvaluateCandidate`.

```typescript
export interface MemoryEvaluation {
  readonly accepted: boolean;
  readonly confidence: number;
  readonly importance: number;
  readonly duplicateOf: string | null;
  readonly conflictsWith: string[];
  readonly reason: string;
}
```

Ejemplo de deduplicación: candidato "Este proyecto utiliza Clean Architecture" vs.
Memory #81 "El proyecto Miller utiliza Clean Architecture" con similarity 0.96 →
`duplicateOf = #81`, no se crea una memoria nueva; se actualiza `lastVerifiedAt`,
`confidence`, `source`.

Ejemplo de contradicción: Memory A "Clean Architecture" vs. Memory B "arquitectura
hexagonal" → se registra el conflicto (`contradicts`), no se le pide al LLM que decida
automáticamente quién tiene razón. Resolución con evidencia queda para un
`ConflictResolver` posterior.

## 28-29. Flujo de retrieval y Context Builder

```text
User query → MemorySearchQuery → [structured filters, embedding] → PostgreSQL
  → candidates → ranking → Top K
```

El LLM nunca habla directamente con PostgreSQL:

```text
LLM → Context Builder → Memory Retriever → Repository → PostgreSQL
```

## 30. Arquitectura completa

```text
                         AGENT
                           │
                           ▼
                    Context Builder
                           │
                           ▼
                    Memory Retriever
                           │
              ┌────────────┴────────────┐
              ▼                         ▼
       Structured Search          Semantic Search
              │                         │
              └────────────┬────────────┘
                           ▼
                        Ranking
                           │
                           ▼
                         Memory
                           │
             ┌─────────────┼─────────────┐
             ▼             ▼             ▼
          Sources       Relations     Embeddings
             │             │             │
             └─────────────┼─────────────┘
                           ▼
                       PostgreSQL
                         + pgvector
```

## 31. Explícitamente fuera de alcance por ahora

```text
❌ automatic memory extraction desde cada conversación
❌ aprendizaje automático de patrones
❌ conflict resolution avanzado
❌ knowledge graph completo
❌ re-ranking con LLM
❌ múltiples embedding models
❌ memoria distribuida
❌ Redis
```

## 32. Primer vertical slice de Memory (criterio de validación)

```text
1. Crear proyecto Miller
2. Crear Memory
3. Registrar Source
4. Generar embedding
5. Guardar PostgreSQL
6. Buscar "¿Qué DB utiliza Miller?"
7. Recuperar Memory
8. Obtener score + evidencia
```

## 10. Orden de implementación

> Nota: el orden ejecutado difiere levemente de la planificación original de esta
> tabla — Fase 4.4 pasó a ser el Embedding Provider (no `MemoryRepository`,
> que ya había quedado resuelto como parte de la persistencia de Fase 4.3).
> Se documenta aquí el orden real, no el original.

| Bloque | Alcance | Estado |
|---|---|---|
| 4.1 — Diseño | Diseño conceptual completo | ✅ `666edb9` |
| 4.2 — Domain | `Memory`, `MemoryCandidate`, `MemorySource`, `MemoryRelation`, `MemoryEmbedding`, invariantes, tests unitarios | ✅ `96f2719` |
| 4.3 — Persistence | `memories`, `memory_sources`, `memory_relations`, `memory_embeddings`, repositorios Drizzle | ✅ `bf7f9fb` |
| 4.4 — Embedding Provider | `IEmbeddingProvider` (embed + embedBatch), `OllamaEmbeddingProvider`, benchmark reproducible (ver §14b) | ✅ implementado + benchmark real corrido |
| 4.5 — Embedding Persistence | `IMemoryEmbeddingRepository`, `DrizzleMemoryEmbeddingRepository`, migración `vector(1024)` + índice HNSW (ver §14c) | ✅ 24/24 integration tests reales |
| 4.6 — Retrieval | `IMemoryCandidateRetriever`/`IMemoryRanker`/`IMemoryRetriever` (ver §14d), `MemoryRanker`, `DrizzleMemoryCandidateRetriever`, `MemoryRetriever` | ✅ 28/28 integration tests reales |
| 4.7 — Candidate Engine | `MemoryEvaluation`, `MemoryCandidateEvaluator`, `IMemoryPromotionUnitOfWork`, `MemoryCandidatePromoter` (ver §14e) | ✅ 30/30 integration tests reales |
| 4.8 — Candidate Detection | `CandidateDetector` (Git → `MemoryCandidate`), diseño híbrido pendiente | ⏳ |
| 4.9 — Tests | duplicate memories, wrong project, expired memory, conflicting memory, ranking | ⏳ |

4.2 no toca API, PostgreSQL ni pgvector — primero el dominio queda sólido.

## Nota de hardware

Máquina de desarrollo: i5 HX, 24 GB RAM, RTX 3050 6 GB VRAM. El Memory Engine no asume
que un LLM local grande esté permanentemente cargado — la memoria funciona
independientemente del provider (`Ollama`, API cloud, u otro) sin tocar la base de
datos ni el dominio.

## Estado

```text
Diseño conceptual        ████████████████████ 100%
Modelo de dominio         ████████████████████ 100%
Schema DB                 ████████████████████ 100%  (vector(1024) + HNSW, migración 0003)
Contratos                 ████████████████████ 100%
Embedding provider        ████████████████████ 100%  (qwen3-embedding:4b + 1024, benchmark real corrido)
Embedding persistence      ████████████████████ 100%  (24/24 integration tests contra pgvector real)
Retrieval                  ████████████████████ 100%  (28/28 integration tests contra pgvector real;
                                                        falta el benchmark de retrieval con ground truth)
Candidate Engine            ████████████████████ 100%  (evaluación + promoción transaccional, 30/30
                                                        integration tests reales; Validator/Deduplicator/
                                                        ConflictDetector/Scorer reales aún pendientes)
Candidate Detection (4.8)   ████████████████░░░░  80%  (contratos + DeterministicCommitNoiseFilter
                                                        cerrado (100% precisión / 75% recall sobre 23
                                                        commits reales) + ICommitAnalyzer determinista
                                                        cerrado por completo: DeterministicCommitAnalyzer +
                                                        GitHistorySource real + integración contra Git
                                                        verdadero + DeterministicCandidateExtractor
                                                        cerrado (5 reglas deterministas, primera
                                                        implementación concreta de ICandidateExtractor;
                                                        152 tests, 0 regresiones); pendiente cablear
                                                        CandidateDetectionService end-to-end y decidir
                                                        ICandidateExtractor basado en LLM)
```
