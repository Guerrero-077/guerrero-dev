# ADR 0002 — Agent Engine Abstraction

**Estado:** Aceptado (parcialmente superseded — ver nota abajo)
**Fecha:** 2026-08-15
**Contexto detallado:** [`docs/fase-3-foundation.md`](../fase-3-foundation.md) §5-8, [`docs/fase-3-implementacion.md`](../fase-3-implementacion.md)

> **Nota (Fase 5.5, 2026-08-18):** el orden Cline-primero/OpenCode-secundario
> de este ADR se decidió sin inspeccionar los paquetes reales de npm. La
> auditoría de Fase 5.5 sí los inspeccionó y encontró evidencia que revierte
> ese orden — ver [ADR 0003](./0003-opencode-primero.md). El resto de este
> documento (el puerto `IExecutionEngine`, la independencia de
> `PolicyEvaluator`, las alternativas rechazadas) sigue vigente sin cambios;
> solo el orden Cline/OpenCode queda superseded.

## Contexto

Cline (`@cline/sdk`) y OpenCode tienen SDKs TypeScript maduros para embeber un agente de código en una aplicación propia. Ambos son candidatos razonables como motor de ejecución de Guerrero Dev, y no es descartable que en el futuro convenga sumar otros (OpenHands, o un motor propio). Necesitábamos decidir cómo integrarlos sin acoplar el resto del sistema (Policy Engine, agent-core, API, CLI) a un SDK concreto.

## Decisión

Se define el puerto `IExecutionEngine` en `@guerrero-dev/application` (`common/ports/IExecutionEngine.ts`):

```typescript
interface IExecutionEngine {
  readonly name: string;
  plan(task: AgentTask): Promise<ExecutionPlan>;
  execute(plan: ExecutionPlan, options: ExecutionOptions): Promise<ExecutionResult>;
}
```

Todo el sistema (agent-core, Policy Engine, apps/api, apps/cli) programa contra esta interfaz. Las implementaciones concretas viven en `@guerrero-dev/execution`:

```text
IExecutionEngine
      ▲
      │
      ├── NoopExecutionEngine        (Foundation — implementado)
      ├── ClineExecutionEngine       (Fase 7 — no implementado)
      ├── OpenCodeExecutionEngine    (Fase 7 — no implementado)
      └── OpenHandsExecutionEngine   (futuro, no comprometido)
```

**No se instala `@cline/sdk` ni el SDK de OpenCode en Foundation.** Primero se valida el contrato con `NoopExecutionEngine` (usado para cablear `AgentService`/API/CLI de punta a punta sin autonomía real); recién cuando exista un caso de uso real que lo requiera (Fase 7) se agrega el SDK concreto y se implementa el adapter correspondiente.

La seguridad no depende de esta abstracción: `PolicyEvaluator` (implementación de `IPolicyEngine`) es una pieza independiente del motor de ejecución — el día que se cambie de Cline a OpenCode (o se sumen ambos), las políticas de aprobación de herramientas se mantienen intactas.

## Alternativas rechazadas

- **Acoplarse directamente a Cline SDK desde agent-core/API** — más rápido al principio, pero cualquier limitación o cambio de licencia/API de Cline se propaga a todo el sistema. Descartado por el principio arquitectónico ya establecido: las dependencias externas apuntan hacia infrastructure/execution, nunca hacia domain/application.
- **Elegir un solo motor de forma definitiva ahora** — prematuro. Cline y OpenCode tienen tradeoffs distintos (Cline: SDK más maduro y con más superficie; OpenCode: arquitectura cliente-servidor, más fácil de aislar). No hay evidencia todavía de cuál conviene para el caso de uso real de Guerrero Dev.
- **Construir un motor de ejecución propio desde cero** — reinventar planificación de tareas, tool calling y manejo de contexto no aporta valor diferencial frente a usar un SDK maduro detrás de una interfaz propia.

## Consecuencias

- Cambiar de motor de ejecución (o soportar varios simultáneamente, enrutando por tarea) es un cambio contenido a `@guerrero-dev/execution` — no toca `domain`, `application`, ni las rutas de la API.
- Hasta Fase 7, cualquier caso de uso que dependa de `IExecutionEngine` se puede probar y demostrar con `NoopExecutionEngine`, sin necesitar credenciales ni SDKs externos instalados.
- Cuando se implemente `ClineExecutionEngine`, este ADR se actualiza (o se abre un ADR 0003) documentando qué API de `@cline/sdk` se usa y por qué.
