# Candidate Detection — Golden Dataset v0

Evidencia de evaluación para Fase 4.8 (Candidate Detection: `git commit`
→ `MemoryCandidate`). **No es un contrato de aplicación** — no hay tipos
TypeScript ni parsers acá, solo datos etiquetados a mano para medir qué
tan bien un futuro detector (regla, LLM, o híbrido) recupera candidatas
razonables de commits reales.

Mismo criterio que el resto del Memory Engine: primero evidencia medida
contra casos reales, después contratos, después implementación. Fase 4.4
lo hizo con embeddings (benchmark de Recall@5/MRR antes de fijar el
modelo); esto es el equivalente para Candidate Detection.

## Por qué existe este dataset

El diseño original de 4.8 planteaba una sola pregunta de clasificación
(`¿es arquitectónico?`) y una decisión temprana entre reglas deterministas,
LLM, o un híbrido — sin haber mirado un solo commit real todavía. Antes de
comprometernos con esa arquitectura, se auditaron a mano commits reales de
`guerrero-dev` (Dataset A) y de `gescomph-api` (Dataset B, dominio de
negocio real) para ver qué señales existen de verdad. Ver `taxonomy.md`
para los hallazgos (preliminares, no cerrados).

## Estructura

```text
docs/benchmarks/candidate-detection/
├── README.md          — este archivo
├── taxonomy.md         — hallazgos preliminares (n=23, dos repos), hipótesis abiertas
├── guerrero-dev/        — Dataset A: 11 commits reales, etiquetados a mano
│   ├── d3b5804.json
│   ├── 523be5e.json
│   ├── 4a631af.json
│   ├── a1dc883.json
│   ├── 1845a52.json
│   ├── a2dd733.json
│   ├── 93e9cd1.json
│   ├── 2e3240e.json
│   ├── 666edb9.json
│   ├── 96f2719.json
│   └── bf7f9fb.json
└── gescomph-api/        — Dataset B: 12 commits reales, etiquetados a mano
    ├── ec5f766.json
    ├── 232a59d.json
    ├── 5d6b4a7.json
    ├── db18646.json
    ├── af3fe10.json
    ├── 92475e3.json
    ├── a7942f0.json
    ├── a384c61.json
    ├── 60c34f2.json
    ├── bb705ac.json
    ├── 6537bec.json
    └── 97942f6.json
```

Cada JSON:

```json
{
  "commit": "a2dd733",
  "date": "2026-08-14",
  "message": "...",
  "signal": "resumen de qué cambió",
  "classification": ["bug_fix", "implementation_pattern"],
  "importance": 0.7,
  "candidate": "texto de la MemoryCandidate razonable, o null si es ruido",
  "reason": "por qué esa clasificación/importancia — no solo la etiqueta",
  "detectability": "deterministic | semantic | contextual",
  "magnitude": { "filesChanged": 1, "linesChanged": 8 },
  "surface": ["cli"],
  "relations": [{ "type": "supersedes", "targetCommit": "1845a52" }]
}
```

## Dataset A — `guerrero-dev` (completo, 11/11)

Todos los commits reales que existen en el repositorio al momento del
audit (`git log --oneline | wc -l` = 11) — no es una muestra, es el
historial completo. Cubre: scaffold inicial, vertical slice, ruido
(chore/docs triviales), un fix técnico corregido 8 minutos después
(`1845a52` → `a2dd733`, el caso `supersedes` más claro), y las tres fases
del propio Memory Engine (4.1 diseño, 4.2 dominio, 4.3 persistencia).

**Sesgo conocido:** la mayoría de los commits "arquitectónicos" de este
dataset documentan la construcción del propio Memory Engine — es
parcialmente circular (usar el historial de construir el sistema para
diseñar el sistema que va a leer historiales). Sirve para medir
comportamiento sobre decisiones técnicas, correcciones, y ruido, pero no
sustituye a un proyecto de dominio de negocio real.

## Dataset B — `gescomph-api` (completo, 12 commits seleccionados de 33)

Backend .NET real de la organización Gescomph (arriendo de
establecimientos: contratos, pagos vía MercadoPago, obligaciones
mensuales, notificaciones en tiempo real, auth). Clonado públicamente vía
`git clone` (repositorio público, sin necesidad de montar la carpeta local
del usuario) desde `https://github.com/Gescomph/gescomph-api`, auditado, y
descartado del sandbox después — no queda ninguna copia del repo en este
entorno, solo los 12 JSON con la evidencia extraída.

`Guerrero-077/Gestion-Clientes` (mencionado inicialmente como fuente
alternativa) no se pudo clonar — GitHub devuelve "repository not found"
para el fetch anónimo, y no aparece en la lista pública de repos de
`Guerrero-077` (17 repos totales, verificados). Puede ser un nombre
distinto, estar eliminado, o ser privado. No se investigó más a fondo
porque `gescomph-api` (33 commits, dominio de negocio real, con diversidad
suficiente) ya cubre lo que Dataset B necesitaba — confirmar o refutar los
hallazgos de Dataset A contra un proyecto que no es el propio Memory
Engine. Si Santiago confirma el nombre/visibilidad correcta, se puede
sumar como Dataset C.

De los 33 commits reales de `gescomph-api`, se seleccionaron 12
(excluyendo merges y variantes casi idénticas del mismo cambio repetidas
en ramas `dev`/`qa`/`staging`) buscando diversidad de tipo de señal, no
representatividad estadística: scaffold inicial, refactor, fix de bug,
fix con implicancia de seguridad, integración de pago (feature grande),
patrón repetido (integración real-time), trabajo mecánico repetitivo
(bajo valor pese a prefijo `feat:`), testing puro, un commit enorme casi
enteramente autogenerado, y un cambio de configuración que revela
infraestructura de despliegue no documentada en ningún otro lado.

## Dataset C — otro proyecto de dominio real (opcional, no bloqueante)

`gescomph-api` ya cumple el objetivo original de Dataset B. Sumar un
tercer proyecto (Miller, `Gestion-Clientes` si aparece con el nombre
correcto, u otro) seguiría siendo útil para robustecer la taxonomía, pero
ya no es un bloqueante para avanzar a la comparación de patrones — ver
`taxonomy.md`. Mismo criterio si se agrega: **nunca commits inventados**,
mismo schema JSON, mismo proceso de audit manual.

Formas de conseguirlo si Santiago quiere sumarlo más adelante: (1) montar
temporalmente el repo si es privado, (2) exportar solo el historial (sha,
mensaje, fecha, archivos, diff) sin `.git`/`node_modules`/secretos, o (3)
clonar directo si es público, como se hizo con `gescomph-api`.

## Dataset D — generalización externa (futuro, fuera de alcance ahora)

Commits de terceros, no de proyectos de Santiago. Sirve para una pregunta
distinta y posterior: si el detector final aprendió patrones de
"significancia arquitectónica" genuinamente útiles, o si solo aprendió
"cómo trabaja Santiago". Relevante si el objetivo de largo plazo es que el
detector (o el agente en general) sea una herramienta generalizable, no
solo afinada a Guerrero Dev. No se toca hasta que Dataset A + B den una
taxonomía estable.

## Qué NO es este dataset

No es `ICandidateDetector`, no es un contrato de `Application`, no fija
pesos ni umbrales. Es evidencia de evaluación — el equivalente al corpus
de 14 textos + 8 queries del benchmark de embeddings (Fase 4.4), que
tampoco era código de producción, solo la vara con la que se midió antes
de decidir.
