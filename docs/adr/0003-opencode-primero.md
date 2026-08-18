# ADR 0003 — OpenCode como motor primario (revierte el orden del ADR 0002)

**Estado:** Aceptado
**Fecha:** 2026-08-18
**Contexto detallado:** auditoría de Fase 5.5 (esta sesión), `docs/roadmap-maestro.md` §7 ítem 6

## Contexto

El [ADR 0002](./0002-agent-engine-abstraction.md) declaró Cline como motor
primario de `IExecutionEngine` y OpenCode como adaptador secundario,
razonando que Cline tenía "SDK más maduro y con más superficie". Esa
decisión se tomó sin instalar ni inspeccionar ninguno de los dos paquetes
reales — Fase 3 (Foundation) los descartó deliberadamente para más
adelante.

Al llegar a Fase 5.5 (implementación real), esta sesión descargó ambos
paquetes de npm y los inspeccionó antes de escribir ningún adapter.

## Decisión

**OpenCode (`@opencode-ai/sdk` + binario `opencode` de `opencode-ai`) pasa
a ser el motor primario de `IExecutionEngine`. Cline queda diferido, sin
fecha ni descarte permanente.**

Evidencia recogida contra los paquetes reales:

- **`@cline/sdk` → `@cline/core`** (versión 0.0.75, real, instalable):
  4.2MB de definiciones de tipos. No es una librería de agente aislada —
  es el runtime completo del producto Cline: cuenta cloud propia
  (`ClineAccountService`, OAuth contra servidores de Cline), telemetría a
  endpoints de Cline (`OpenTelemetryProvider`, `captureSdkError`), un
  daemon/hub (`HubRuntimeHost`, `RemoteRuntimeHost`), teams/subagentes,
  marketplace de plugins, feature flags remotos. Ninguna de estas piezas
  tiene equivalente ni necesidad en Guerrero Dev — un agente personal
  local, sin cuenta cloud en ningún otro punto del stack (Ollama local,
  PostgreSQL local).
- **`@opencode-ai/sdk`** (versión 1.18.18, real, instalable): un cliente
  HTTP generado desde OpenAPI, sensiblemente más liviano, que se conecta a
  un servidor `opencode` local lanzado como subproceso
  (`createOpencodeServer()` vía `cross-spawn`, requiere el binario
  `opencode` del paquete `opencode-ai` en PATH). Arquitectura
  cliente-servidor autoalojada, sin cuenta cloud obligatoria — confirma
  exactamente lo que el ADR 0002 ya especulaba ("OpenCode: arquitectura
  cliente-servidor, más fácil de aislar"), ahora con el paquete real en
  vez de suposición.
- **Verificado en el sandbox de esta sesión** (mismo rigor que el bloqueo
  de Ollama documentado en Fase 5.1, con resultado distinto aquí): se
  instaló `opencode-ai` real, el binario `opencode` se resolvió en
  `node_modules/.bin/`, `opencode --version` respondió `1.18.18`, y
  `opencode serve --hostname=127.0.0.1 --port=<puerto>` arrancó un
  servidor real que sirvió su spec OpenAPI y su UI web sin ninguna llamada
  de red externa. El ciclo de vida del servidor OpenCode es verificable de
  verdad en un sandbox sin GPU/sin cuenta — solo enviar un prompt a un LLM
  real queda bloqueado aquí, por la misma razón que en Fase 5.1 (sin
  Ollama alcanzable en este entorno).

## Alternativas rechazadas

- **Mantener el orden del ADR 0002 (Cline primero)** — implicaría acoplar
  el primer `IExecutionEngine` real a una cuenta cloud de Cline que no
  existe hoy para este proyecto, y absorber una superficie de integración
  (OAuth, telemetría, daemon, marketplace) muy por encima de lo que un
  subpaso de Fase 5.5 debería intentar de una vez.
- **Implementar ambos motores en paralelo en esta fase** — prematuro;
  no hay todavía un caso de uso real corriendo con ninguno de los dos.
  Un motor real primero, evidencia de uso real, y recién ahí se evalúa si
  vale la pena sumar el segundo.
- **Descartar Cline definitivamente** — no hay evidencia suficiente para
  eso tampoco. Se difiere sin fecha; si en el futuro aparece una necesidad
  real que solo Cline resuelva, se reevalúa con evidencia, igual que se
  hizo acá.

## Consecuencias

- `packages/execution` gana `@opencode-ai/sdk` + `opencode-ai` como
  dependencias reales (Fase 5.5). `@cline/sdk` no se instala.
- El resto del ADR 0002 (el puerto `IExecutionEngine`, la independencia de
  `PolicyEvaluator` respecto al motor elegido, las alternativas rechazadas
  sobre acoplarse directo o construir un motor propio) sigue vigente sin
  cambios — este ADR revierte únicamente el orden Cline/OpenCode.
- OpenCode ejecuta llamadas a herramientas de forma autónoma dentro de su
  propio loop de sesión — el puente entre los eventos de permiso de
  OpenCode y `IPolicyEngine.evaluate()` (Fase 5.3) no se resuelve en este
  ADR ni en la implementación de Fase 5.5; queda como brecha conocida y
  documentada para un subpaso posterior (5.5b).
