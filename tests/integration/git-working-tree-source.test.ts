import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GitWorkingTreeSource, GitWorkingTreeSourceError } from "@guerrero-dev/infrastructure";

const execFileAsync = promisify(execFile);

/** Mismo motivo que `git-tracked-files-source.test.ts`: EBUSY real en Windows tras un execFile reciente. */
async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/**
 * Test de integración: valida `GitWorkingTreeSource` contra Git real. Se
 * salta si RUN_INTEGRATION_TESTS no está en "true" (mismo patrón que el
 * resto de tests/integration/).
 *
 * Repositorio temporal desechable, no `guerrero-dev` real: a diferencia de
 * `GitTrackedFilesSource`/`GitHistorySource` (que solo leen historial ya
 * comiteado, estable), este puerto observa el estado *actual* del working
 * tree — correr contra el repo real de esta sesión sería no determinístico
 * (depende de qué archivos estén sucios en el momento del test).
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

describe.skipIf(!RUN)("GitWorkingTreeSource (integration, repositorio temporal real)", () => {
  let source: GitWorkingTreeSource;
  let repoDir: string;

  beforeAll(async () => {
    source = new GitWorkingTreeSource();
    repoDir = await mkdtemp(join(tmpdir(), "guerrero-working-tree-"));

    await execFileAsync("git", ["init", "--quiet"], { cwd: repoDir });
    await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: repoDir });
    await execFileAsync("git", ["config", "user.name", "Test"], { cwd: repoDir });

    await writeFile(join(repoDir, "committed.txt"), "línea original\n");
    await execFileAsync("git", ["add", "."], { cwd: repoDir });
    await execFileAsync("git", ["commit", "--quiet", "-m", "chore: commit inicial"], { cwd: repoDir });
  });

  afterAll(async () => {
    await removeTempDir(repoDir);
  });

  describe("getStatus", () => {
    it("working tree limpio: lista vacía", async () => {
      expect(await source.getStatus(repoDir)).toEqual([]);
    });

    it("refleja un archivo modificado y uno nuevo sin trackear", async () => {
      await writeFile(join(repoDir, "committed.txt"), "línea modificada\n");
      await writeFile(join(repoDir, "nuevo.txt"), "contenido nuevo\n");

      try {
        const entries = await source.getStatus(repoDir);

        expect(entries).toContainEqual({ statusCode: " M", path: "committed.txt" });
        expect(entries).toContainEqual({ statusCode: "??", path: "nuevo.txt" });
      } finally {
        await execFileAsync("git", ["checkout", "--", "committed.txt"], { cwd: repoDir });
        await rm(join(repoDir, "nuevo.txt"), { force: true });
      }
    });

    it("lanza not_a_repository en un directorio sin .git", async () => {
      const nonRepoDir = await mkdtemp(join(tmpdir(), "guerrero-not-a-repo-"));
      try {
        const error = await source.getStatus(nonRepoDir).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(GitWorkingTreeSourceError);
        expect((error as GitWorkingTreeSourceError).reason).toBe("not_a_repository");
      } finally {
        await removeTempDir(nonRepoDir);
      }
    });
  });

  describe("getDiff", () => {
    it("sin cambios: diff vacío", async () => {
      expect(await source.getDiff(repoDir)).toBe("");
    });

    it("con un cambio real, el diff incluye el contenido modificado", async () => {
      await writeFile(join(repoDir, "committed.txt"), "línea modificada\n");

      try {
        const diff = await source.getDiff(repoDir);

        expect(diff).toContain("committed.txt");
        expect(diff).toContain("-línea original");
        expect(diff).toContain("+línea modificada");
      } finally {
        await execFileAsync("git", ["checkout", "--", "committed.txt"], { cwd: repoDir });
      }
    });

    it("con filePath, acota el diff a ese único archivo", async () => {
      await writeFile(join(repoDir, "committed.txt"), "línea modificada\n");
      await writeFile(join(repoDir, "otro-trackeado.txt"), "otro contenido\n");
      await execFileAsync("git", ["add", "otro-trackeado.txt"], { cwd: repoDir });

      try {
        const diff = await source.getDiff(repoDir, "committed.txt");

        expect(diff).toContain("committed.txt");
        expect(diff).not.toContain("otro-trackeado.txt");
      } finally {
        await execFileAsync("git", ["checkout", "--", "committed.txt"], { cwd: repoDir });
        await execFileAsync("git", ["reset", "--", "otro-trackeado.txt"], { cwd: repoDir });
        await rm(join(repoDir, "otro-trackeado.txt"), { force: true });
      }
    });
  });

  describe("getRecentLog", () => {
    it("devuelve el commit real del fixture", async () => {
      const entries = await source.getRecentLog(repoDir, 10);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.subject).toBe("chore: commit inicial");
      expect(entries[0]?.hash).toMatch(/^[0-9a-f]{40}$/);
    });

    it("limit acota la cantidad de commits devueltos", async () => {
      await writeFile(join(repoDir, "segundo.txt"), "contenido\n");
      await execFileAsync("git", ["add", "."], { cwd: repoDir });
      await execFileAsync("git", ["commit", "--quiet", "-m", "feat: segundo commit"], { cwd: repoDir });

      const entries = await source.getRecentLog(repoDir, 1);

      expect(entries).toHaveLength(1);
      expect(entries[0]?.subject).toBe("feat: segundo commit");
    });
  });
});
