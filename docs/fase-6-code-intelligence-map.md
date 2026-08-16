# Fase 6 — Code Intelligence: Mapa (diseño, sin código)

**Estado:** Propuesta formal, pendiente de revisión y aprobación —
mismo patrón que `docs/fase-5-project-intelligence-map.md` antes de
congelarse: primero se revisa y ajusta este documento, después se
autoriza 6.1. Este mapa **no es permiso implícito** para implementar
6.1–6.5 de una sola vez: cada subfase necesita su propio contrato
específico antes de empezar.
**Precede a:** `docs/fase-5-project-intelligence-closure.md`, Fase 5
CLOSED. Fase 5 no se modifica como consecuencia de este documento.
**Basado en** una auditoría real del código actual (no en el comentario
placeholder de `packages/project-intelligence/src/index.ts`) y en una
conversación de diseño extensa, punto por punto, con decisiones
verificadas contra evidencia real del repositorio (conteos `grep`,
contenido real de archivos, precedentes de Fase 3/4/5).

---

## 0. Punto de partida real

```text
packages/project-intelligence/   stub literal de Fase 3, intocado desde el commit único d3b5804
domain/code/                     no existe
application/code-intelligence/   no existe
infrastructure/code-intelligence/ no existe
```

No hay ningún mapa de Fase 6 previo. El único artefacto existente es el
comentario del stub, que menciona AST/símbolos/grafo/RAG sin ningún
contrato — un placeholder de Fase 3, no un diseño.

**Precedente arquitectónico usado en cada decisión de este documento:**
Fase 5 (Project Intelligence) resolvió preguntas estructuralmente
idénticas — qué persiste, dónde vive el código, qué tan angosto debe ser
el contrato — para un dominio distinto (perfil del proyecto en vez de
símbolos de código). Este mapa reutiliza ese criterio explícitamente en
vez de reinventarlo.

## 1. Objetivo de Fase 6

Que Guerrero Dev pueda responder, para un proyecto ya perfilado por
Fase 5, preguntas sobre **qué hace el código, dónde está y cómo se
relaciona**; en particular, determinar **dónde debería modificarse algo
para lograr un cambio concreto**.

Frontera con Fase 5, ya fijada en su mapa (§2) y reconfirmada aquí:

```text
Fase 5 → ¿qué es el proyecto / cómo está organizado?
Fase 6 → ¿qué hace el código / dónde está / cómo se relaciona?
```

Fase 5 puede decir "el backend vive en `apps/api`". Fase 6 debe poder
decir "la función que valida el email está en
`packages/domain/src/user/validateEmail.ts`, y `AuthService` la importa
desde ahí".

## 2. Casos de uso v1

**Aceptados para v1** — tres casos de uso de usuario, distintos de los
mecanismos internos que los resuelven:

```text
A — ¿Dónde debería modificar algo para cambiar X comportamiento?
B — ¿Qué hace este código / dónde está?
C — ¿Cómo se relaciona este código con otro?
```

```text
B se materializa en v1 mediante:
  - localización de símbolos (findSymbolsByName)
  - localización de archivos
  - evidencia estructural del rango de la declaración (line/endLine)

C se materializa en v1 mediante:
  - dependencias de archivo (getDependencies)
  - dependientes de archivo (getDependents)
  - imports/re-exports explícitos (DependencyEdge)
```

Caso de uso ≠ mecanismo interno: `getDependencies()` es una función de
consulta que ayuda a responder C, no es C en sí misma — igual que
`getProjectProfile()` en Fase 5 no era el objetivo de esa fase, sino el
mecanismo de lectura.

**Explícitamente fuera de v1 (necesita un cuarto caso, no evidenciado
todavía):**

```text
D — razonamiento sobre convenciones arquitectónicas
    ("¿esto sigue el patrón hexagonal del repo?")
```

Se rechazaron explícitamente dos casos de uso "candidato técnico"
(búsqueda de símbolos import/export, búsqueda de call-sites) por ser
capacidades internas del sistema, no preguntas de usuario — quedan
disponibles como funciones de consulta (§8), no como casos de uso de
primer nivel. También queda fuera de v1 un `queryProject()` libre, por
la misma razón que en Fase 5 (§7 de ese mapa): no hay segundo consumidor
real que lo demande todavía.

**División de A por niveles de capacidad — decisión central de este
documento:**

> A — "¿Dónde debería modificar algo para cambiar X comportamiento?"
> pertenece a Fase 6 como objetivo funcional, pero su resolución se
> introduce por niveles de capacidad. La primera versión de Fase 6
> resolverá X mediante evidencia estructural/literal; la recuperación
> semántica de intención en lenguaje natural queda como evolución
> posterior dentro de Fase 6.

Formulación más explícita de la frontera, para no sobreprometer:

```text
6.x no interpreta una intención arbitraria expresada en lenguaje natural.

6.x puede aportar evidencia para A cuando X puede localizarse mediante:
  - nombre de símbolo exacto
  - texto literal
  - ubicación/relación estructural conocida

La traducción semántica de una intención libre
("dónde se valida el login")
queda fuera de 6.x.
```

Es decir: **6.x no resuelve A completamente**, la resuelve con lo que la
evidencia estructural y la búsqueda literal permiten demostrar. Una
resolución semántica de intención en lenguaje natural es una capacidad
posterior, todavía dentro de Fase 6 — no se degrada a Fase 7, porque
sigue siendo Code Intelligence, no razonamiento del agente.

## 3. Niveles de capacidad de Fase 6 (marco de referencia)

```text
Nivel 1  filesystem + AST sintáctico            → 6.x (este documento)
Nivel 2  grafo de imports/re-exports            → 6.x (este documento)
Nivel 3  búsqueda literal sobre archivos        → 6.x (este documento)
Nivel 4  recuperación semántica (RAG/embeddings) → 6.y, evolución posterior de Fase 6
Nivel 5  grafo de llamadas resuelto (type-checker) → incremento posterior de Fase 6
```

Ninguno de los niveles 4/5 se descarta — se documentan como
**posteriores**, condicionados a evidencia real de que 6.x resulta
insuficiente, mismo criterio que Fase 5 aplicó a `RiskSignal`/
`ConflictDetector`/watch en tiempo real.

**Grafo de llamadas — framing congelado:**

> El grafo de llamadas no forma parte del primer incremento de Code
> Intelligence. Se reserva para un incremento posterior de Fase 6 que
> defina explícitamente resolución semántica y sus garantías de
> precisión. No se manda a Fase 7: sigue siendo Code Intelligence.

**RAG — framing congelado (deliberadamente no absoluto):**

> La recuperación semántica mediante embeddings no es un requisito de
> 6.x. Se reserva para una capacidad posterior de Fase 6 si los casos de
> uso reales demuestran que la localización estructural/literal no es
> suficiente.

## 4. Alcance de archivos

**Lenguaje: `.ts` únicamente.** No `.tsx` — 0 evidencia de código React
en el repo actual (`apps/web` existe como componente de Fase 5 pero no
se ha auditado su contenido interno para esta fase; se trata como
extensión futura, no como alcance v1).

**Alcance de archivos: todos los `.ts` trackeados por Git**, sin
limitarse a los paquetes que Fase 5 modeló como "componentes". Incluye
explícitamente:

```text
✅ código de dominio/aplicación/infraestructura/agent-core
✅ archivos de test (*.test.ts)
✅ archivos de configuración en TypeScript (vitest.config.ts, drizzle.config.ts, etc.)
✅ los propios stubs de packages/{project-intelligence,memory,execution,mcp}
```

Razón: el índice es una función determinista de "qué `.ts` existe en el
árbol trackeado", no una interpretación editorial de qué archivos son
"importantes". La misma fuente que usa Fase 5 (`git ls-files`, vía
`IGitTrackedFilesSource`, ya real desde 5.2) se reutiliza aquí sin
modificarla — mismo adapter, filtrado a `.ts` en la capa de Code
Intelligence, no un adapter nuevo.

## 5. Modelo — qué es persistente y qué es derivable

**Decisión central, simétrica a la de Fase 5 §3 pero con conclusión
distinta:** en Fase 5, `ProjectProfile` es derivable pero se persiste
(snapshot vigente, staleness con fecha). En Fase 6, `CodeIndex` es
derivable y **no se persiste en v1**:

> 6.x no persiste el índice de Code Intelligence. `CodeSymbol[]` y
> `DependencyEdge[]` son estado derivado y reconstruible a partir de los
> archivos `.ts` del repositorio. Cualquier caché en memoria es una
> optimización transparente y no forma parte del contrato de
> consistencia del sistema.

Consecuencia directa: no hay tabla, no hay migración, no hay
`schemaVersion` para Code Intelligence en v1 — y no hay política de
"cuándo actualizar el índice", porque no hay índice que quede
desactualizado. Cada consulta analiza el estado actual del árbol. Si en
el futuro aparece evidencia real de que el costo de reanalizar en cada
consulta es un problema (proyectos grandes, latencia), se revisita con
ese caso concreto delante — mismo criterio que Fase 5 aplicó al umbral
de re-scan de 24h (§6 de ese mapa: no se inventa sin medición).

## 6. `CodeSymbol` y `DependencyEdge` — contrato final

```typescript
interface CodeSymbol {
  name: string;
  kind: "function" | "class" | "interface" | "type" | "const" | "method";
  filePath: string;
  line: number;         // 1-based, inclusive — inicio de la declaración completa
  endLine: number;      // 1-based, inclusive — fin de la declaración completa
  exported: boolean;
  containerName: string | null;
}

interface DependencyEdge {
  fromFile: string;
  target: string;       // module specifier textual — NO ruta resuelta, NO garantía de resolución local
  kind: "import" | "re-export";
  importedNames: string[];
}

interface CodeIndex {
  symbols: CodeSymbol[];
  edges: DependencyEdge[];
}
```

No se añade `enum`, `namespace` ni un `kind: "variable"` genérico — 0
evidencia en el repo real (0 `enum`; el único `namespace`/`declare
module` encontrado es una ampliación ambient de un tipo de terceros,
`apps/api/src/plugins/database.ts: declare module "fastify"`, que no
declara ningún símbolo local y por eso queda explícitamente excluido de
la indexación).

### 6a. Alcance estructural de la extracción

```text
SourceFile
├── declaraciones top-level        → CodeSymbol
├── class members                  → CodeSymbol (kind: "method", containerName: nombre de la clase)
└── object-literal members de un
    const exportado (patrón Mapper) → CodeSymbol (kind: "method", containerName: nombre del const)

function
└── función interna                → NO se indexa (detalle de implementación, no superficie estructural)
```

El índice es una estructura navegable, no un AST serializado.

### 6b. Qué declaración produce cada `kind`

| Forma sintáctica | `kind` |
|---|---|
| `function foo() {}` (incl. `export default function foo() {}`, con nombre) | `function` |
| `class Foo {}` (`ClassDeclaration`; class expressions fuera de alcance, 0 evidencia) | `class` |
| `interface Foo {}` | `interface` |
| `type Foo = ...` | `type` |
| cada `VariableDeclarator` de una `VariableStatement` con `const` | `const` |
| método de una `class` o miembro-función (shorthand o propiedad con función/arrow) de un objeto literal asignado a `const` | `method` |

**Regla conceptual de `method`:**

> `method` representa una función declarada dentro de un contenedor
> nombrado que 6.x pueda identificar estructuralmente, independientemente
> de si el contenedor es una `class` o un objeto literal exportado.

Evidencia real usada para fijar esta regla: los 5 mappers del repo
(`ProjectProfileMapper`, `MemoryMapper`, `MemoryRelationMapper`,
`MemorySourceMapper`, `MemoryEmbeddingMapper`) usan exclusivamente
sintaxis shorthand-method dentro de `export const X = { foo(...) {...} }`
— no hay arrow-function-como-propiedad en el repo real, pero el
contrato soporta ambas formas por ser estructuralmente simétricas.

**Exclusiones explícitas, documentadas como limitación aceptada de v1,
no como error oculto:**

```text
❌ declare module "..."               → ampliación ambient, no declaración local
❌ export default <expresión anónima> → sin nombre estable que indexar
❌ funciones/consts anidadas          → detalle de implementación, fuera del alcance estructural (§6a)
```

Los exportados sin uso semántico aparente (por ejemplo, constantes
`UPPER_CASE` cuyo propósito no es evidente desde el AST) se indexan
igual que cualquier otro: el índice es estructural, no editorial — es la
capa consumidora la que decide qué símbolos son relevantes para una
consulta dada, no el extractor.

### 6c. `exported`

> `exported` es `true` cuando la declaración tiene una exportación
> nominal local, ya sea mediante un modificador `export` sobre la
> declaración o mediante un `export { nombre }` local sin `from`.

Consecuencia: **`method.exported` es siempre `false`**, sin excepción —
un método nunca es capturable con `import { nombre }`, sea la clase o el
objeto contenedor exportado o no. Y `export { foo } from "./x"` no hace
`exported: true` a ningún símbolo local del archivo actual — es una
relación sobre `x` (§6d), no una exportación nominal local.

### 6d. `containerName`

- `function`, `class`, `interface`, `type`, `const` de nivel superior:
  `containerName: null`.
- `method`: el nombre de la `class` que lo declara, o el nombre del
  `const` al que está asignado el objeto literal que lo contiene.

Esto permite distinguir `DrizzleProjectIntelligenceRepository.upsert` de
`MemorySourceMapper.toDomain` aunque ambos compartan `name` con otros
métodos del repo (`upsert`, `findById`, etc. se repiten entre
repositorios reales — evidencia: 65 archivos con `private readonly`,
patrón de clase inyectada).

### 6e. `import` / `export ... from` → `DependencyEdge`

| Sintaxis | `kind` | `importedNames` |
|---|---|---|
| `import { a, b } from "./x"` | `import` | `["a","b"]` |
| `import type { a } from "./x"` | `import` | `["a"]` — sin distinguir type-only, 6.x no resuelve semánticamente |
| `import a from "./x"` (default) | `import` | `["default"]` |
| `import * as ns from "./x"` | `import` | `["*"]` |
| `import "./x"` (solo efecto secundario) | `import` | `[]` |
| `export { a, b } from "./x"` | `re-export` | `["a","b"]` |
| `export { a as b } from "./x"` | `re-export` | `["a"]` — nombre en el módulo origen, no el alias local |
| `export * from "./x"` | `re-export` | `["*"]` |
| `export * as ns from "./x"` | `re-export` | `["*"]` |

`target` es el module specifier textual tal como aparece en el código.
Regla congelada:

> 6.x registra los nombres explícitamente importados cuando están
> disponibles sintácticamente, pero no afirma resolución semántica de
> esos nombres hacia una declaración concreta.

Cada `VariableDeclarator` de un `const a = 1, b = 2;` produce su propio
`CodeSymbol`, todos heredando el `exported` de la `VariableStatement` —
0 evidencia de este patrón en el repo, pero se soporta sin ambigüedad.

## 7. Búsqueda literal

La búsqueda literal constituye una capacidad independiente que permite
localizar referencias textuales que no corresponden a un `CodeSymbol`
(un string, un identificador usado mid-expresión, un comentario). Puede
ser utilizada por el caso de uso A y por consultas de localización
relacionadas con B, pero no forma parte del modelo semántico de
`CodeSymbol` ni es la única vía de resolver B — `findSymbolsByName`
(§8) ya cubre la localización de símbolos declarados. Regla congelada:

> 6.x debe poder localizar coincidencias literales dentro de los
> archivos `.ts` trackeados, sin requerir que la coincidencia
> corresponda a un `CodeSymbol` y sin persistir un índice textual.

## 8. Consulta — superficie de aplicación

```typescript
// application/code-intelligence/ports
interface ICodeAnalyzer {
  analyze(repoRoot: string): Promise<CodeIndex>;
}

interface ICodeLiteralSearch {
  search(repoRoot: string, query: string): Promise<LiteralMatch[]>;
}

// application/code-intelligence — funciones puras
function findSymbolsByName(index: CodeIndex, name: string): CodeSymbol[];
function getDependencies(index: CodeIndex, filePath: string): DependencyEdge[];
function getDependents(index: CodeIndex, filePath: string): DependencyEdge[];
```

Ambos puertos reciben `repoRoot`, no `files[]` — quien implementa
(`infrastructure/code-intelligence`) es responsable de descubrir los
`.ts` trackeados vía `IGitTrackedFilesSource` (§4) internamente. El
llamador de `application`/`agent-core` no debe conocer ni transportar la
enumeración de archivos como detalle de infraestructura — mismo
principio que mantiene `IGitTrackedFilesSource` como el único punto de
descubrimiento de archivos, sin un segundo adapter paralelo:

```text
Application
    │  analyze(repoRoot) / search(repoRoot, query)
    ▼
ICodeAnalyzer / ICodeLiteralSearch
    │
    ▼
Infrastructure
 ┌──────────────────────┐
 │ IGitTrackedFilesSource│
 │         ↓             │
 │     .ts files          │
 │         ↓             │
 │   ts-morph / literal   │
 │         ↓             │
 │  CodeIndex / matches   │
 └──────────────────────┘
```

`findSymbolsByName` es **exact-match únicamente** — sin fuzzy, sin
substring, sin case-insensitive; mismo criterio de superficie angosta
que Fase 5 aplicó a `getProjectProfile` (§7 de ese mapa: no exponer más
de lo que un consumidor real demuestra necesitar).

Explícitamente **no** se añade `getSymbolImporters(index, symbolName)`
como función nombrada — el índice no tiene identidad semántica resuelta
de los imports (§6e), así que un consumidor que necesite esto debe
filtrar `edge.importedNames.includes(name)` él mismo; nombrar la función
sugeriría una garantía de resolución que 6.x no ofrece.

No se congela todavía ningún puerto tipo `ICodeParser` o
`IDependencyGraphBuilder` — `ICodeAnalyzer` es el único puerto de
extracción; ver §9 sobre por qué no hace falta una capa de abstracción
adicional sobre el parser.

## 9. Arquitectura y parser

```text
domain/code/                     CodeSymbol, DependencyEdge, CodeIndex + invariantes (puro)
application/code-intelligence/   ICodeAnalyzer, ICodeLiteralSearch, funciones de consulta puras
infrastructure/code-intelligence/ TsMorphCodeAnalyzer implements ICodeAnalyzer
```

Misma convención hexagonal que el resto del repo — mismo patrón que
Fase 5 usó (`domain/project` + `application/project-intelligence` +
`infrastructure/project-intelligence`), no una excepción nueva.

**Parser v1, decisión congelada:**

> Fase 6 utiliza `ts-morph` sobre la TypeScript Compiler API para
> analizar archivos `.ts`. `ts-morph` queda encapsulado en
> `infrastructure/code-intelligence` y no forma parte de los contratos
> de dominio ni aplicación. El análisis utiliza únicamente capacidades
> sintácticas; no se construye `ts.Program`/type-checker como parte de
> 6.x. Cuando la API de alto nivel de `ts-morph` no represente
> adecuadamente una construcción necesaria —por ejemplo, métodos de
> object literals— la implementación podrá inspeccionar el AST
> subyacente directamente.

No se introduce `ICodeParser` como abstracción intermedia — la clase
concreta es directamente `TsMorphCodeAnalyzer implements ICodeAnalyzer`.
Si en el futuro apareciera un segundo parser real (otro lenguaje, otra
librería), se revisita con ese caso delante, mismo criterio aplicado
repetidamente en Fase 4/5 contra abstracción prematura.

### 9a. `packages/project-intelligence` — decisión explícita

> `packages/project-intelligence` permanece intocado en Fase 6, igual
> que en Fase 5.

No hay evidencia que justifique convertir Code Intelligence en un
paquete standalone. El precedente real de `packages/execution` depende
de una necesidad concreta de múltiples implementaciones intercambiables
en tiempo de ejecución (motores Cline/OpenCode, Fase 7); esa necesidad
no existe para Code Intelligence. El comentario placeholder del stub
(que menciona AST/símbolos/grafo/RAG) no se corrige todavía — se
actualiza junto con el resto de documentación obsoleta una vez el mapa
quede congelado, no como parte de 6.1–6.5.

## 10. Subfases propuestas (implementación, todavía no autorizada)

```text
6.1  domain/code — CodeSymbol, DependencyEdge, CodeIndex, invariantes (puro, sin ts-morph)
6.2  application/code-intelligence — ICodeAnalyzer, ICodeLiteralSearch, funciones de consulta puras
6.3  infrastructure/code-intelligence — TsMorphCodeAnalyzer (contrato de extracción §6)
6.4  infrastructure/code-intelligence — búsqueda literal (§7)
6.5  Aceptación + dogfooding contra guerrero-dev real + documento de cierre
```

Mismo gate entre subfases que Fase 5: auditoría → decisión → propuesta →
aprobación → implementación → verificación real → commit → checkpoint.
No se adelanta trabajo de 6.3 mientras 6.1/6.2 están en curso.

## 11. Dogfooding — obligatorio, no opcional

`guerrero-dev` es el caso de prueba de 6.5, no un fixture sintético.
Ejemplos concretos ya verificados en la conversación de diseño que 6.5
debe reproducir:

```text
ProjectProfileMapper.ts     → const exportado + 2 métodos (containerName: "ProjectProfileMapper")
ContextBuilder               → símbolo real localizable por findSymbolsByName
application/src/index.ts     → 0 imports, solo re-exports (DependencyEdge con importedNames: ["*"])
apps/api/.../database.ts     → declare module "fastify" correctamente EXCLUIDO del índice
```

## 12. Criterios de cierre de Fase 6 (v1, 6.x)

```text
Extracción
  ☐ Los 6 kinds cubiertos, verificados contra archivos reales del repo
  ☐ exported correcto en el 100% de los símbolos extraídos de un scan real
  ☐ containerName correcto, incluido el caso Mapper
  ☐ Cada variante sintáctica presente en el repo real (§6e) se verifica
    mediante dogfooding; las variantes no presentes en `guerrero-dev` se
    cubren mediante fixtures sintéticos mínimos o quedan documentadas
    explícitamente como no verificables por dogfooding — el repositorio
    real valida comportamiento real, los fixtures solo cubren sintaxis
    que el repositorio no ejercita

Consulta
  ☐ findSymbolsByName localiza símbolos reales conocidos (ContextBuilder,
    ProjectProfileMapper) sin falsos negativos
  ☐ Búsqueda literal localiza coincidencias reales sin requerir CodeSymbol

Determinismo
  ☐ Mismo estado del repo → mismo CodeIndex, dos análisis consecutivos,
    sin duplicados ni omisiones (verifica la garantía de no-staleness)

Arquitectura
  ☐ ts-morph/typescript no aparecen en ningún import de domain/ ni
    application/ (grep-verificable, mismo método usado en Fase 5 para infra)
  ☐ packages/project-intelligence permanece sin modificar

☐ Build + typecheck + lint + tests unitarios + tests de integración reales
☐ Documento de cierre análogo a docs/fase-5-project-intelligence-closure.md
```

Explícitamente fuera del criterio de cierre de v1: type-checker/grafo de
llamadas resuelto, RAG/embeddings, razonamiento LLM sobre arquitectura
(caso D, §2), persistencia del índice, `.tsx`, otros lenguajes.

---

Este mapa no autoriza ningún commit de código. El siguiente paso, si se
aprueba este documento (con o sin ajustes), es 6.1 — mismo patrón que
cada subfase de Fase 5: diseño de esa subfase específica, antes de
escribir su código.
