# Candidate Detection — Taxonomía (v0, preliminar)

**Estado:** hipótesis en construcción, no una taxonomía cerrada. Basada en
Dataset A (11 commits reales de `guerrero-dev`) + Dataset B (12 commits
reales de `gescomph-api`, dominio de negocio real — arriendo de
establecimientos, pagos, contratos, notificaciones). 23 commits en total.
Sigue sin ser una muestra grande, pero ya cruza dos repositorios de
naturaleza distinta — ver `README.md` para cómo se consiguió cada dataset.

## Por qué cuatro dimensiones, no una

El diseño original de Fase 4.8 partía de una sola pregunta: **¿es
arquitectónico?**. El audit de los 11 commits de `guerrero-dev` mostró que
esa pregunta es insuficiente — el caso `1845a52` → `a2dd733` es la
evidencia: una corrección de 8 líneas (`a2dd733`) es más importante para la
memoria del agente que reforzar una decisión ya tomada (`4a631af`, 15
archivos), y el motivo real de la corrección (evitar el warning DEP0190 de
Node) no está en el mensaje del commit — solo en el comentario del diff.
Por eso la taxonomía se separó en cuatro dimensiones independientes.

## 1. Tipo de señal (`classification`)

Lista abierta, extraída de los datos — no se asumió de antemano:

```text
noise
architectural_decision
implementation_pattern
bug_fix
dependency_change
configuration_change
domain_decision
database_change
documentation
```

De la lista original propuesta, `refactor` y `testing` no aparecían en
Dataset A pero sí en Dataset B (`db18646` refactor, `bb705ac` testing) —
confirma que la lista abierta era la decisión correcta, cada dataset
aportó tipos que el otro no tenía. `api_contract` sigue sin un ejemplo
claro en 23 commits. Un commit puede tener más de una clasificación
(`2e3240e` es `architectural_decision` + `documentation`).

**Tipo de señal no anticipado, encontrado en Dataset B:**
`security_change` (`92475e3` — un bypass de CSRF basado en el header
`Referer`, spoofeable, introducido sin que el mensaje del commit lo
mencione). No estaba en la lista original de tipos propuestos. A
diferencia de otros tipos, esta clasificación probablemente debería
disparar una revisión humana obligatoria, no solo una `MemoryCandidate`
más — es una categoría con una acción distinta asociada, no solo una
etiqueta descriptiva.

## 2. Relación temporal (`relations[].type`)

Esta es, según la evidencia disponible, la dimensión más subestimada en el
diseño original. Valores observados o previstos:

```text
none          — no hay relación con memoria/commit anterior
reinforces    — confirma/ejecuta una decisión ya tomada (4a631af -> d3b5804)
supersedes    — reemplaza una decisión anterior (a2dd733 -> 1845a52,
                96f2719 -> d3b5804)
```

`updates`, `invalidates`, `contradicts` están en el diseño pero **no
aparecieron** en los 11 commits — quedan como hipótesis, no como valores
confirmados por evidencia.

**Nota importante:** `supersedes` no depende de que el commit sea
`architectural_decision`. En `guerrero-dev` apareció dos veces con
magnitudes muy distintas — un fix de 8 líneas (`a2dd733`) y un commit de
dominio de 15 archivos (`96f2719`) — lo que confirma que es una dimensión
independiente, no un caso especial dentro de otra categoría.

**Decisión explícita: no se agrega `"supersedes"` a `MemoryRelationType`
todavía.** El dominio ya tiene `"contradicts"`, que es semánticamente
distinto (A y B se contradicen mutuamente en el momento en que ambas
existen) de `"supersedes"` (B reemplaza la vigencia de A, A queda
histórica pero no necesariamente "en conflicto"). Con solo 2 ejemplos no
hay evidencia suficiente para diseñar bien esa distinción en el dominio —
se revisita cuando el Dataset B confirme si el patrón se sostiene.

## 3. Importancia (`importance`, 0..1)

Separada explícitamente del tipo de señal: un mismo `classification` puede
tener importancia muy distinta según el caso (`bug_fix` fue 0.3 en
`1845a52` y 0.7 en `a2dd733`, que es *el mismo archivo, el mismo problema,
8 minutos después*). Asignar una importancia fija por tipo de señal habría
sido incorrecto ya con esta muestra tan chica.

## 4. Detectabilidad (`detectability`)

```text
deterministic — regla simple y suficiente (path, prefijo de mensaje, tipo
                 de archivo). Ejemplos confirmados: a1dc883 (chore +
                 .gitignore), 93e9cd1 (solo README, diff trivial).
semantic       — el path/prefijo ayuda a decidir si vale la pena mirar,
                 pero el contenido real (qué se decidió, por qué) requiere
                 leer el diff/mensaje con interpretación. Ejemplos:
                 523be5e, 2e3240e, 666edb9, 1845a52, a2dd733.
contextual     — ni el path ni el mensaje alcanzan; hace falta comparar
                 contra el estado anterior del repo (qué reemplaza, qué
                 patrón establece). Ejemplos: d3b5804, 4a631af, 96f2719,
                 bf7f9fb.
```

En Dataset A, 10 de 11 commits necesitan `semantic` o `contextual` — solo
dos son `deterministic` puro, y ambos ruido. Dataset B matiza esto:
aparecieron dos casos `deterministic` que **no** son ruido —
`ec5f766` (trivial, sí es ruido) pero también `bb705ac` (testing, 64
archivos, 2288 líneas) y `6537bec` (diagrama EF autogenerado, 38
archivos, 4117 líneas) son perfectamente descartables por regla de
**patrón de archivo** (`*/Test/`, `*.designer.cs`/`*.edmx`/`*.tt`), no por
`chore:`/tamaño. Combinando ambos datasets: 5 de 23 son `deterministic`
(4 de esos 5 son descartables — noise o testing/generado de baja
importancia), 8 son `semantic`, 10 son `contextual`. La regla determinista
sigue sirviendo sobre todo para **descartar**, pero el criterio real no es
"mensaje corto" ni "prefijo `chore:`" — es **patrón de path/extensión**
(`docs/`, `*.tsbuildinfo`, `*/Test/*`, `*.designer.cs`), que es un criterio
más específico y más confiable que el que se había asumido inicialmente.

**Contraejemplo importante de Dataset B — magnitud como señal engañosa en
ambas direcciones:** `6537bec` (4117 líneas, 38 archivos, mayormente
autogenerado) tiene menos valor real que `97942f6` (6 líneas, 1 archivo,
revela dónde está desplegado el sistema) o que `a2dd733` en Dataset A (8
líneas). Esto no es solo "un commit chico puede ser importante" (ya lo
sabíamos por `a2dd733`) — es la confirmación simétrica de que **un commit
grande puede no serlo**, y que la razón en ambos casos es la misma:
magnitud mide cuánto cambió el texto, no cuánto cambió el conocimiento
sobre el sistema.

## Otros dos hallazgos de Dataset B

**El prefijo del mensaje no predice la clasificación, en ninguna
dirección.** `232a59d` en gescomph-api usa `chore(HU-00)` para el scaffold
completo de la arquitectura (560 archivos, importancia 0.85) — el mismo
prefijo que en Dataset A (`a1dc883`) marcaba ruido puro. Y `af3fe10`/
`60c34f2` usan `feat(...)` para trabajo mecánico repetitivo sin decisión
nueva (importancia 0.1-0.15). Ni `chore:` implica ruido ni `feat:` implica
señal — confirma que cualquier regla basada en el prefijo Conventional
Commits, por sí sola, va a tener falsos positivos y negativos en ambas
direcciones.

**Patrón `reinforces` repetido con estructura idéntica:** `a7942f0`
(integración de MercadoPago) y `a384c61` (integración de SignalR) siguen
exactamente el mismo patrón — interfaz propia (`IMercadoPagoService`/
`IObligationNotifier`) + implementación + extensión de DI — para dos
integraciones externas distintas, siete días de diferencia. Esto sugiere
que "¿esta nueva capacidad de infraestructura entra detrás de una interfaz
propia?" podría ser una regla de detección de `implementation_pattern`
razonablemente barata: comparar la forma del diff (archivos `Ixxx.cs` +
`xxx.cs` + registro en DI) contra casos ya conocidos, sin necesitar LLM
para el primer filtro.

## Un hallazgo no anticipado: un commit puede producir N candidatas

`666edb9` (420 líneas de diseño en un solo commit) no produce una única
candidata razonable — produce, en principio, una por cada decisión de
diseño que documenta (tipos de memoria, scope, lifecycle, schema
propuesto...). El registro en `guerrero-dev/666edb9.json` usa un resumen
como aproximación, pero un `CandidateDetector` real probablemente necesita
poder devolver `MemoryCandidate[]` por commit, no `MemoryCandidate | null`.
Esto no estaba contemplado en el diseño de contratos original y hay que
resolverlo antes de fijar `ICandidateDetector` (o los detectores
especializados que lo reemplacen).

## Corrección de magnitud (post-hoc, Fase 4.8.5)

Al construir los fixtures reales para `DeterministicCommitNoiseFilter.goldenDataset.test.ts`
se detectó que 7 de los 11 registros de Dataset A tenían `magnitude`
truncada — el audit original usó `git show --stat | head -N` en algunos
casos y el resumen final (`N files changed, +X -Y`) quedó cortado antes de
capturarse. Corregidos con `git show --shortstat` exacto:
`d3b5804` (15→123 archivos), `4a631af` (15→35), `a1dc883` (11→12),
`96f2719` (15→16), `bf7f9fb` (10→21), `a2dd733` (8 líneas → +8/-5), y el
más significativo, `1845a52` (1 archivo/3 líneas → **13 archivos,
+3082/-1**) — este último arrastraba 11 `*.tsbuildinfo` commiteados por
accidente y una regeneración completa de `pnpm-lock.yaml`; el fix real
(`doctor.ts`) sigue siendo ~3 líneas dentro de esas 3082. Si algo, esto
refuerza el hallazgo de magnitud-no-correlaciona-con-importancia en vez de
debilitarlo. Los `classification`/`importance`/`detectability` originales
no cambiaron — solo los campos numéricos de `magnitude`.

## Conclusión preliminar (n=23, dos repositorios)

> Preliminary finding, n=23 across two repositories (guerrero-dev,
> gescomph-api): architectural significance cannot be treated as the sole
> classification dimension. The audit exposes independent
> temporal/relational signals such as `supersedes`/`reinforces`, and
> confirms — now in both datasets — that commit message and diff
> magnitude alone are insufficient and can each be misleading in either
> direction (`a2dd733`: tiny diff, high signal; `6537bec`: huge diff,
> near-zero signal; `232a59d`: `chore:` prefix, high signal). It surfaces
> an unanticipated classification, `security_change` (`92475e3`), that
> likely requires a different downstream action (mandatory human review)
> rather than just another candidate label. It also surfaces an
> unanticipated structural question — whether a single commit can yield
> multiple candidates (`666edb9`) — that the original contract design did
> not account for. A recurring structural pattern (`implementation_pattern`
> via interface + implementation + DI registration, seen twice in
> gescomph-api) suggests a cheap first-pass rule-based filter may be more
> viable than initially assumed for at least one signal type. These
> findings remain hypotheses — 23 commits across two repositories built by
> the same person is still a small, non-random sample, and Dataset A in
> particular is partially circular (see bias note in `README.md`).

No se derivan de esto reglas de clasificación definitivas, pesos, ni
umbrales — 23 commits de dos repositorios (ambos con la misma persona
detrás) siguen siendo una muestra chica y no aleatoria. Sirve para generar
hipótesis y descartar el diseño original (una sola dimensión
"arquitectónico sí/no"), no para cerrar la taxonomía ni fijar contratos
de `ICandidateDetector`.
