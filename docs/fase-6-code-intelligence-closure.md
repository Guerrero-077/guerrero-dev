# Fase 6.x — Code Intelligence (incremento estructural/literal)

## Estado: CLOSED (6.1–6.5)

Cierre formal de la primera incrementación de Fase 6 ("6.x" en el mapa),
siguiendo el mismo criterio de rigor que
`docs/fase-5-project-intelligence-closure.md`: este documento captura el
estado final verificado tras 6.5, re-ejecutado en el mismo turno en que
se escribió, contra `guerrero-dev` real — no reconstruido de memoria de
checkpoints anteriores. No cubre 6.y (recuperación semántica/RAG) ni
6.z (grafo de llamadas resuelto) — ambos explícitamente diferidos por
`docs/fase-6-code-intelligence-map.md` §3.

## 1. Objetivo de 6.x

> Que Guerrero Dev pueda responder, para un proyecto ya perfilado por
> Fase 5, preguntas sobre qué hace el código, dónde está y cómo se
> relaciona; en particular, determinar dónde debería modificarse algo
> para lograr un cambio concreto.

6.x resuelve esto con evidencia estructural (`CodeSymbol`/
`DependencyEdge`, vía AST sintáctico) y literal (`LiteralMatch`, vía
texto plano) — no con interpretación de intención en lenguaje natural,
que queda para una evolución posterior de Fase 6 (mapa §2/§3).

## 2. Contrato del mapa — matriz de criterios (§12)

| Criterio (§12 del mapa) | Estado | Evidencia |
|---|---|---|
| Los 6 `kind` cubiertos, verificados contra archivos reales | ✅ | §3 — `function/class/interface/type/const/method` todos presentes en el análisis real de 6.5 |
| `exported` correcto en el 100% de los símbolos de un scan real | ✅ | `fase-6-acceptance.test.ts`: `isValidCodeSymbol` (que incluye la regla de `exported`/`containerName`) sobre el 100% de los symbols reales |
| `containerName` correcto, incluido el caso Mapper | ✅ | §3 — `ProjectProfileMapper`/`toDomain`/`toRow` verificados con sus propiedades exactas |
| Variantes sintácticas de import/re-export verificadas — reales por dogfooding, sintéticas por fixture | ✅ | Reales: `application/src/index.ts` (re-export puro, `importedNames: ["*"]`). Sintéticas: las 9 variantes de §6e, cubiertas en `extractEdges.test.ts` (6.3) |
| `findSymbolsByName` localiza símbolos reales sin falsos negativos | ✅ | §3 — `ContextBuilder` localizado vía la superficie de consulta real |
| Búsqueda literal localiza coincidencias reales sin requerir `CodeSymbol` | ✅ | §3 — 32 coincidencias reales de `"ProjectProfileMapper"`, ninguna exige corresponder a un símbolo |
| Determinismo: mismo repo → mismo `CodeIndex` | ✅ | §3 — dos análisis reales consecutivos, `deep-equal` verificado |
| `ts-morph`/`typescript` no aparecen en imports de `domain`/`application` | ✅ | §4 — comando reproducible, salida vacía |
| `packages/project-intelligence` permanece sin modificar | ✅ | Sin commits sobre ese path en todo 6.1–6.5 (verificado abajo) |
| Build + typecheck + lint + tests unitarios + tests de integración reales | ✅ | §5 |
| Documento de cierre | ✅ | Este documento |

Explícitamente fuera del criterio de cierre de 6.x (mapa §12, sin cambios): type-checker/grafo de llamadas resuelto, RAG/embeddings, razonamiento LLM sobre arquitectura (caso D, mapa §2), persistencia del índice, `.tsx`, otros lenguajes.

## 3. Evidencia de dogfooding — 6.3 + 6.4 sobre `guerrero-dev` real

Ejecutado en este mismo turno, componiendo `TsMorphCodeAnalyzer` (6.3) y
`LiteralCodeSearch` (6.4) reales — sin fixtures — vía
`tests/integration/fase-6-acceptance.test.ts`
(`RUN_INTEGRATION_TESTS=true`, 9/9 passed):

```text
Extracción real (snapshot histórico, no assertion del test):
  symbols: 640   (function 161, interface 119, const 155, type 42, class 57, method 106)
  edges:   818   (import 630, re-export 188)

Determinismo:
  dos analyze() consecutivos → symbols y edges deep-equal (JSON idéntico)

ProjectProfileMapper.ts (caso Mapper real):
  ProjectProfileMapper  → const, exported: true,  containerName: null
  toDomain               → method, exported: false, containerName: "ProjectProfileMapper"
  toRow                  → method, exported: false, containerName: "ProjectProfileMapper"

ContextBuilder (packages/agent-core/src/ContextBuilder.ts):
  → class, exported: true, containerName: null — localizado vía findSymbolsByName

application/src/index.ts (caso re-export puro):
  → 7 edges, 100% kind: "re-export", 100% importedNames: ["*"], 0 imports
  (creció de 6 a 7 desde la auditoría original de diseño porque 6.2 agregó
  code-intelligence/index.js — el análisis lo captó sin ningún ajuste manual)

apps/api/src/plugins/database.ts (exclusión de declare module):
  → único símbolo: DatabasePluginOptions (interface)
  → ningún símbolo derivado de `declare module "fastify" { interface FastifyInstance {...} }`

Búsqueda literal ("ProjectProfileMapper" sobre todo el árbol .ts trackeado):
  → 32 coincidencias reales, 100% válidas (isValidLiteralMatch)
```

Los conteos globales (640/818/32) se documentan como evidencia histórica
de esta ejecución, no como criterio de cierre — cambiarán con cada
commit ajeno a Code Intelligence. `fase-6-acceptance.test.ts` nunca los
asume; verifica propiedades del contrato (validez de cada symbol/edge,
determinismo, casos concretos con sus propiedades exactas).

## 4. Verificación arquitectónica — aislamiento de `ts-morph`

Comando reproducible (no test de CI — decisión explícita de 6.5: esto es
una invariante estructural del repositorio, no una capacidad funcional
de Code Intelligence; se documenta como comando, se revisita como guard
de arquitectura solo si la frontera se rompe repetidamente en el
futuro):

```bash
# ts-morph fuera de infrastructure/ — debe estar vacío
grep -rln 'from "ts-morph"' packages/domain/src packages/application/src packages/agent-core/src

# typescript compiler API cruda fuera de infrastructure/ — debe estar vacío
grep -rln 'from "typescript"' packages/domain/src packages/application/src packages/agent-core/src
```

Salida real de ambos comandos en este cierre: **vacía**. `ts-morph`
aparece únicamente en:

```text
packages/infrastructure/src/code-intelligence/TsMorphCodeAnalyzer.ts
packages/infrastructure/src/code-intelligence/extractSymbols.ts
packages/infrastructure/src/code-intelligence/extractSymbols.test.ts
packages/infrastructure/src/code-intelligence/extractEdges.ts
packages/infrastructure/src/code-intelligence/extractEdges.test.ts
```

`LiteralCodeSearch`/`findLiteralMatches` (6.4) no aparecen en esa lista
— no importan `ts-morph`, tal como exige el diseño (§7 del mapa: búsqueda
literal es texto plano, no AST).

## 5. Arquitectura final

```text
IGitTrackedFilesSource (5.2, reutilizado sin modificar)
IFileReader             (5.3, reutilizado sin modificar)
        │
        ├──────────────────────────┬─────────────────────────┐
        ▼                          ▼                         │
TsMorphCodeAnalyzer (6.3)   LiteralCodeSearch (6.4)           │
implements ICodeAnalyzer    implements ICodeLiteralSearch     │
        │                          │                          │
        ├── extractSymbols()       └── findLiteralMatches()   │
        └── extractEdges()             (función pura)          │
        │                                                      │
        ▼                                                      │
   CodeIndex                                              LiteralMatch[]
   { symbols, edges }                                     (independiente
        │                                                  del índice)
        ▼
application/code-intelligence/queries (6.2, funciones puras)
   findSymbolsByName · getDependencies · getDependents
```

`domain/code` (6.1 + adenda): `CodeSymbol`, `DependencyEdge`,
`LiteralMatch`, `CodeIndex`, invariantes — puro, sin `ts-morph`. Ningún
puerto nuevo más allá de `ICodeAnalyzer`/`ICodeLiteralSearch` (6.2).
Ninguna persistencia — `CodeIndex` es estado derivado (mapa §5).
`packages/project-intelligence` permanece intocado, igual que en Fase 5
(mapa §9a).

## 6. Commits de 6.x

| Subfase | Commit | Contenido |
|---|---|---|
| Mapa congelado | `e4df476` | `docs/fase-6-code-intelligence-map.md` — diseño completo, sin código |
| 6.1 | `bc80fdb` | `domain/code`: `CodeSymbol`, `DependencyEdge`, `CodeIndex`, invariantes |
| 6.1 (adenda) + 6.2 | `ceef9c1` | `LiteralMatch` + `isValidLiteralMatch`; `application/code-intelligence`: `ICodeAnalyzer`, `ICodeLiteralSearch`, `findSymbolsByName`, `getDependencies`, `getDependents` |
| 6.3 | `544dd52` | `infrastructure/code-intelligence`: `TsMorphCodeAnalyzer`, `extractSymbols`, `extractEdges`; refinamiento del mapa §9 sobre `ts.Program`/type-checker |
| 6.4 | `76e8f4c` | `infrastructure/code-intelligence`: `LiteralCodeSearch`, `findLiteralMatches` |
| 6.5 | (este commit) | `tests/integration/fase-6-acceptance.test.ts` + este documento — cero código de producción nuevo |

## 7. Verificación real — gate completo

```text
Build:      ✅ 11/12 workspace packages, sin errores
Typecheck:  ✅ limpio en todos los paquetes
Lint:       ✅ sin salida
Format:     ✅ prettier --check limpio
Unitarios:  ✅ 422 passed / 81 skipped / 0 failed (suite por defecto, sin RUN_INTEGRATION_TESTS —
               los 9 skipped nuevos son fase-6-acceptance.test.ts, gateado igual que el resto
               de tests/integration/)
Aceptación: ✅ 9/9 passed — tests/integration/fase-6-acceptance.test.ts,
               RUN_INTEGRATION_TESTS=true, contra guerrero-dev real
Arquitectura: ✅ ts-morph/typescript confinados a infrastructure/code-intelligence (§4)
```

## 8. Límite explícito — nada evolucionado durante 6.5

6.5 demostró que el pipeline ya construido satisface el contrato
congelado; no se aprovechó el dogfooding como excusa para mejorarlo.
Explícitamente NO se tocó en 6.5:

```text
❌ ordenar resultados de forma distinta a la ya determinista
❌ cambiar la semántica de búsqueda literal
❌ ampliar a más extensiones que .ts
❌ soportar más formas de declaración AST
❌ resolver aliases de tsconfig / paquetes
❌ enriquecer DependencyEdge más allá de lo congelado
❌ modificar el tratamiento de declare module
❌ agregar caché
❌ introducir índices persistentes
❌ el comentario placeholder de packages/project-intelligence (mapa §9a: se corrige junto con el resto de documentación obsoleta, no en 6.1–6.5)
```

## 9. Qué sigue

6.x (estructural/literal) queda cerrado como incremento completo de
Fase 6. Los siguientes incrementos —6.y (recuperación semántica/RAG) y
6.z (grafo de llamadas resuelto)— quedan condicionados a evidencia real
de que 6.x resulta insuficiente para un caso de uso concreto (mapa §3),
no se inician por inercia de fase. Fase 7 (razonamiento LLM, ejecución)
permanece fuera de alcance de este documento.
