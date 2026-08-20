# Investigación — SDK de OpenCode: superficie, límites y uso real en el repo

**Fecha:** 2026-08-20
**Alcance:** documentación pública de `@opencode-ai/sdk`/`opencode serve` (V1, la
versión real instalada — `1.18.18`, pineada en `packages/execution/package.json`)
y auditoría del único consumidor real del SDK en el repo,
`packages/execution/src/OpenCodeExecutionEngine.ts` (Fase 5.5-5.14, ver
`docs/fase-7-cline-opencode-integration-closure.md`).

**No es un ADR ni un cierre de fase.** Es una nota de investigación que
alimenta decisiones futuras (Fase 8+) sobre esta pieza — mismo criterio de
rigor que el resto de `docs/`: solo se afirma lo verificado contra fuente
primaria (registry de npm, un issue real leído completo, el código real del
repo); lo que viene de un resumen automatizado de búsqueda web se marca
explícitamente como tal, con su nivel de confianza.

## 1. Método y nivel de confianza de cada fuente

| Fuente | Cómo se verificó | Confianza |
|---|---|---|
| `registry.npmjs.org/@opencode-ai/sdk` y `/opencode-ai` | `curl` directo al registry, JSON parseado | Alta — dato primario |
| `github.com/anomalyco/opencode/issues/9650` y `#26907` | `WebFetch` del issue completo | Alta — texto primario, no resumen de terceros |
| `opencode.ai/docs/*` | **No fetcheable directo** (la red de este entorno bloquea el dominio vía `WebFetch`) — todo lo de esta sección viene de `WebSearch`, que sí devuelve fragmentos indexados | Media — son fragmentos reales de la página, pero pasados por un resumen automático; no se leyó la página completa |
| Blogs/mirrors de terceros sobre "OpenCode V2" | `WebSearch` | Media-baja — se usa solo para orientar, la conclusión final se ancla al registry de npm (alta confianza) |

Regla aplicada: cualquier afirmación de esta sección que dependa solo de
confianza "media" o "media-baja" se marca explícitamente como tal, no se
mezcla con lo verificado.

## 2. Arquitectura del SDK (V1)

`opencode serve` corre como servidor HTTP y expone un spec **OpenAPI 3.1**
(`GET /doc`) del que `@opencode-ai/sdk` se genera automáticamente. Esto
explica, con causa raíz y no como anécdota aislada, lo que Fase 5.9d ya
había encontrado empíricamente: los tipos del paquete npm y el binario real
pueden desincronizarse entre sí **aunque compartan el mismo número de
versión** (`"1.18.18"` en ambos, tipos igual desincronizados — ver
`OpenCodeExecutionEngine.ts` líneas 104-129). No es un bug de una versión
puntual; es una propiedad estructural de cómo se distribuye este SDK
(codegen en build-time de un lado, binario corriendo del otro). La práctica
ya adoptada en este repo — verificar contra `GET /doc` en vivo antes de
confiar en un tipo del SDK — es la mitigación correcta para esa propiedad,
no una precaución de más.

## 3. Superficie real del SDK — qué ofrece

| Área | Qué expone | Confianza |
|---|---|---|
| Session | `create/get/list/delete/update/abort/prompt` | Media (WebSearch sobre docs) |
| Events | `event.subscribe()` — SSE único por conexión; tipos observados: `session.status`, `session.idle`, `session.error`, `message.part.updated`/`message.part.delta`, `permission.asked`, `session.created`, `session.next.agent.switched` | Media, salvo `permission.asked`/`session.created` que están verificados en vivo por este repo (alta, ver `OpenCodeExecutionEngine.ts`) |
| Permissions | Config declarativa `allow`/`ask`/`deny` por tool; `additionalProperties: true` (no limitado a una lista fija) | Alta — verificado en vivo por este repo, Fase 6n |
| Tools nativos | `read, write, edit, grep, glob, bash, list, webfetch, task, todowrite, todoread`, LSP | Media |
| Agents/Subagentes | Agentes primarios + subagentes invocables vía tool `task`; permisos configurables por agente; subagentes tienen `sessionID` propio con `parentID` | La parte de `parentID`/`session.created` está verificada en vivo (Fase 5.11, alta); el resto es media |
| MCP | Servidores locales (`stdio`) y remotos (`http`, OAuth automático) | Media, coincide con el patrón real usado en `@guerrero-dev/mcp` |
| Plugins | Módulos TS/JS con 25+ hooks de ciclo de vida (tool, permission, session, message, server...), pueden interceptar ejecución de tools | Media — **no usado en este repo** |
| Providers | `@ai-sdk/openai-compatible` para cualquier endpoint, incluido Ollama nativo | Alta — es lo que ya usa `apps/cli/src/commands/agent.ts` |

## 4. Límites confirmados (no supuestos)

### 4.1 El stream de eventos es global al directorio, no por sesión — y es definitivo

Verificado con fuente primaria: el issue
[`anomalyco/opencode#9650`](https://github.com/anomalyco/opencode/issues/9650)
("Support sessionID Filter for SSE Event Subscription") pide exactamente
esto — un parámetro `sessionID` en `GET /event` para no recibir eventos de
sesiones ajenas. **Fue cerrado como "not planned".** El propio reporte cita
que "incluso el código interno de OpenCode filtra por sessionID del lado
del cliente" — es decir, el patrón que `handlePermissionEvents()` usa en
este repo (`sessionFamily`, un `Set` poblado a mano siguiendo
`session.created`) no es un workaround provisional a reemplazar más
adelante: **es la única forma soportada de aislar eventos de una sesión**,
según el propio mantenedor del proyecto. Esto cierra una pregunta que había
quedado abierta en la conversación previa a este documento.

### 4.2 Tipos del SDK pueden no coincidir con el binario, aunque compartan versión

Ya documentado en detalle en el JSDoc de `OpenCodeExecutionEngine`
(Fase 5.9d, líneas 104-129 del archivo) — se repite acá porque es, junto
con 4.1, el hallazgo estructural más importante para cualquier trabajo
futuro contra este SDK: `Event`/`EventPermissionUpdated`/`Permission`
declaran `"permission.updated"`; el binario real emite `"permission.asked"`
con una forma de propiedades distinta. Confirmado con dos suscripciones SSE
paralelas contra un servidor real, más inspección de `GET /doc` en vivo.

### 4.3 Sin control documentado de contexto/tokens por request

No se encontró, ni en la documentación pública ni en el código real de
`session.prompt()`, ningún campo del body que permita pasar `num_ctx` (o
equivalente) por request. Esto no es necesariamente un límite del SDK —
puede ser una responsabilidad del provider (Ollama) configurado por fuera —
pero **no está verificado de ninguna forma**, a diferencia de todo lo
demás en esta sección. Queda como pregunta abierta, no como hallazgo.

## 5. OpenCode V2 — verificado contra el registry de npm, no contra blogs

Existen referencias de terceros a una "OpenCode V2" (`opencode.ai/v2/docs`)
con superficie más amplia (PTY sessions, snapshots/reverts, compactación de
primera clase, nuevo contrato de plugins — los plugins V1 no funcionan en
V2, instala side-by-side como binario separado `opencode2`). Antes de darle
crédito, se verificó directo contra `registry.npmjs.org/@opencode-ai/sdk`:

```
dist-tags: { ..., "latest": "1.18.19", "beta": "0.0.0-beta-202608110357", ... }
major versions publicados: 0, 1  (ningún "2.x" real)
```

**Conclusión, alta confianza (dato primario):** V2 es real y activo, pero
no tiene ningún release semver estable — el tag `beta` apunta a un snapshot
(`0.0.0-beta-*`) de días atrás. Adoptarlo hoy significaría pinear una
prerelease inestable, no una versión real. Vale la pena vigilarlo — podría
resolver 4.1 de raíz al rediseñar el modelo de eventos — pero no es una
opción de migración actual.

## 6. Auditoría del uso real: `OpenCodeExecutionEngine.ts`

### 6.1 Confirmado correcto (con evidencia)

| Elemento | Uso en el código | Por qué es correcto |
|---|---|---|
| Módulo raíz del SDK, no `/v2` | Import de `@opencode-ai/sdk` (línea 9) | V2 es prerelease (§5) — quedarse en V1 es la decisión correcta hoy |
| `session.create({query:{directory}})` | `plan()`, línea 188 | Coincide con la superficie documentada |
| `event.subscribe()` + filtro client-side por `sessionFamily` | `handlePermissionEvents()`, líneas 234-236, 354-395 | Es la única forma soportada, confirmado por §4.1 (no hay alternativa server-side) |
| Type guards runtime (`asPermissionAsked`, `asSessionCreated`) en vez de confiar en los tipos del SDK | Líneas 437-472 | Correcto dado §4.2 — los tipos pueden mentir |
| `AbortController` único gobernando `event.subscribe` y `session.prompt`, abort incondicional al resolver | Líneas 223-281 | Cierra el hang real de 5.9c/5.9d de raíz, no con un timeout que solo mitiga |
| Nunca responder `"always"` a un permiso, solo `"once"`/`"reject"` | Línea 392 | Preserva fail-closed reevaluado por solicitud — `"always"` haría que OpenCode deje de consultar `IPolicyEngine` |
| `system` en `body` de `session.prompt()` en vez de `Config.agent.build.prompt` | Líneas 46-62, 270 | Correcto: la alternativa es a nivel servidor completo, no por-request — se descartó con razón documentada |

### 6.2 Gap real 1 — `session.abort()` no se invoca en el camino de timeout

**Evidencia concreta, con líneas.** Cuando `session.prompt()` falla porque
`listenerError` quedó seteado (líneas 283-286), el código sí llama
`this.client.session.abort({path:{id: plan.id}})` antes de propagar el
error — correcto, le avisa al servidor que corte la sesión. Pero en el
catch de la línea 333-348, que cubre exactamente el caso `options.timeoutMs`
vencido, **no hay ningún llamado a `session.abort()`** — solo
`controller.abort()`, que cancela la conexión HTTP del lado del cliente.

```typescript
} catch (error) {
  if (promptSettled) throw error;
  controller.abort();      // cancela el fetch del cliente
  await listening;
  if (timedOut) {
    throw new OpenCodeExecutionEngineError("timeout", ...);
    // ← nunca se llamó this.client.session.abort() acá
  }
  throw error;
}
```

Confirmado también por el propio test suite: la prueba de `timeoutMs`
(`OpenCodeExecutionEngine.test.ts`, línea 614) verifica el `reason: "timeout"`
del error, pero **no verifica `calls.abort`** — a diferencia de la prueba de
la línea 600-611, que sí lo hace (`expect(calls.abort).toEqual([])`) para
el caso de cierre benigno del stream. No hay ninguna prueba que confirme
que el timeout efectivamente le avisa al servidor.

**Por qué importa en este proyecto puntual, no en abstracto:** abortar el
fetch del lado del cliente no garantiza que `opencode serve` cancele su
propia llamada en curso al provider (Ollama). Si no lo hace, una tarea que
se corta por `timeoutMs` deja la inferencia corriendo del lado del servidor
— con `qwen2.5:7b-instruct-q4_K_M` corriendo cerca del límite de 6GB de
VRAM de un hardware de referencia real (ver conversación previa a este
documento), una generación huérfana que sigue consumiendo GPU/CPU después
de que el cliente ya reportó `"failed"` es exactamente el tipo de fuga que
después se ve como degradación de rendimiento inexplicada en la siguiente
invocación. No hay evidencia todavía de que esto pase en la práctica —
es un gap de uso del SDK confirmado por lectura de código, no un
comportamiento observado — pero es barato de cerrar y consistente con el
patrón que el propio archivo ya usa dos líneas más arriba.

### 6.3 Gap real 2 — ninguna sesión se borra nunca

`plan()` crea una sesión (`session.create`) por cada tarea; `execute()` la
usa una vez. En ningún punto del archivo se llama `session.delete()` —
método que la documentación del SDK confirma que existe (§3, tabla de
Session). Dado que Fase 7 ya documentó, como gap operacional conocido
(`docs/fase-7-cline-opencode-integration-closure.md` §10), que `opencode
serve` persiste una instancia/estado por directorio en
`~/.local/share/opencode/opencode.db`, y que `AgentSession` en este repo
**no se persiste** (cada `agent run` es efímero, sin necesidad real de
mantener la sesión de OpenCode viva después de `execute()`), dejar
sesiones sin borrar acumula estado del lado del servidor sin ningún
consumidor que lo necesite. No hay medición de cuánto pesa esto — es una
hipótesis razonable a validar, no un hecho confirmado.

### 6.4 Oportunidades no exploradas (no son gaps, son superficie sin usar)

- **Plugins con hook de `permission`** (§3): en teoría permitirían evaluar
  la política dentro del propio proceso `opencode serve`, sin el roundtrip
  HTTP completo que hoy hace `handlePermissionEvents()` (SSE de entrada +
  `POST /session/{id}/permissions/{id}` de salida). No hay evidencia de que
  esto sea más rápido en la práctica, ni de que un plugin pueda invocar
  `IPolicyEngine` (TypeScript del lado de `application`) de forma síncrona
  sin reintroducir el mismo costo de otra manera. Vale como experimento a
  futuro, no como recomendación.
- **`message.part.delta`** (streaming incremental): no se usa — `execute()`
  espera la respuesta completa de `session.prompt()`. Para una CLI que ya
  documentó turnos de 25-33s, mostrar salida incremental sería una mejora
  de percepción de rendimiento, no de rendimiento real. No cambia el
  contrato de `IExecutionEngine` (`execute()` sigue devolviendo un
  resultado final), sería aditivo del lado de `apps/cli`.
- **Compactación de sesión**: no aplica todavía — solo tiene sentido con
  sesiones multi-turno persistidas, y `AgentSession no se persiste` sigue
  siendo un gap operacional vigente (Fase 7 §10). Mencionarla como
  prioridad ahora sería resolver un problema que este repo no tiene todavía.

## 7. Recomendaciones, en orden de impacto/costo

1. **Llamar `session.abort()` en el catch de timeout** (§6.2) — cambio
   acotado a `OpenCodeExecutionEngine.execute()`, mismo patrón que ya existe
   dos líneas más arriba para `listenerError`. Bajo costo, cierra un gap
   real confirmado por código y por ausencia de test.
2. **Llamar `session.delete()` al finalizar `execute()`** (éxito o fallo),
   dado que ninguna sesión de este repo se reusa hoy. Antes de aplicarlo,
   confirmar contra `GET /doc` en vivo que el método existe con esa firma
   exacta en `1.18.18/1.18.19` — mismo criterio de verificación que el
   resto de este archivo, no asumir la documentación.
3. **No migrar a OpenCode V2** — sigue siendo prerelease, sin release
   semver estable (§5). Revisar de nuevo cuando el registry muestre un
   major `2.x` real.
4. **No perseguir compactación ni streaming incremental todavía** — no hay
   sesión persistida que compactar, y el streaming es una mejora de UX, no
   un problema de rendimiento real medido.

## 8. Fuentes

- [`@opencode-ai/sdk` en npm](https://www.npmjs.com/package/@opencode-ai/sdk) — verificado directo vía registry
- [Issue #9650 — Support sessionID Filter for SSE Event Subscription](https://github.com/anomalyco/opencode/issues/9650) (cerrado, "not planned")
- [Issue #26907 — permission prompt stuck after approving child session request](https://github.com/anomalyco/opencode/issues/26907) (Web UI, no aplica a este repo)
- [SDK | OpenCode](https://opencode.ai/docs/sdk/)
- [Server | OpenCode](https://opencode.ai/docs/server/)
- [MCP servers | OpenCode](https://opencode.ai/docs/mcp-servers/)
- [Providers | OpenCode](https://opencode.ai/docs/providers/)
- [Migrate from V1 | OpenCode](https://opencode.ai/v2/docs/migrate-v1)
- `packages/execution/src/OpenCodeExecutionEngine.ts` y su test suite — código real de este repo
- `docs/fase-7-cline-opencode-integration-closure.md` — contexto de fase
