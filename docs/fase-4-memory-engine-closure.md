# Fase 4 — Memory Engine

## Estado: CLOSED

**Precede a:** `docs/fase-4-memory-engine.md` (diseño y bitácora de decisiones
completa, §1–§14q). Este documento no repite ese razonamiento — lo cierra.
**Checkpoint remoto:** `44abf76` (`origin/main`, verificado sincronizado con
`HEAD` local al momento de este cierre).
**Precede a:** Fase 5 — Project Intelligence.

---

## 1. Objetivo de la fase

Construir un subsistema de memoria con ciclo de vida, evidencia, confianza y
recuperación contextual, capaz de: detectar candidatos de conocimiento a
partir de fuentes reales (Git), evaluarlos, deduplicarlos, puntuarlos y
promoverlos a memoria persistente, recuperable mediante búsqueda híbrida
(semántica + señales estructuradas) contra infraestructura real
(PostgreSQL + pgvector + Ollama) — no contra dobles de test.

## 2. Alcance aprobado

```text
4.1  Domain / contratos
4.2  Application
4.3  Persistencia (memories, memory_sources, memory_relations, memory_embeddings)
4.4  Embedding Provider (Ollama)
4.5  Embedding Persistence (pgvector, HNSW)
4.6  Hybrid Retrieval (candidatos semánticos + ranking)
4.7  Candidate Evaluation / Promotion
4.8  Candidate Detection (Git → MemoryCandidate)
4.9  End-to-End Scenarios contra infraestructura real
```

Explícitamente fuera de alcance desde el diseño original: memoria distribuida,
Redis, `RiskSignal` producers, `ConflictDetector` real, wiring a CLI/API/cron,
extracción de candidatos vía LLM. Ver §9 para el detalle de cada diferido.

## 3. Arquitectura final

```text
Git
 │
 ▼
GitCommitCollector
 │
 ▼
DeterministicCommitAnalyzer (+ GitHistorySource real)
 │
 ▼
DeterministicCommitNoiseFilter
 │
 ▼
DeterministicCandidateExtractor
 │
 ▼
CandidateDetectionService
 │
 ▼
MemoryCandidate
 │
 ▼
MemoryCandidateEvaluator
 ├── DeterministicMemoryCandidateValidator
 ├── MemoryCandidateDeduplicator (Ollama + DrizzleMemoryCandidateRetriever + pgvector)
 ├── NoopMemoryConflictDetector (placeholder consciente)
 └── MemoryCandidateScorer
 │
 ▼
MemoryEvaluation { accepted, confidence, importance, duplicateOf, conflictsWith, reason }
 │
 ▼
MemoryCandidatePromoter (+ DrizzleMemoryPromotionUnitOfWork, transaccional)
 │
 ▼
PostgreSQL (memories + memory_sources + memory_relations) + pgvector (memory_embeddings)
```

Cada flecha de este diagrama fue verificada contra infraestructura real en
algún punto de 4.4–4.9, no solo diseñada — ver §6 y §7.

## 4. Estado por subfase

| Área | Estado | Evidencia |
|---|---|---|
| 4.1 Domain / Contratos | ✅ | `666edb9` |
| 4.2 Application | ✅ | `96f2719` |
| 4.3 Persistencia | ✅ | `bf7f9fb` |
| 4.4 Embedding Provider | ✅ | benchmark real (qwen3-embedding:4b, 1024 dim) — `docs/fase-4-memory-engine.md` §14b |
| 4.5 Embedding Persistence | ✅ | 24/24 integration tests reales — §14c |
| 4.6 Hybrid Retrieval | ✅ | 28/28 integration tests reales — §14d |
| 4.7 Candidate Evaluation / Promotion | ✅ | 30/30 → 36/36 integration tests reales — §14e, §14e-bis |
| 4.8 Candidate Detection | ✅ | Git real (`bf7f9fb`, `a1dc883`) — §14f–§14m |
| 4.9 End-to-End Scenarios | ✅ | 4 escenarios contra Git+PostgreSQL+Ollama reales — §14n–§14q |

## 5. Pipeline completo — cuatro ramas demostradas en 4.9

```text
Escenario                              Rama del sistema demostrada        Estado
──────────────────────────────────────────────────────────────────────────────
4.9-A  Git real → Memory persistida    create                              ✅
4.9-B  candidato reconocido duplicado  update (deduplicación real)         ✅
4.9-C  score bajo umbral estricto      rejected por score                  ✅
4.9-D  commit ruidoso                  descartado antes de llegar a 4.7    ✅
4.9-E  conflicto semántico             fuera de alcance (Noop)             ⏸
```

Cada escenario usa commits reales del propio repositorio (`bf7f9fb`,
`a1dc883`), embeddings reales de Ollama y persistencia real en PostgreSQL —
no hay ningún doble de test en la cadena de decisión (`Deduplicator`,
`Evaluator`, `Promoter`, `NoiseFilter`, `Analyzer` son todos implementaciones
reales, no fakes, en los cuatro escenarios).

## 6. Evidencia de verificación

Estado final, medido en la máquina de desarrollo (Windows real), no en un
sandbox sin acceso a Ollama/PostgreSQL:

```text
☑ Build (11 proyectos)
☑ Typecheck estricto
☑ Unit tests:        200/200
☑ Integration tests:  48/48 (13 archivos), corridos 3 veces consecutivas
                       sin residuo ni contaminación entre corridas
☑ pnpm lint           limpio
☑ pnpm format:check   limpio
☑ PostgreSQL + pgvector real
☑ Ollama real (qwen3-embedding:4b)
☑ Git real (commits del propio repositorio, no fixtures sintéticos)
```

`test:integration` corre con `--no-file-parallelism` desde el fix aplicado en
4.9-B (`1a506fd`) — decisión acotada al script de integración, sin tocar
`vitest.config.ts` ni el paralelismo de los tests unitarios. Ver
`docs/fase-4-memory-engine.md` §14o para el análisis completo de la carrera
que motivó el fix.

## 7. Escenarios end-to-end — qué demostró cada uno

- **4.9-A** (`92c71a0` / `5cf2854`): un commit real de Git termina, sin
  ningún doble de test, como fila de `Memory` + `MemorySource` en
  PostgreSQL, con score real de `MemoryCandidateScorer` y deduplicación
  resuelta contra pgvector real.
- **4.9-B** (`c93b34a` / `c4d5806`): un candidato real es reconocido por el
  deduplicador real como duplicado de una memoria existente;
  `MemoryCandidatePromoter` ejecuta `action: "updated"` sobre la misma fila.
  Reveló el gap de embeddings en promoción — ver §10.
- **4.9-C** (`7d6a728` / `96040d9`): un candidato real, evaluado con la
  fórmula real de scoring, queda por debajo del umbral y no se persiste
  memoria alguna.
- **4.9-D** (`c67ef5e` / `44abf76`): un commit real, ruidoso, es descartado
  antes de llegar a evaluación — ni `MemoryCandidateEvaluator` ni
  `MemoryCandidatePromoter` llegan a ejecutarse.

## 8. Invariantes y garantías

Lo que Fase 4 garantiza hoy, verificado contra infraestructura real:

- Ninguna `Memory` se crea sin pasar por `MemoryCandidateEvaluator`
  (validación + deduplicación + scoring).
- Toda promoción (`create` o `update`) ocurre dentro de una transacción
  atómica (`IMemoryPromotionUnitOfWork` — commit de las tres escrituras
  juntas o rollback verificado, no solo en el fake in-memory de los tests
  unitarios).
- Un candidato duplicado nunca se descarta por score bajo — la precedencia
  `duplicateOf != null` sobre `accepted` está probada explícitamente.
- Un candidato rechazado sin duplicado nunca genera una `MemoryRelation`
  huérfana.

Lo que **no** garantiza todavía — ver §9 y §10.

## 9. Diferidos y condiciones de reapertura

| Diferido | Estado | Condición de reapertura |
|---|---|---|
| `ConflictDetector` real | ⏸ `NoopMemoryConflictDetector`, siempre `[]` | Fase 5 introduce concurrencia, múltiples fuentes de candidatos simultáneas, o un escenario donde dos memorias puedan representar conocimiento incompatible — es decir, donde el Noop deje de ser inocuo. |
| `RiskSignal` producers | ⏸ tipo definido, sin productores ni consumidores | Aparece un consumidor real que tome decisiones sobre `riskSignals`/`pending_review`, o Fase 5 requiere esa señal para decidir promoción. Ver razonamiento completo en `docs/fase-4-memory-engine.md` §14m — el caso motivador conocido (bypass CSRF invisible en mensaje de commit) es estructuralmente más difícil que las reglas deterministas actuales, no hay evidencia de que un productor determinista lo capture sin inventar semántica. |
| `4.9-E` (conflicto) | ⏸ fuera de alcance | Depende directamente de que `ConflictDetector` real exista — no tiene condición de reapertura propia. |

Ninguno de los tres es deuda accidental: cada uno tiene su razonamiento
documentado en el momento en que se decidió diferirlo, no reconstruido
retroactivamente para este cierre.

## 10. Gaps operacionales conocidos

**Gap de invariante — `MemoryEmbedding` en promoción.**

```text
MemoryCandidatePromoter
        │
        ▼
     Memory
        │
        ▼
     ❌ MemoryEmbedding
```

`IMemoryPromotionUnitOfWork` / `MemoryPromotionRepositories` no exponen
`IMemoryEmbeddingRepository`. `MemoryCandidatePromoter` nunca escribe en
`memory_embeddings` al crear una `Memory`. Descubierto y documentado en
4.9-B (`docs/fase-4-memory-engine.md` §14o) antes de escribir código de ese
escenario, no como hallazgo posterior.

**Implicación operacional:** mientras este gap permanezca abierto, toda
`Memory` creada mediante este camino de promoción es invisible para
`DrizzleMemoryCandidateRetriever` (hace `INNER JOIN memory_embeddings`) y,
por extensión, para el deduplicador y para hybrid retrieval — incluyendo
autopromoción: el propio pipeline no reconocería como duplicado un segundo
candidato idéntico al que él mismo acaba de crear. Requiere reindexado
posterior (manual o por proceso batch) para participar plenamente en
retrieval.

**Clasificación:** decisión técnica pendiente sobre el contrato de 4.7, no
bug de una implementación prometida. No se corrige en Fase 4 — corregirlo
implica decidir cómo se comporta `IMemoryPromotionUnitOfWork` respecto a
`memory_embeddings`, decisión que no estaba tomada al cerrar 4.7 y que no se
toma retroactivamente aquí para no mezclar cierre documental con cambio de
contrato.

**Condición de reapertura:** Fase 5 depende de que toda `Memory` recién
promovida sea inmediatamente recuperable mediante hybrid retrieval sin paso
manual intermedio.

## 11. Criterio de cierre

> El alcance definido para Memory Engine fue implementado y verificado
> contra infraestructura real (Git, PostgreSQL, pgvector, Ollama). Las
> capacidades explícitamente diferidas (§9) no bloquean el objetivo de la
> fase y tienen condiciones concretas de reapertura. El gap operacional
> conocido (§10) está documentado, no oculto, y no se resuelve
> retroactivamente en este cierre.

Esto **no** significa que Memory Engine esté terminado en un sentido
absoluto, y no debe leerse así en el futuro: significa que el alcance que se
definió para esta fase quedó cubierto y verificado, con sus fronteras
explícitas. Cerrar Fase 4 no es agotar todo lo imaginable relacionado con
memoria — es entregar un sistema funcional con límites conocidos.

## 12. Checkpoint Git

```text
Repositorio:  Guerrero-077/guerrero-dev
Rama:         main
HEAD local:   44abf76
origin/main:  44abf76  (verificado con git fetch, sin diff)
Working tree: limpio (solo artefactos ignorados: dist/, node_modules/, *.tsbuildinfo)
```

Últimos commits de la cadena de cierre de Fase 4:

```text
44abf76 docs: Fase 4.9-D CERRADA - verificado 3x consecutivas en entorno real
c67ef5e test(memory): Fase 4.9-D - commit ruidoso real, sin candidato en absoluto
96040d9 docs: Fase 4.9-C CERRADA - verificado con dos ejecuciones consecutivas
7d6a728 test(memory): Fase 4.9-C - score real bajo umbral estricto, sin persistencia
c4d5806 docs: Fase 4.9-B CERRADA - verificado con dos ejecuciones tras el fix de paralelismo
1a506fd fix(test): serializa test:integration para evitar carrera entre 4.9-A y 4.9-B
c93b34a test(memory): Fase 4.9-B - candidato real reconocido como duplicado, UPDATE real
5cf2854 docs: Fase 4.9-A CERRADA - verificado con dos ejecuciones consecutivas
92c71a0 test(memory): Fase 4.9-A - Git real -> Memory persistida end-to-end
f0866f4 docs: Fase 4.8 CERRADA (§14m) - RiskSignal diferido como decision explicita de alcance
```

Este documento se commitea como el cierre formal — el commit que lo
introduce es la línea de demarcación entre Fase 4 y Fase 5.

## 13. Frontera hacia Fase 5

```text
              FASE 4 — MEMORY ENGINE
──────────────────────────────────────────
... 4.1 → 4.9-D (44abf76) ...
                  │
                  ▼
         [Fase 4 Closure — este documento]
                  │
                  ▼
──────────────────────────────────────────
       FASE 5 — PROJECT INTELLIGENCE
```

Regla acordada para la transición: **Fase 5 no modifica contratos de Fase 4
en silencio.** Si Project Intelligence descubre que necesita cambiar Memory
Engine (por ejemplo, resolver el gap de §10 porque retrieval inmediato pasa
a ser requisito), esa es una decisión explícita de frontera entre fases,
documentada como tal — no un cambio incidental dentro de trabajo de Fase 5.

Fase 5 empieza con su propio alcance y criterios de aceptación, definidos
antes de escribir código, mismo criterio aplicado en cada subfase de Fase 4.
