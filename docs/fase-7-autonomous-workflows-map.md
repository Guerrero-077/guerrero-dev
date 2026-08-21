# Fase 7 (numeración unificada) — Autonomous Workflows: Mapa (diseño, sin código)

**Estado:** Propuesta inicial, no congelada — primera ronda, pendiente de
revisión de Santiago.
**No es la misma "Fase 7" que `docs/fase-7-cline-opencode-integration-closure.md`.**
Ese documento es la Fase 7 *real* del repo (Cline/OpenCode Integration,
sustancialmente CLOSED, corresponde a la Fase 5 de la numeración
unificada). Este documento es la Fase 7 de `docs/roadmap-maestro.md`
(numeración unificada) — Autonomous Workflows, ⛔ no iniciada. Ver tabla
de correspondencia en `roadmap-maestro.md` §5 si hay dudas sobre cuál
"Fase 7" aplica en cada contexto.
**Precede a:** ningún cierre existente de esta fase (no hay código
todavía).
**Origen:** el usuario reformuló el objetivo del proyecto en una
conversación: no quiere "un agente que ejecuta código" sino "un
asistente que va aprendiendo de mis proyectos, mejorando con mi
auditoría, y que luego de un tiempo pueda realizar parte de mi
trabajo". Pidió investigar el proyecto open-source OpenClaw y hacer
vigilancia de mercado (Cursor, Aider, Continue, Cline, SWE-agent,
OpenHands, Copilot Memory, Letta/MemGPT) para adaptar patrones. Esa
investigación (hecha en otra sesión, resumida y pegada acá) propuso una
mega-fase "7.1-7.9" que absorbe de facto lo que `roadmap-maestro.md` ya
había separado deliberadamente en Fase 7/8/9. Este documento es el
`propuesta formal antes de implementar` que el usuario pidió, en vez de
saltar directo a código.

---

## 0. Punto de partida real

### 0.1 Lo que ya existe y es reutilizable

```text
packages/domain/src/agent/AgentSession.ts    Ya existe: {id, projectId, status
                                              (idle/running/waiting_for_approval/
                                              completed/failed), engine, modelName,
                                              createdAt, updatedAt}. NUNCA persistida
                                              ni instanciada en un composition root
                                              real — apps/cli/src/commands/agent.ts
                                              genera sessionId como UUID descartable
                                              por corrida (ver su JSDoc, Fase 5.6).
packages/agent-core/PolicyEvaluator.ts       Real, fail-closed, AND + early-exit.
                                              Independiente del motor de ejecución
                                              (ADR 0002) — cualquier "autonomía
                                              gradual" futura se apoya en esto, no
                                              lo reemplaza.
packages/mcp/                                Patrón MCP-first ya validado dos veces
                                              (CodeIntelligenceMcpServer 5.4c/6.3,
                                              GitMcpServer — este mismo trabajo):
                                              exponer una capacidad nueva como
                                              servidor MCP, no como wiring ad-hoc.
infrastructure/git/GitWorkingTreeSource.ts   Recién agregado: status/diff/log real
                                              del working tree — primera pieza de
                                              observación real disponible como tool
                                              del agente (no como observer pasivo
                                              todavía, ver §4).
```

### 0.2 Lo que NO existe — gaps reales, no supuestos

```text
Ningún AgentSession persistido               cada `guerrero agent run` es efímera,
                                              sin rastro en Postgres después de correr.
Ningún observador de actividad               el agente solo ve lo que se le pide en
                                              cada instrucción; no hay hook de git,
                                              editor, ni historial de comandos.
NoopMemoryConflictDetector                   (Fase 4, CLAUDE.md): siempre [] — Memory
                                              Engine promueve sin detectar conflictos
                                              entre memorias nuevas y existentes.
MemoryEmbedding nunca se escribe en promoción (Fase 4, CLAUDE.md): una Memory recién
                                              promovida es invisible para
                                              DrizzleMemoryCandidateRetriever hasta
                                              un reindexado aparte — gap de contrato
                                              conocido, documentado como "la Fase 5
                                              es el disparador para revisitarlo" (ya
                                              estamos ahí en la numeración unificada
                                              real, no en la vieja).
Cero uso real acumulado                      `guerrero agent run` tiene un hallazgo
                                              abierto sin causa raíz confirmada (6p,
                                              roadmap-maestro.md: alucinación de
                                              rutas absolutas con
                                              qwen2.5:7b-instruct-q4_K_M) y no hay
                                              todavía una sola corrida real
                                              documentada como parte de un flujo de
                                              trabajo diario — el "aprendizaje de mis
                                              proyectos" que pide el usuario no tiene
                                              todavía datos reales de qué aprender.
```

## 1. El problema real que este documento resuelve

No es "¿está mal la visión del usuario?" — no lo está. Es: **la
propuesta externa ("Fase 7.1-7.9": Observer + Memory tiers +
ConflictDetector + USER.md + Skill Workshop + autonomía gradual, todo
junto, desde el día 1) contradice una decisión ya tomada y documentada
en `roadmap-maestro.md` §2**, sin decirlo:

> "la visión original ponía 'Personal Engineering Profile' en la
> posición 5 [...] Aquí se reordenan al final (8 y 9) porque aprender el
> estilo del desarrollador requiere primero tener interacciones reales
> del agente que observar — y esas interacciones no existen hasta que
> Fase 5-7 funcionen [...] Mismo criterio de 'no construir sin
> evidencia'."

Ese razonamiento sigue siendo válido hoy: no hay interacciones reales
que observar todavía (§0.2). La pregunta que este documento responde no
es "¿implementamos Fase 7.1 ya?" sino **"¿cuál es el incremento más
chico y reversible que genera la evidencia real que Fase 8/9 dicen
necesitar, sin romper la arquitectura ni los contratos ya cerrados?"**

## 2. Fuente externa (OpenClaw) — nivel de confianza real

**No verificado contra código fuente real en esta sesión.** La
investigación que motivó este documento fue hecha en otra sesión/
herramienta ("Big Pickle"), de la que solo tengo el resumen pegado por
el usuario — no las tool calls ni la evidencia detrás. Términos como
"Dreaming sweep", "Supersession keys", "Trigger injection", "scoring de
6 señales", "provenance gating" son vocabulario muy específico y
"branded" — coherente tanto con mecanismos reales de un proyecto real
como con paráfrasis de artículos de blog/marketing sobre él (mismo
patrón que ya se encontró en el primer documento de auditoría de esta
conversación, que citaba Forbes/DEV Community en vez de código fuente).

Además, la primera investigación de esta conversación ya estableció que
OpenClaw **tuvo al menos un incidente de cadena de suministro
documentado** y que su patrón de "permitir todo por defecto" es
justamente lo que le generó problemas de seguridad. Adoptar patrones de
un proyecto con ese historial exige leer su código real con ojo crítico
sobre el modelo de amenazas, no solo copiar nombres de mecanismos.

**Tratamiento en este documento:** cada patrón propuesto se evalúa en
§3 por su *mérito arquitectónico* para Guerrero Dev, no por venir de
OpenClaw. Ninguno se acepta "porque funciona ahí". Si en el futuro el
usuario provee una ruta local o URL real del repo de OpenClaw, vale la
pena una segunda pasada que confirme o descarte los mecanismos
específicos antes de diseñarles un equivalente.

## 3. Evaluación de los patrones propuestos, uno por uno

```text
Patrón propuesto          Veredicto para Guerrero Dev
─────────────────         ───────────────────────────
USER.md / preferencias    COHERENTE, bajo riesgo. Un archivo Markdown
como directivas           editable a mano, inyectado al system prompt
                           (mismo canal que ContextBuilder ya usa desde
                           5.14), es la forma más barata de capturar
                           "el usuario prefiere tabs sobre spaces" sin
                           tocar pgvector. No reemplaza Memory Engine —
                           es un input más a ContextBuilder.

Observer de actividad     COHERENTE, es el gap real más importante
(git/editor/comandos)     (§0.2). Sin esto no hay nada que "Personal
                           Engineering Profile" (Fase 8) pueda aprender.
                           Alcance mínimo real: hook de git (post-commit,
                           post-checkout) que registre actividad — no
                           telemetría de editor/IDE, que Guerrero Dev no
                           controla hoy (no hay extensión de editor, ver
                           apps/ — solo cli/api/web-fuera-de-alcance).

Memory tiers (episódica    PARCIALMENTE COHERENTE, requiere decisión
vs. curada)                explícita, no adopción silenciosa. La "capa
                           curada" ya es lo que memories/ hace (Fase 4).
                           La "capa episódica" (daily.md o similar) es
                           nueva — pero superponerla al pipeline real
                           (GitCommitCollector → ... → MemoryCandidate)
                           en vez de reemplazarlo evita el downgrade que
                           ya se señaló en la conversación (perder
                           pgvector/queries estructuradas). Ver §4.2.

Supersession keys /        TOCA UN CONTRATO YA CERRADO (Fase 4,
ConflictDetector real      CLAUDE.md: "no cambies contratos de Fase 4
                           en silencio [...] tratalo como decisión
                           explícita y documentada de frontera entre
                           fases"). NoopMemoryConflictDetector es un gap
                           deliberado, no un bug — reabrirlo es
                           legítimo (el propio cierre de Fase 4 lo
                           anticipa) pero necesita su propia auditoría
                           de diseño, no ser un ítem más de una lista de
                           9. Fuera de alcance de este documento.

Trigger injection          ESPECULATIVO, sin evidencia de necesidad
(pre-filtro léxico)        todavía. Resuelve un problema de escala
                           (miles de memorias) que Guerrero Dev no tiene
                           hoy — Memory Engine gestiona un volumen bajo,
                           sin señal de que la búsqueda semántica actual
                           (pgvector) sea insuficiente. Mismo criterio
                           "no construir sin evidencia" que diferió
                           RiskSignal en Fase 4.

Project-scoped memory      YA RESUELTO, parcialmente. `memories`/
                           `memory_sources` ya se relacionan con
                           proyectos reales vía el esquema de Drizzle
                           (verificar alcance exacto es trabajo de
                           código, no de este documento) — no es un gap
                           evidente, a diferencia de lo que asumía la
                           propuesta externa.

Skill Workshop             FUERA DE ALCANCE, sin justificación todavía.
(procedimientos            Autoedición de "skills" con rollback es una
aprendidos, auto-edit)     superficie de riesgo grande (el propio agente
                           modificando su comportamiento futuro) para un
                           proyecto que todavía no cerró la fiabilidad
                           básica de tool-calling (6p, sin resolver).
                           Construir esto antes de tener autonomía
                           gradual (siguiente fila) es invertir el
                           orden de dependencias.

Autonomía gradual          COHERENTE COMO DIRECCIÓN, prematuro como
(niveles 0-4)               código. Ya existe la pieza que la hace
                           posible sin diseño nuevo: IPolicyEngine ya es
                           el punto de control real de "qué se aprueba
                           automáticamente vs. qué pide permiso" — un
                           "nivel de autonomía" es, en esta arquitectura,
                           una configuración de qué PolicyRules están
                           activas, no un subsistema nuevo. Diseñar esto
                           en abstracto sin casos reales de qué acciones
                           merecen qué nivel es exactamente lo que Fase
                           4/6/8 ya evitaron hacer ("no construir sin
                           evidencia").

Doom loop detection         YA EXISTE UN EQUIVALENTE REAL. MAX_AGENT_STEPS
                           (`apps/cli/src/commands/agent.ts`, Fase 5.12)
                           ya acota iteraciones sin convergencia — no es
                           idéntico a "misma tool call 3× con input
                           idéntico" pero cubre el mismo riesgo real con
                           evidencia (roadmap 6m). No hay señal de que
                           el mecanismo actual sea insuficiente.
```

## 4. Secuencia revisada — el incremento real, evidence-gated

**No se autoriza implementar las 9 subfases de la propuesta externa.**
Se propone en cambio un único incremento inicial, deliberadamente
chico, que:

1. No toca ningún contrato de Fase 4 (Memory Engine) cerrado.
2. Genera la evidencia real que Fase 8 (Personal Engineering Profile)
   necesita para dejar de estar "🔵 Evolutivo, sin evidencia".
3. Es reversible: si no aporta valor real, se borra sin dejar deuda
   arquitectónica (no cambia ningún puerto de `application`).

### 4.1 Fase 7.1 propuesta — Observer mínimo de actividad de Git

```text
Qué        Un comando/script que registra, en un archivo Markdown local
           (activity-log.md o similar, NO trackeado por git — mismo
           criterio que memory.md, raíz del repo), eventos reales de
           Git: qué se comiteó, cuándo, y (si está disponible) qué
           PolicyRule aprobó/denegó cada tool call de una corrida de
           `guerrero agent run`.

Cómo       GitWorkingTreeSource (ya real, este mismo trabajo) más un
           hook simple sobre PolicyEvaluator.evaluate() que loguee cada
           PolicyDecision real (ya se calcula, hoy se descarta después
           de decidir). Sin infraestructura nueva: ni tabla nueva, ni
           servidor MCP nuevo, ni cambio de contrato en application/.

Por qué    Es el primer dato real de "qué hizo el agente y qué se le
un archivo permitió" — exactamente lo que Fase 8 necesita para
Markdown,  eventualmente detectar patrones. Empezar en Postgres/pgvector
no Postgres sin saber todavía qué forma tienen los datos reales sería
           repetir el error que el propio Fase 4 evitó (diseñar el
           schema antes de tener evidencia de qué preguntas hay que
           responder).

Qué NO     No promueve nada a `memories` automáticamente. No es un
hace       ConflictDetector. No cambia PolicyEvaluator ni ningún puerto
           — solo lee decisiones ya tomadas, no participa en tomarlas.
```

### 4.2 Fase 7.2 propuesta (recién con evidencia de 7.1) — decidir si Memory Engine necesita una capa episódica

No se diseña acá. Se decide *si hace falta* después de tener 7.1
corriendo un tiempo real — con datos reales de qué tipo de eventos se
acumulan y si valen la pena promover a `memories` con más frecuencia o
detalle del que el pipeline actual (basado en commits) ya captura.

### 4.3 Todo lo demás de la propuesta externa

Queda explícitamente **diferido, no descartado** — mismo tratamiento
que Fase 8/9 ya tenían antes de esta conversación. Reabrir
`NoopMemoryConflictDetector`, diseñar autonomía gradual sobre
`IPolicyEngine`, o evaluar un Skill Workshop, cada uno necesita su
propio documento de este mismo tipo cuando 7.1 (u otro incremento
real) genere la evidencia que hoy no existe.

## 5. Riesgos de NO hacer este documento (por qué no se saltó directo a código)

- Reabrir `NoopMemoryConflictDetector`/`MemoryEmbedding` sin una
  decisión explícita violaría la regla vigente de `CLAUDE.md` para
  trabajo de Fase 5+ sobre contratos de Fase 4.
- Diseñar "autonomía gradual" en abstracto, sin casos reales, arriesga
  repetir el mismo error que `AllowReadRule`/`AllowScopedMutationRule`
  ya evitaron dos veces (diseñar una regla de aprobación sin evidencia
  de qué forma tienen los datos reales que va a evaluar).
- Adoptar mecanismos con nombres específicos de un proyecto no
  verificado (§2) como si fueran especificación, en vez de inspiración,
  arriesga construir para una API que no existe tal cual se describió.

## 6. Qué NO decide este documento

- No autoriza implementar 7.1 todavía — es una propuesta, pendiente de
  aprobación de Santiago, mismo ritual que `fase-6-developer-tools-map.md`.
- No decide si `NoopMemoryConflictDetector`/`MemoryEmbedding` se
  reabren — eso necesita su propio documento cuando haya evidencia real
  de 7.1 que lo justifique.
- No verifica los mecanismos de OpenClaw contra su código fuente real —
  si el usuario provee una ruta/URL, es un paso previo recomendado
  antes de diseñar cualquier equivalente específico (más allá de lo ya
  evaluado por mérito propio en §3).
- No renombra ni reordena Fase 8/9 en `roadmap-maestro.md` — las deja
  exactamente donde están, con la misma condición de apertura ("cuando
  haya evidencia concreta de que hace falta").
