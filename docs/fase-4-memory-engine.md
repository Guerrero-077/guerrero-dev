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
embedding
model
dimensions
created_at
```

No se hardcodea `vector(1536)` todavía — se define recién cuando se elija el
`IEmbeddingProvider` concreto (Fase 4.5).

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

| Bloque | Alcance |
|---|---|
| 4.2 — Domain | `Memory`, `MemoryCandidate`, `MemorySource`, `MemoryRelation`, `MemoryEmbedding`, invariantes, tests unitarios |
| 4.3 — Database | `memories`, `memory_sources`, `memory_relations`, `memory_embeddings` |
| 4.4 — Repository | `MemoryRepository` |
| 4.5 — Embeddings | `IEmbeddingProvider` (primero con un provider local) |
| 4.6 — Retrieval | `MemoryRetriever` |
| 4.7 — Candidate evaluation | `CandidateEvaluator` |
| 4.8 — Integration | `Project` + `Memory` + `AgentRun` |
| 4.9 — Tests | duplicate memories, wrong project, expired memory, conflicting memory, ranking |

4.2 no toca API, PostgreSQL ni pgvector — primero el dominio queda sólido.

## Nota de hardware

Máquina de desarrollo: i5 HX, 24 GB RAM, RTX 3050 6 GB VRAM. El Memory Engine no asume
que un LLM local grande esté permanentemente cargado — la memoria funciona
independientemente del provider (`Ollama`, API cloud, u otro) sin tocar la base de
datos ni el dominio.

## Estado

```text
Diseño conceptual       ████████████████████ 100%
Modelo de dominio        ████████████████████ 100%
Schema DB                ████████████████████ 100%
Contratos                ████████████████████ 100%
Implementación            ░░░░░░░░░░░░░░░░░░░░   0%
```
