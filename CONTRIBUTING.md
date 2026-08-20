# Contributing a Guerrero Dev

Guía de convenciones para ramas, commits y flujo de trabajo.

## Convencional Commits

Todo commit en `main` debe seguir el formato [Conventional Commits v1.0.0](https://www.conventionalcommits.org/):

```
<tipo>(<scope>): <descripción corta>

[ cuerpo opcional ]

[ footer opcional ]
```

### Tipos permitidos

| Tipo | Uso | Ejemplo |
|------|-----|---------|
| `feat` | Nueva funcionalidad | `feat(agent-core): Fase 5.2 — AgentOrchestrator consumes BuiltContext` |
| `fix` | Corrección de bug | `fix(execution): resolver hang en OpenCodeExecutionEngine.execute()` |
| `docs` | Solo documentación | `docs: actualizar roadmap-maestro §2/§3 al estado real` |
| `refactor` | Reestructurar sin cambiar comportamiento | `refactor(infrastructure): extraer OllamaProviderError` |
| `test` | Agregar o modificar tests | `test(agent-core): AllowScopedMutationRule — 21 casos` |
| `chore` | Tareas de mantenimiento | `chore: cargar .env en el CLI` |
| `perf` | Mejora de rendimiento | `perf(infrastructure): optimizar extractSymbols` |
| `ci` | Cambios en CI/CD | `ci: agregar step de typecheck` |
| `build` | Sistema de build o dependencias | `build: actualizar pnpm-lock.yaml` |
| `revert` | Revertir un commit | `revert: feat(agent-core): Fase 5.2` |

### Scopes del proyecto

Los scopes corresponden a los packages del monorepo:

| Scope | Package |
|-------|---------|
| `agent-core` | `packages/agent-core` |
| `application` | `packages/application` |
| `domain` | `packages/domain` |
| `execution` | `packages/execution` |
| `infrastructure` | `packages/infrastructure` |
| `mcp` | `packages/mcp` |
| `shared` | `packages/shared` |
| `cli` | `apps/cli` |
| `api` | `apps/api` |

Scopes adicionales válidos:

| Scope | Uso |
|-------|-----|
| `docs` | Documentación general (`docs/`) |
| `scripts` | Scripts utilitarios (`scripts/`) |
| `root` | Archivos de raíz (sin scope específico) |

### Formato de la descripción

- **En inglés** por convención del proyecto (código e identificadores en inglés)
- **Imperativo**: "add feature" no "added feature" ni "adds feature"
- **Sin punto final**
- **Máximo 72 caracteres** en la primera línea
- Si hay scope, separar con `:` y un espacio

### Ejemplos reales del proyecto

```bash
# Features (nueva funcionalidad)
feat(agent-core): Fase 5.2 — AgentOrchestrator consumes BuiltContext
feat(infrastructure): Fase 5.1 — harden OllamaProvider
feat(domain): add domain/code (Fase 6.1) — CodeSymbol, DependencyEdge, CodeIndex
feat(cli): agrega comando 'project get <id>'

# Docs (solo documentación)
docs: Fase 6 - causa raíz definitiva confirmada
docs: actualizar roadmap-maestro §2/§3/§6/§7 al estado real post-5.14

# Fix (corrección)
fix(execution): resolver hang en OpenCodeExecutionEngine.execute()

# Chore (mantenimiento)
chore: cargar .env en el CLI y sacar credenciales hardcodeadas
```

### Commits de fase (patrón del proyecto)

Los commits que documentan el progreso de una fase usan el prefijo del nombre de fase:

```
Fase 5.14: conectar el contexto real (Memory + Project Intelligence) al agente
Fase 6.3: primera PolicyRule de mutación (AllowScopedMutationRule)
```

Esto es un patrón válido del proyecto, equivalente a `feat` con documentación integrada.

## Manejo de Ramas

### Convención de nombres

```
<tipo>/<descripción-corta-en-kebab-case>
```

| Tipo | Ejemplo | Uso |
|------|---------|-----|
| `feature/` | `feature/fase7-autonomous-workflows` | Nueva funcionalidad |
| `fix/` | `fix/deadlock-permissions` | Corrección de bug |
| `docs/` | `docs/update-roadmap` | Solo documentación |
| `chore/` | `chore/cleanup-deps` | Mantenimiento |

**Reglas:**
- Todo en minúsculas
- Separador: `-` (kebab-case)
- Sin números de issue prefijados (el proyecto no usa issue tracker formal)
- Descriptivo pero conciso

### Flujo de trabajo

```
main ← feature/nombre-rama ← trabajo ← merge a main ← eliminar rama
```

#### 1. Crear rama desde `main`

```bash
git checkout main
git pull origin main
git checkout -b feature/nombre-descriptivo
```

#### 2. Trabajar y commitear

```bash
git add .
git commit -m "feat(scope): descripción clara"
```

Cada commit debe ser atómico: un cambio lógico por commit.

#### 3. Mantener la rama actualizada con `main`

```bash
git fetch origin
git rebase origin/main
# resolver conflictos si los hay
git rebase --continue
```

**No hacer merge de `main` en la feature rama** — usar rebase para mantener el historial lineal.

#### 4. Merge a `main`

```bash
git checkout main
git merge --no-ff feature/nombre-descriptivo -m "merge: feature/nombre-descriptivo"
git push origin main
```

Usar `--no-ff` para preservar el contexto de la rama en el historial.

#### 5. Eliminar rama local y remota

```bash
git branch -d feature/nombre-descriptivo
git push origin --delete feature/nombre-descriptivo
```

### Reglas de ramas

| Regla | Razón |
|-------|-------|
| **Nunca commitear directamente a `main`** | `main` es la fuente de verdad; todo pasa por rama |
| **Rebase, no merge** | Historial lineal, sin commits de merge innecesarios |
| **Eliminar ramas después del merge** | Evitar acumulación de ramas obsoletas |
| **No renombrar ramas ya pushadas** | Rompe la referencia para otros |
| **Una tarea = una rama** | Si una rama crece demasiado, splittear |

### Worktrees (opcional)

Para trabajar en múltiples ramas simultáneamente sin cambiar de rama:

```bash
# Crear worktree
git worktree add ../nombre-del-worktree feature/nombre-rama

# Trabajar en el worktree
cd ../nombre-del-worktree
# ... commits ...

# Volver al worktree principal
cd /ruta/al/proyecto/principal

# Eliminar worktree después de merge
git worktree remove ../nombre-del-worktree
git worktree prune  # limpiar referencias huérfanas
```

**Regla:** eliminar worktrees cuando la rama asociada se mergea o se descarta.

## Verificación antes de merge

Antes de mergear una rama a `main`:

```bash
# 1. Build debe pasar
pnpm build

# 2. Typecheck debe pasar
pnpm typecheck

# 3. Tests unitarios deben pasar
pnpm test

# 4. Lint limpio
pnpm lint
```

Si hay tests de integración/e2e, correrlos también:

```bash
pnpm test:integration
pnpm test:e2e
```

## Historial limpio

### Antes de merge, si hay commits sucios

```bash
# Reordenar los últimos N commits interactivamente
git rebase -i HEAD~N

# Squash commits relacionados
pick abc1234 feat: primera parte
squash def5678 feat: segunda parte
# → queda un solo commit
```

### Si se hizo merge accidental a main

No hacer `git reset --hard` en ramas ya pushadas. En su lugar:

```bash
# Crear nueva rama desde el estado correcto
git checkout main
git checkout -b fix/revert-merge
git revert -m 1 <merge-commit-hash>
git push origin fix/revert-merge
# Crear PR o merge normalmente
```

## Resumen rápido

```
Rama:    feature/nombre → commit → rebase → merge --no-ff → delete
Commit:  tipo(scope): descripción corta (imperativo, sin punto)
Build:   pnpm build → pnpm typecheck → pnpm test → pnpm lint
```
