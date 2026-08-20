# Contributing a Guerrero Dev

Guía de convenciones para ramas, commits y flujo de trabajo.

## Convencional Commits

Todo commit debe seguir [Conventional Commits v1.0.0](https://www.conventionalcommits.org/):

```
<tipo>(<scope>): <descripción corta>
```

### Tipos permitidos

| Tipo | Uso | Ejemplo |
|------|-----|---------|
| `feat` | Nueva funcionalidad | `feat(agent-core): Fase 5.2 — AgentOrchestrator consumes BuiltContext` |
| `fix` | Corrección de bug | `fix(execution): resolver hang en OpenCodeExecutionEngine` |
| `docs` | Solo documentación | `docs: actualizar roadmap-maestro §2/§3` |
| `refactor` | Reestructurar sin cambiar comportamiento | `refactor(infrastructure): extraer OllamaProviderError` |
| `test` | Agregar o modificar tests | `test(agent-core): AllowScopedMutationRule — 21 casos` |
| `chore` | Tareas de mantenimiento | `chore: cargar .env en el CLI` |
| `perf` | Mejora de rendimiento | `perf(infrastructure): optimizar extractSymbols` |
| `ci` | Cambios en CI/CD | `ci: agregar step de typecheck` |
| `build` | Sistema de build o dependencias | `build: actualizar pnpm-lock.yaml` |
| `revert` | Revertir un commit | `revert: feat(agent-core): Fase 5.2` |

### Scopes del proyecto

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
| `docs` | Documentación general (`docs/`) |
| `scripts` | Scripts utilitarios (`scripts/`) |

### Reglas de commits

- **En inglés** por convención del proyecto (código e identificadores en inglés)
- **Imperativo**: "add feature" no "added feature" ni "adds feature"
- **Sin punto final**
- **Máximo 72 caracteres** en la primera línea
- **Un commit = un cambio lógico** (atómico)
- Si hay scope, separar con `:` y un espacio

### Ejemplos reales del proyecto

```bash
# Features
feat(agent-core): Fase 5.2 — AgentOrchestrator consumes BuiltContext
feat(infrastructure): Fase 5.1 — harden OllamaProvider
feat(domain): add domain/code (Fase 6.1) — CodeSymbol, DependencyEdge, CodeIndex
feat(cli): agrega comando 'project get <id>'

# Docs
docs: Fase 6 - causa raíz definitiva confirmada
docs: actualizar roadmap-maestro §2/§3/§6/§7 al estado real post-5.14

# Fix
fix(execution): resolver hang en OpenCodeExecutionEngine.execute()

# Chore
chore: cargar .env en el CLI y sacar credenciales hardcodeadas
```

---

## Flujo de Ramas

### Estructura

```
main          ← producción (protegida)
  ↑
staging       ← pre-producción (protegida)
  ↑
qa            ← testing (protegida)
  ↑
develop       ← integración (protegida)
  ↑
feature/*     ← trabajo individual
fix/*         ← correcciones urgentes
```

### Reglas generales

| Regla | Razón |
|-------|-------|
| **Nunca commitear directamente a `main`/`staging`/`qa`/`develop`** | Todo pasa por PR y CI |
| **Rebase, no merge** | Historial lineal entre ramas de integración |
| **Eliminar ramas después del merge** | Evitar acumulación |
| **Usar `git switch` en lugar de `git checkout`** | Comando moderno, propósito único |
| **Usar `--force-with-lease` en lugar de `--force`** | Seguro para rebase en ramas protegidas |

### Comandos modernos de git

| Antes (obsoleto) | Ahora (correcto) | Uso |
|---|---|---|
| `git checkout main` | `git switch main` | Cambiar de rama |
| `git checkout -b feature/x` | `git switch -c feature/x` | Crear rama nueva |
| `git checkout -- file` | `git restore file` | Descartar cambios |
| `git checkout .` | `git restore .` | Descartar todos los cambios |

---

### Flujo 1: Feature → develop (squash + merge)

```bash
# 1. Crear rama desde develop
git switch develop
git pull origin develop
git switch -c feature/nombre-descriptivo

# 2. Trabajar y commitear
git add .
git commit -m "feat(scope): descripción"

# 3. Push y PR
git push origin feature/nombre-descriptivo
# Abrir PR en GitHub: feature/nombre → develop

# 4. CI verifica: build + typecheck + lint
# 5. Review aprobado → Squash + merge en GitHub
# 6. Eliminar rama
git switch develop
git branch -d feature/nombre-descriptivo
git push origin --delete feature/nombre-descriptivo
```

### Flujo 2: develop → qa (rebase lineal)

```bash
# 1. Actualizar develop
git switch develop
git pull origin develop

# 2. Rebase qa sobre develop
git switch qa
git pull origin qa
git rebase develop

# 3. Resolver conflictos si los hay
# git rebase --continue  (para continuar)
# git rebase --abort     (para cancelar)

# 4. Push con force-with-lease
git push origin qa --force-with-lease

# 5. CI verifica: build + typecheck + integration tests
# 6. QA manual: probar funcionalidad
```

### Flujo 3: qa → staging (rebase lineal)

```bash
# 1. Actualizar qa
git switch qa
git pull origin qa

# 2. Rebase staging sobre qa
git switch staging
git pull origin staging
git rebase qa

# 3. Push con force-with-lease
git push origin staging --force-with-lease

# 4. CI verifica: build + typecheck + test + lint
# 5. Smoke tests contra staging
```

### Flujo 4: staging → main (rebase lineal)

```bash
# 1. Actualizar staging
git switch staging
git pull origin staging

# 2. Rebase main sobre staging
git switch main
git pull origin main
git rebase staging

# 3. Push con force-with-lease
git push origin main --force-with-lease

# 4. Deploy automático a producción
```

### Flujo 5: Fix urgente (hotfix)

```bash
# 1. Crear rama desde main
git switch main
git pull origin main
git switch -c fix/nombre-del-fix

# 2. Aplicar fix
git add .
git commit -m "fix(scope): descripción del fix"

# 3. Push y PR
git push origin fix/nombre-del-fix
# Abrir PR: fix/nombre → main

# 4. Después del merge, propagar a staging y develop
git switch staging
git pull origin staging
git rebase main
git push origin staging --force-with-lease

git switch develop
git pull origin develop
git rebase staging
git push origin develop --force-with-lease
```

---

## Branch Protection Rules (GitHub)

Configurar en **Settings → Branches → Add rule**:

### `main`

| Setting | Valor |
|---------|-------|
| Require pull request | ✅ |
| Required approvals | 1 |
| Dismiss stale reviews | ✅ |
| Require status checks | ✅ |
| Required checks | `ci`, `integration` |
| Require branches up to date | ✅ |
| Require conversation resolution | ✅ |
| No force pushes | ✅ |
| No deletions | ✅ |
| Require linear history | ✅ |

### `staging`

| Setting | Valor |
|---------|-------|
| Require pull request | ✅ |
| Required approvals | 1 |
| Require status checks | ✅ |
| Required checks | `ci`, `integration` |
| No force pushes | ✅ |
| Require linear history | ✅ |

### `qa`

| Setting | Valor |
|---------|-------|
| Require pull request | ✅ |
| Required approvals | 1 |
| Require status checks | ✅ |
| Required checks | `ci` |
| No force pushes | ✅ |
| Require linear history | ✅ |

### `develop`

| Setting | Valor |
|---------|-------|
| Require status checks | ✅ |
| Required checks | `ci` |
| No force pushes | ✅ |

---

## Worktrees (opcional)

Para trabajar en múltiples ramas simultáneamente:

```bash
# Crear worktree
git worktree add ../nombre-del-worktree feature/nombre-rama

# Trabajar
cd ../nombre-del-worktree
# ... commits ...

# Volver al worktree principal
cd /ruta/al/proyecto/principal

# Eliminar después de merge
git worktree remove ../nombre-del-worktree
git worktree prune
```

**Regla:** eliminar worktrees cuando la rama se mergea o se descarta.

---

## Verificación antes de merge

```bash
# Build debe pasar
pnpm build

# Typecheck debe pasar
pnpm typecheck

# Tests unitarios deben pasar
pnpm test

# Lint limpio
pnpm lint

# Integration tests (para qa/staging/main)
pnpm test:integration
```

---

## Historial limpio

### Squash commits antes de merge

```bash
# Reordenar los últimos N commits interactivamente
git rebase -i HEAD~N

# Squash commits relacionados
pick abc1234 feat: primera parte
squash def5678 feat: segunda parte
# → queda un solo commit
```

### Revert de merge accidental

No hacer `git reset --hard` en ramas ya pushadas:

```bash
git switch main
git switch -c fix/revert-merge
git revert -m 1 <merge-commit-hash>
git push origin fix/revert-merge
# Crear PR o merge normalmente
```

---

## Resumen rápido

```
Rama:       feature/* → PR → squash → develop
Integración: develop → qa → staging → main (rebase lineal)
Commit:     tipo(scope): descripción (imperativo, sin punto, <72 chars)
Build:      pnpm build → pnpm typecheck → pnpm test → pnpm lint
Comandos:   git switch (no checkout), git restore (no checkout --)
Push:       --force-with-lease (nunca --force)
```
