# memory.md — Registro de errores y debugging

Este archivo registra errores conocidos, workarounds activos, y patrones de debugging del proyecto Guerrero Dev. Es un documento vivo — actualizalo cuando encontrés o resuelvas un error.

---

## Errores conocidos (documentados en docs/)

### 1. MemoryEmbedding gap — no se escriben embeddings durante la promoción

- **Archivo:** `docs/fase-4-memory-engine-closure.md`
- **Componente:** `DrizzleMemoryPromotionUnitOfWork`
- **Symptom:** Una `Memory` recién promovida es invisible para `DrizzleMemoryCandidateRetriever` porque hace inner join con `memory_embeddings` y esa tabla nunca recibe registros durante la promoción.
- **Causa:** `IMemoryPromotionUnitOfWork` no toca `memory_embeddings`. El gap es de contrato, no de implementación.
- **Impacto:** Las memorias nuevas no aparecen en retrieval hasta que ocurra un reindexado aparte.
- **Estado:** Gap deliberado. Reabrir en Fase 5.

### 2. NoopMemoryConflictDetector — siempre devuelve []

- **Archivo:** `docs/fase-4-memory-engine-closure.md`
- **Componente:** `NoopMemoryConflictDetector`
- **Symptom:** Nunca detecta conflictos entre memorias candidatas.
- **Causa:** Implementación intencionalmente vacía. La detección de conflictos no estaba en alcance de Fase 4.
- **Impacto:** Baja — las memorias duplicadas se manejan por `MemoryCandidateDeduplicator` (Ollama + pgvector).
- **Estado:** Gap deliberado. Sin fecha de reapertura.

### 3. RiskSignal sin productores ni consumidores

- **Archivo:** `docs/fase-4-memory-engine-closure.md`
- **Componente:** `application/memory/models/` — tipo `RiskSignal`
- **Symptom:** El tipo existe pero ningún código lo produce ni lo consume.
- **Causa:** Definido como anticipación de detección de conflictos (gap #2).
- **Impacto:** Nulo — tipo muerto, no afecta runtime.
- **Estado:** Gap deliberado. Depende de resolución de gap #2.

### 4. Deadlock en permission.asked (Fase 5.9c)

- **Archivo:** `docs/fase-4-memory-engine.md` (sección 5.9c)
- **Componente:** `OpenCodeExecutionEngine` ↔ OpenCode SDK
- **Symptom:** El agente se cuelga indefinidamente cuando OpenCode emite un evento `permission.asked` para `external_directory`.
- **Causa raíz:** Los tipos del SDK declaran `permission.updated` pero el binario emite `permission.asked` (confirmado en 5.9d). El handler original escuchaba el evento equivocado.
- **Workaround activo:** `EXECUTION_TIMEOUT_MS = 120_000` (2 min hard timeout).
- **Fix real (5.9d):** Handler actualizado para escuchar `permission.asked`. Verificado contra binario real.
- **Estado:** Mitigación + fix aplicado. Root cause documentada.

### 5. Modelos que fallan con tool-calling (Fase 5.9)

- **Archivo:** `docs/fase-4-memory-engine.md` (sección 5.9)
- **Componente:** Ollama + OpenCode
- **Modelos problemáticos:**
  - `qwen2.5-coder:7b` — soporta tools según su template pero no los envuelve de forma consistente en la práctica.
  - `gemma3:4b` — no soporta tools en Ollama en absoluto.
- **Modelo confirmado:** `qwen2.5:7b-instruct-q4_K_M` — el único local con tool-calling confiable.
- **Estado:** Documentado. Usar `OLLAMA_DEFAULT_MODEL` o `--model` flag.

### 6. webfetch auto-allow sin IPolicyEngine (Fase 5.9b)

- **Archivo:** `docs/fase-4-memory-engine.md` (sección 5.9b)
- **Componente:** `OpenCodeExecutionEngine` + OpenCode SDK
- **Symptom:** OpenCode auto-permitía `webfetch` sin pasar por `IPolicyEngine`, bypassando la política de seguridad.
- **Fix:** Se agregó `permission: { webfetch: "ask" }` al construir la sesión para forzar que vaya por el bridge de permisos.
- **Estado:** Resuelto. Commit `25ff014`.

### 7. Path hallucination del LLM (Fase 6p)

- **Componente:** Agente LLM en `agent run`
- **Symptom:** El modelo `qwen2.5:7b-instruct-q4_K_M` inventa paths absolutos (ej: `/Users/dev/...`) en tool calls en vez de usar los paths reales del proyecto.
- **Causa:** Limitación del modelo — alucina paths plausible-sounding.
- **Estado:** Conocido. Mitigación por `AllowScopedMutationRule` que valida paths contra `projectRootPath`.
- **Verificación (2026-08-20):** Confirmado con proxy HTTP y logs de OpenCode. El `edit` SÍ se ofrece al modelo (`permission=edit action.action=ask`) y SÍ se ejecuta (`formatting file` + `touching file`), pero el modelo a veces: (a) alucina el resultado del tool call en vez de ejecutarlo realmente, o (b) usa el tool con argumentos incorrectos (reemplaza contenido completo en vez de hacer append). Ambos son limitaciones del modelo, no del wiring.
- **Detalle adicional:** OpenCode ancla paths al `projectRoot` de su config interna — al usar un worktree, el `edit` se ejecuta en el repo original (`C:\Dev\agente\guerrero-dev\package.json`), no en el worktree. Esto es comportamiento esperado del SDK.

### 8. AllowReadRule no alcanzable en runtime (Fase 5.13)

- **Archivo:** `docs/fase-4-memory-engine.md` (sección 5.13)
- **Componente:** `agent-core/src/rules/AllowReadRule.ts`
- **Symptom:** La regla estaba implementada y testeada, pero ningún composition root la registra en `PolicyEvaluator`. `guerrero agent run` usaba un `PolicyEvaluator` sin reglas (fail-closed: deniega todo).
- **Estado:** RESUELTO en Fase 6.3 — `AllowReadRule` fue reemplazada por `AllowScopedMutationRule` que sí se registra en el composition root.

### 9. `Config.agent.build.tools` deprecado — nunca tuvo efecto (Fase 6.1)

- **Archivo:** `apps/cli/src/commands/agent.ts`, `docs/roadmap-maestro.md` (ítem 8f)
- **Componente:** OpenCode SDK `@opencode-ai/sdk@1.18.18`
- **Symptom:** `tools.edit: true` en `Config.agent.build.tools` nunca agregó `edit` al array real de tools que se le mandaba al modelo. Verificado con proxy HTTP: `edit` siempre ausente.
- **Causa:** `Config.agent.*.tools` está deprecado y migrado a `Config.agent.*.permission` (formato string `"ask"/"allow"/"deny"`). La migración automática tiene bugs documentados (issues #6892, #7810, #16028 del propio OpenCode).
- **Fix:** Reemplazado por `Config.agent.build.permission` (campo vigente). Verificado con proxy HTTP: `edit` ahora sí aparece en el catálogo real.
- **Estado:** Resuelto. Commit `7e43c8c`.
- **Verificación end-to-end (2026-08-20):** Confirmado con `qwen2.5:7b-instruct-q4_K_M` real (no por sustitución con `read`), contra un directorio de prueba descartable. Caso positivo: instrucción de editar `package.json` -- log real muestra `message=asking ... permission=edit`, `AllowScopedMutationRule` aprobó (path dentro de `projectRootPath`, fuera de la deny-list), el archivo real cambió, `Estado: succeeded`. Caso negativo: misma instrucción contra `.env` -- mismo `permission=edit` real pedido, `AllowScopedMutationRule` denegó (deny-list), `.env` quedó intacto, `Estado: failed` (`The user rejected permission...`). El mecanismo real (`BUILD_AGENT_PERMISSION` + `AllowScopedMutationRule`) queda confirmado en ambas direcciones, con el modelo de 7B, sin pendientes de wiring -- ver también el ítem 7 para la limitación de fiabilidad del modelo (reemplaza contenido completo en vez de hacer append), independiente de este fix.

### 10. Instancia de OpenCode envenenada por directorio de trabajo (Fase 5.4c)

- **Archivo:** `apps/cli/src/commands/agent.ts` (JSDoc de `registerAgentCommands`)
- **Componente:** `opencode serve` v1.18.18
- **Symptom:** `opencode serve` devuelve `Unexpected error / ServeError` silencioso al intentar spawnear un servidor MCP, sin processos MCP visibles.
- **Causa:** OpenCode mantiene una "instancia" por directorio persistida en `~/.local/share/opencode/opencode.db`. Un primer intento roto contra un directorio deja esa instancia envenenada — reintentos posteriores contra el mismo directorio siguen fallando.
- **Workaround:** Usar un directorio de trabajo nuevo. No es un bug de nuestro código.
- **Estado:** Conocido, sin fix upstream.

### 11. `write` ignora `permission.write: "deny"` (Fase 6.1)

- **Archivo:** `apps/cli/src/commands/agent.ts` (JSDoc de `BUILD_AGENT_PERMISSION`)
- **Componente:** OpenCode SDK
- **Symptom:** `write` siguió apareciendo en el array real pese a `permission.write: "deny"` — a diferencia de `bash`/`webfetch`/`apply_patch`/`websearch` que sí desaparecieron correctamente.
- **Causa:** Posible bug de mapeo de nombres similar al de `apply_patch`/`patch` documentado en issue #16028. Sin confirmar.
- **Workaround:** `AllowScopedMutationRule` deniega `write` por defecto (solo aprueba `read`, Code Intelligence, y `edit` con validación). Red de seguridad independiente.
- **Estado:** Conocido, mitigado por AllowScopedMutationRule.

### 12. pnpm version conflict en GitHub Actions

- **Archivo:** `.github/workflows/ci.yml`, `.github/workflows/integration.yml`
- **Componente:** `pnpm/action-setup@v4`
- **Symptom:** `Error: Multiple versions of pnpm specified` — el action detecta `version: 9` en el workflow YAML y `pnpm@9.15.0` en `package.json`'s `packageManager`. Falla con `ERR_PNPM_BAD_PM_VERSION`.
- **Causa:** `pnpm/action-setup@v4` lee `packageManager` de `package.json` automáticamente. Si además se especifica `version:` en el workflow, conflicta.
- **Fix:** Quitar `version:` del workflow. Dejar que lea de `package.json`.
- **Estado:** Resuelto. Commits `17cd7cb`.

### 13. Tests cross-platform fallan por paths de Windows con backslashes

- **Archivo:** `packages/agent-core/src/rules/AllowScopedMutationRule.test.ts`
- **Componente:** Tests de `AllowScopedMutationRule`
- **Symptom:** Test "deniega una ruta sensible con path absoluto real de Windows" falla en CI (Linux) con: `expected "C:/Dev/agente/guerrero-dev/.env" to contain 'deny-list'` — el motivo real es `"está fuera de projectRootPath: denegado"`.
- **Causa:** En Linux, `path.resolve("C:/...", "C:/.../.env")` produce `/C:/.../.env` (con `/` al inicio porque Linux trata `C:` como nombre de directorio relativo). `path.relative(root, "/C:/...")` calcula `../../C:/...` → "fuera de root". El test nunca llega a la check de deny-list.
- **Fix:** Usar paths Linux (`/home/user/guerrero-dev/.env`) que funcionan en ambas plataformas — Node.js en Windows acepta `/` como separador válido. No intentar simular paths de Windows en tests.
- **Regla:** Los tests que usan paths absolutos deben usar formato Linux (`/...`) — funciona en Windows y Linux. Nunca hardcodear `C:\\...` en tests.
- **Estado:** Resuelto. Commit `c2d7c49`.

---

## Workarounds activos

| Workaround | Error mitigado | Archivo/config | Notas |
|------------|---------------|----------------|-------|
| `EXECUTION_TIMEOUT_MS = 120_000` | Deadlock permisos (5.9c) | `apps/cli/src/commands/agent.ts` | Hard timeout de 2 min |
| `MAX_AGENT_STEPS = 6` | Loops infinitos del agente (5.12) | `apps/cli/src/commands/agent.ts` | Bounds el número de iteraciones |
| `BUILD_AGENT_PERMISSION` (edit: ask, bash/deny, etc.) | Herramientas no deseadas (6.1) | `apps/cli/src/commands/agent.ts` | Reemplaza a `DISABLED_TOOLS` (deprecado). Campo vigente: `Config.agent.build.permission` |
| `PERMISSION` (read: ask, Code Intelligence: ask) | Tools auto-aprobadas sin IPolicyEngine (6n) | `apps/cli/src/commands/agent.ts` | Fuerza `permission.asked` para tools que OpenCode auto-aprobaba |
| `AllowScopedMutationRule` | Escritura sin validación (6.3) | `packages/agent-core/src/rules/` | Fail-closed: solo aprueba read + Code Intelligence + edit (con validación de path) |

---

## Patrones de debugging

### El agente no arranca / falla al conectar
1. Verificar que Postgres esté corriendo: `docker compose ps`
2. Verificar `DATABASE_URL` en `.env`
3. Correr `guerrero doctor` — reporta estado de cada dependencia

### El agente se cuelga (deadlock)
1. Verificar que `EXECUTION_TIMEOUT_MS` esté configurado (default 120s)
2. Revisar logs de OpenCode: ¿emitió `permission.asked` y quedó esperando respuesta?
3. Verificar que el handler de permisos esté escuchando `permission.asked` (no `permission.updated`)

### El agente no devuelve texto / devuelve vacío
1. Verificar que `BUILD_AGENT_PERMISSION` no esté denegando demasiadas herramientas
2. Verificar que `MAX_AGENT_STEPS` no esté cortando el loop prematuramente
3. Probar con `--model qwen2.5:7b-instruct-q4_K_M` — es el modelo confirmado
4. Verificar que `AllowScopedMutationRule` no esté denegando la tool que el modelo intenta usar

### El agente intenta editar pero falla
1. Verificar que `BUILD_AGENT_PERMISSION` tenga `edit: "ask"` (no `"deny"`)
2. Verificar que `AllowScopedMutationRule` esté registrada en `PolicyEvaluator`
3. Verificar que el path del archivo esté dentro de `projectRootPath`
4. Verificar que el archivo no esté en la deny-list de rutas sensibles (`SENSITIVE_RELATIVE_PATHS`)
5. El modelo alucina paths absolutos (6p) — es limitación del modelo, no del wiring

### Embeddings no aparecen en retrieval
1. Es el gap #1 conocido: `MemoryEmbedding` no se escribe en promoción
2. Verificar que `OLLAMA_EMBEDDING_MODEL` esté configurado
3. Verificar que Ollama esté corriendo: `curl http://localhost:11434/api/tags`

### Tests de integración fallan
1. Asegurar `docker compose up -d postgres`
2. Asegurar `pnpm build` antes de correr tests (el subpath `./app` se importa desde `dist/`)
3. Usar `--no-file-parallelism` — los tests están serializados a propósito

### CI falla con "Multiple versions of pnpm"
1. Quitar `version:` de `.github/workflows/*.yml`
2. `pnpm/action-setup@v4` lee de `package.json`'s `packageManager` automáticamente

### Test falla en CI pero pasa en Windows
1. Verificar si el test usa paths con `\\` (backslashes de Windows)
2. En Linux, `path.resolve("C:/...", "C:/...")` produce `/C:/...` — se resuelve fuera del root
3. Usar paths Linux (`/home/user/...`) que funcionan en ambas plataformas
4. Nunca hardcodear `C:\\` en tests — usar `/` que es válido en Windows y Linux

---

## Template para nuevos errores

```markdown
### [N]. [Título del error]

- **Archivo:** docs/... o archivo específico
- **Componente:** package/clase afectada
- **Symptom:** Qué observa el usuario o el agente
- **Causa:** Por qué ocurre
- **Workaround:** Si hay mitigación temporal
- **Fix:** Si se resolvió, cómo
- **Estado:** Conocido | En investigación | Resuelto
- **Fecha:** YYYY-MM-DD
```
