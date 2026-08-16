import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GitCommitCollector, GitCommitCollectorError } from "@guerrero-dev/infrastructure";

const execFileAsync = promisify(execFile);

/**
 * `rm(dir, { recursive: true, force: true })` sin más falla con `EBUSY`
 * en Windows justo después de que un `execFile("git", ...)` corrido
 * dentro de ese directorio termina (visto corriendo esta misma suite en
 * Windows real, no en Linux): el proceso hijo ya salió, pero el SO
 * todavía no soltó el handle del directorio en ese instante. `maxRetries`
 * + `retryDelay` son las opciones nativas de `fs.rm` pensadas exactamente
 * para esta condición de carrera — no hace falta un retry manual.
 */
async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/**
 * Test de integración (Fase 4.8, Commit Collector): valida
 * `GitCommitCollector` contra Git real. Se salta si RUN_INTEGRATION_TESTS
 * no está en "true" (mismo patrón que el resto de tests/integration/).
 *
 * La mayoría de los casos usan el propio historial de este repositorio
 * como fixture (mismo criterio que `git-history-source.test.ts`, §14i:
 * "el propio repo es el fixture real, sin necesitar un repo separado") —
 * SHAs completas confirmadas con `git rev-parse`. La única excepción es
 * el caso de "commit sin cambios relevantes": un commit verdaderamente
 * vacío no existe en el historial real de `guerrero-dev`, así que ese
 * caso puntual usa un repositorio temporal desechable creado con
 * `git init` + `git commit --allow-empty`, no fixtures inventados en
 * código — sigue siendo Git real, no un mock.
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

// SHAs completas reales de este repositorio, confirmadas con `git rev-parse`.
const A2DD733 = "a2dd73335086cd1e8c8e06441cd7b109ae7ab9d0";
const BF7F9FB = "bf7f9fb6f073c11d7ca0a0d3910348a605ce558f";
const D113893 = "d11389358c3464b9880616e8fab989bf36cc97f3";
const NONEXISTENT_SHA = "0".repeat(40);

describe.skipIf(!RUN)("GitCommitCollector (integration, contra este mismo repositorio)", () => {
  let collector: GitCommitCollector;

  beforeAll(() => {
    collector = new GitCommitCollector(process.cwd());
  });

  it("recolecta un commit real con metadata, diff y changedFiles correctos", async () => {
    const snapshot = await collector.collect(A2DD733);

    expect(snapshot.sha).toBe(A2DD733);
    expect(snapshot.author).toBe("Santiago");
    expect(snapshot.message).toBe(
      "fix(cli): doctor - usar exec en vez de execFile+shell:true (evita DEP0190)",
    );
    expect(snapshot.timestamp.toISOString()).toBe(new Date("2026-08-14T23:09:36-05:00").toISOString());
    expect(snapshot.changedFiles).toEqual(["apps/cli/src/commands/doctor.ts"]);
    // El diff real de a2dd733 modifica exec/execFile en doctor.ts — no se
    // aserta el contenido completo (frágil), solo que el archivo tocado
    // aparece dentro del patch, confirmando que es el diff real y no un
    // string vacío o el header de commit-info sin filtrar.
    expect(snapshot.diff).toContain("doctor.ts");
    expect(snapshot.diff).toContain("@@");
  });

  it("recolecta correctamente un commit con múltiples archivos (bf7f9fb)", async () => {
    const snapshot = await collector.collect(BF7F9FB);

    expect(snapshot.sha).toBe(BF7F9FB);
    expect(snapshot.changedFiles.length).toBeGreaterThan(5);
    expect(snapshot.changedFiles).toContain("packages/domain/src/memory/index.ts");
    expect(snapshot.changedFiles).toContain("packages/application/src/common/ports/index.ts");
  });

  it("preserva caracteres especiales (unicode, §) en el mensaje sin corromperlos", async () => {
    const snapshot = await collector.collect(D113893);

    expect(snapshot.message).toContain("§14e-bis");
  });

  it("lanza commit_not_found para una sha bien formada pero inexistente", async () => {
    const error = await collector.collect(NONEXISTENT_SHA).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(GitCommitCollectorError);
    expect((error as GitCommitCollectorError).reason).toBe("commit_not_found");
  });

  it("lanza not_a_repository cuando repoRoot no es un repositorio Git", async () => {
    const nonRepoDir = await mkdtemp(join(tmpdir(), "guerrero-not-a-repo-"));
    try {
      const notARepoCollector = new GitCommitCollector(nonRepoDir);

      const error = await notARepoCollector.collect(A2DD733).catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(GitCommitCollectorError);
      expect((error as GitCommitCollectorError).reason).toBe("not_a_repository");
    } finally {
      await removeTempDir(nonRepoDir);
    }
  });

  describe("commit sin cambios relevantes (repositorio temporal desechable)", () => {
    let tempRepoDir: string;
    let emptyCommitSha: string;

    beforeAll(async () => {
      tempRepoDir = await mkdtemp(join(tmpdir(), "guerrero-empty-commit-"));
      await execFileAsync("git", ["init", "--quiet"], { cwd: tempRepoDir });
      await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: tempRepoDir });
      await execFileAsync("git", ["config", "user.name", "Test"], { cwd: tempRepoDir });
      await execFileAsync(
        "git",
        ["commit", "--quiet", "--allow-empty", "-m", "chore: commit vacío para test de integración"],
        { cwd: tempRepoDir },
      );
      const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempRepoDir });
      emptyCommitSha = stdout.trim();
    });

    afterAll(async () => {
      await removeTempDir(tempRepoDir);
    });

    it("devuelve diff vacío y changedFiles: [] para un commit --allow-empty real", async () => {
      const tempCollector = new GitCommitCollector(tempRepoDir);

      const snapshot = await tempCollector.collect(emptyCommitSha);

      expect(snapshot.sha).toBe(emptyCommitSha);
      expect(snapshot.message).toBe("chore: commit vacío para test de integración");
      expect(snapshot.changedFiles).toEqual([]);
      expect(snapshot.diff.trim()).toBe("");
    });
  });
});
