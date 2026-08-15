# Fase A — Auditoría (2026-08-15)

Auditoría del repo local (`C:\Dev\agente\guerrero-dev`) contra `docs/fase-4-memory-engine.md`, siguiendo el plan de recuperación de Santiago. Hecha antes de escribir código, sin modificar nada del repo (solo lectura + verificación en sandbox aislado).

## A2 — Git: HEAD, working tree, bf7f9fb

```
origin/main:  ... 93e9cd1 (fixes CI/doctor post Fase 3)
local main:   ... 93e9cd1 → 2e3240e → 666edb9 (Fase 4.1) → 96f2719 (Fase 4.2) → bf7f9fb (Fase 4.3)
                                                                                    ↑ HEAD, 4 commits sin pushear
```

**Hallazgo principal — no hay Fase 5, hay Fase 4 sin commitear.** Todo lo que el plan de Santiago describe como "Fase 5 en progreso" (`GitHistorySource`, `CandidateDetectionService`) es, según la propia documentación del proyecto (`docs/fase-4-memory-engine.md` §14f–14j), **Fase 4.8 — Candidate Detection**, una subfase de Memory Engine, no Project Intelligence. `packages/project-intelligence` sigue siendo el stub de Fase 3, intacto (ver A3).

Peor aún: **nada de Fase 4.4 a 4.8.4 está commiteado.** El working tree tiene, sin ningún commit:

- 15 archivos modificados (`git diff --stat`: 1184 inserciones / 88 borrados)
- 21 archivos/directorios nuevos sin trackear, incluyendo paquetes enteros: `packages/application/src/memory/{models,ports,services}/`, `packages/infrastructure/src/{embeddings,git}/`, `packages/infrastructure/src/database/{mappers,promotion,repositories,retrieval}/`, 5 archivos de `tests/integration/`, `scripts/benchmark-embeddings.ts`, `docs/benchmarks/`

Esto equivale a **5 subfases (4.4, 4.5, 4.6, 4.7, 4.8) mezcladas en un solo working tree sin diferenciar**, exactamente el escenario que la Fase O del propio plan de Santiago quiere evitar ("no mezclar Memory fixes + Git intelligence + Code intelligence en un mismo commit") — salvo que aquí ni siquiera hay commits que separar todavía.

## A1/A3 — Inventario por subfase (contra docs/fase-4-memory-engine.md)

| Subfase | Alcance | Código | Tests declarados | Commit |
|---|---|---|---|---|
| 4.1 Diseño | Modelo conceptual | — | — | `666edb9` ✅ pusheable |
| 4.2 Domain | `Memory`, `MemoryCandidate`, `MemorySource`, `MemoryRelation`, `MemoryEmbedding` | IMPLEMENTADO | unit | `96f2719` ✅ pusheable |
| 4.3 Persistence | tablas + repos Drizzle | IMPLEMENTADO | integration | `bf7f9fb` ✅ pusheable (HEAD actual) |
| 4.4 Embedding Provider | `IEmbeddingProvider`, `OllamaEmbeddingProvider`, benchmark | IMPLEMENTADO | unit + integration + benchmark real | ❌ sin commitear |
| 4.5 Embedding Persistence | `IMemoryEmbeddingRepository`, `DrizzleMemoryEmbeddingRepository`, migración 0003 | IMPLEMENTADO | 24/24 integration (según doc) | ❌ sin commitear |
| 4.6 Retrieval | `MemoryRanker`, `DrizzleMemoryCandidateRetriever`, `MemoryRetriever` | IMPLEMENTADO | 28/28 integration (según doc) | ❌ sin commitear |
| 4.7 Candidate Engine | `MemoryCandidateEvaluator`, `MemoryCandidatePromoter`, `IMemoryPromotionUnitOfWork` | IMPLEMENTADO (orquestación) | 30/30 integration (según doc) — **verificado independientemente, ver A4** | ❌ sin commitear |
| 4.7 — Validator/Deduplicator/ConflictDetector/Scorer | implementaciones reales | **NO EXISTE** — solo los 4 ports (`IMemoryCandidateValidator/Deduplicator/ConflictDetector/Scorer`), sin ninguna clase concreta | — | ❌ |
| 4.8.x Noise Filter | `DeterministicCommitNoiseFilter` | IMPLEMENTADO | golden dataset 23 commits | ❌ sin commitear |
| 4.8.3 Commit Analyzer | `DeterministicCommitAnalyzer`, `GitHistorySource` real (execFile) | IMPLEMENTADO | 13 + 8 unit, integration contra Git real | ❌ sin commitear |
| 4.8.4 Candidate Extractor | `DeterministicCandidateExtractor`, 5 reglas | IMPLEMENTADO | 22 + 19 golden dataset | ❌ sin commitear |
| 4.8 — CandidateDetectionService | orquestador `analyzer→noiseFilter→extractor` | IMPLEMENTADO pero **huérfano** — solo se referencia a sí mismo y en barrels (`memory/index.ts`, `services/index.ts`); ningún caso de uso, CLI o API lo instancia | — | ❌ |
| 4.9 Tests de escenario | duplicate/wrong project/expired/conflicting/ranking | **NO EXISTE** | — | — |
| **Fase 5 Project Intelligence** | AST/grafo/RAG | **NO EXISTE** — `packages/project-intelligence/src/index.ts` sigue siendo el stub literal de Fase 3 | — | — |
| **Fase 6/7** | Code Intelligence, Cline/OpenCode | **NO EXISTE** — `packages/mcp` sigue siendo stub de Fase 3 | — | — |

Conclusión de A3: no hay drift hacia Fase 6/7 (bien — nadie tocó `mcp` ni instaló `@cline/sdk`). El drift real es de **alcance dentro de Fase 4**: se avanzó de 4.4 a 4.8.4 sin cerrar/commitear ninguna, y el plan original (`docs/fase-4-memory-engine.md` §10) preveía 4.9 como cierre antes de tocar detección — 4.9 no existe todavía.

## A4 — Auditoría de tests (verificación independiente, no solo lo que dice el doc)

Sandbox sin Docker/Postgres/Ollama disponibles (misma limitación que ya declara el propio proyecto en Fase 3 y 4.4) — no pude correr `pnpm test:integration` real. Encontré logs de una sesión de verificación previa en `/tmp` (`/sessions/inspiring-sweet-cannon/...`, no esta sesión) que sí corrió contra ese mismo repo en un punto anterior:

```
test7.log:  76 passed | 35 skipped (111 total) — coincide EXACTO con lo que
            docs/fase-4-memory-engine.md reporta al cierre de 4.7 ("76/76 en el
            suite completo"). Confirma independientemente que 4.2–4.7 son reales,
            no solo texto en el .md.
typecheck7.log / build7.log / eslint7.log / prettier8.log: todos en verde,
            mismo checkpoint (4.7, antes de 4.8.x).
```

No encontré un log equivalente para 4.8.x (152 tests) — esa cifra queda respaldada únicamente por el propio `.md`, sin verificación independiente de mi parte. Intenté correr `pnpm typecheck`/`pnpm test` en el working tree actual y no pude: el `node_modules` montado en esta carpeta se instaló en un entorno Windows (binarios `.exe`/`.CMD`/symlinks nativos) que no resuelve en el sandbox Linux de esta sesión (`Cannot find module '.../node_modules/typescript/bin/tsc'`). Reinstalar chocó con permisos del propio mount (`EPERM` en unlink — archivos de una sesión anterior). Esto **no es un problema del proyecto**, es una limitación de este entorno de auditoría — pero significa que el estado de 4.8.x (los 152 tests, el golden dataset, `GitHistorySource` contra Git real) está **verificado solo por lectura de código, no por ejecución**, a diferencia de 4.2–4.7 que sí tienen un log de ejecución real corroborando el `.md`.

Lo que sí verifiqué leyendo código directamente (no solo el `.md`):

- `CandidateDetectionService.detect()` (23 líneas) hace exactamente lo que el diseño describe: `analyzer.analyze → noiseFilter.shouldDiscard → (early return si discard) → extractor.extract`. Código limpio, sin trampas.
- `IMemoryCandidateValidator`, `IMemoryCandidateDeduplicator`, `IMemoryConflictDetector`, `IMemoryCandidateScorer` son **solo interfaces** — cero implementaciones concretas en todo el repo. El propio doc lo admite (`☐` en el checklist de 4.7), pero vale confirmarlo: no hay una implementación "a medias" oculta en otro lado.
- Nadie importa `CandidateDetectionService` fuera de sus propios barrels — no está conectado a `apps/api`, `apps/cli` ni a `MemoryCandidateEvaluator`/`Promoter` de 4.7. Es un componente terminado pero desconectado del resto del sistema.

## Respuesta directa: ¿en qué fase estamos?

No en la transición Fase 4 → Fase 5 que describías. Estamos **dentro de Fase 4, subfase 4.8, con 4.4–4.8 completas en el filesystem pero cero commiteadas**, y con dos huecos explícitos que el propio diseño ya había anotado: los 4 componentes reales del Candidate Engine (Validator/Deduplicator/ConflictDetector/Scorer) y el cableado end-to-end de `CandidateDetectionService`. Fase 4.9 (tests de escenario) y Fase 5 (Project Intelligence como paquete) no han empezado.

## Gaps concretos para Fase B en adelante (no implementar nada todavía — esto es insumo para Fase C-N)

1. **Higiene de Git, urgente y previa a cualquier código nuevo:** dividir el working tree actual en commits por subfase (4.4, 4.5, 4.6, 4.7, 4.8.x/4.8.3/4.8.4) siguiendo los "commit recomendado" que el propio `.md` ya sugiere al final de cada sección, y pushear. Mientras esto no pase, cualquier trabajo nuevo se apila sobre una base no versionada.
2. **Verificación real pendiente:** correr `pnpm test:integration` contra Postgres+Ollama reales (fuera de este sandbox) para confirmar los 152 tests de 4.8.4 con la misma evidencia dura que ya existe para 4.2–4.7.
3. **4.7 incompleto a propósito:** Validator/Deduplicator/ConflictDetector/Scorer reales — sin esto, `MemoryCandidateEvaluator` solo se ha probado con fakes, nunca con detección de duplicados/conflictos real.
4. **4.8 sin cerrar:** decidir e implementar cómo `CandidateDetectionService` se conecta a algo real (CLI, cron, hook de commit) — hoy es código muerto.
5. **4.9 no existe:** los tests de escenario (duplicate memory, wrong project, expired, conflicting, ranking) que el propio plan original preveía antes de considerar cerrado Memory Engine.
6. **Fase 5 real (Project Intelligence)** no debería tocarse hasta cerrar 1–5.
