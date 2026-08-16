import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GitTrackedFilesSource, GitTrackedFilesSourceError } from "@guerrero-dev/infrastructure";

const execFileAsync = promisify(execFile);

/** Mismo motivo que `git-commit-collector.test.ts`: EBUSY real en Windows tras un execFile reciente. */
async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/**
 * Test de integración (Fase 5.2): valida `GitTrackedFilesSource` contra
 * Git real. Se salta si RUN_INTEGRATION_TESTS no está en "true" (mismo
 * patrón que el resto de tests/integration/).
 *
 * `guerrero-dev` (este mismo repositorio) es el fixture principal, mismo
 * criterio que `git-history-source.test.ts` y `git-commit-collector.test.ts`:
 * no se crea un fake de Git, `git ls-files -z` real es lo que se valida.
 * El único repositorio temporal ad-hoc es el de espacios/Unicode: ese caso
 * no existe de forma controlada en el historial real de este repo.
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

describe.skipIf(!RUN)("GitTrackedFilesSource (integration, contra este mismo repositorio)", () => {
  let source: GitTrackedFilesSource;

  beforeAll(() => {
    source = new GitTrackedFilesSource();
  });

  describe("contra guerrero-dev real", () => {
    it("incluye archivos reales y conocidos de este repo", async () => {
      // vitest corre desde la raíz del monorepo.
      const files = await source.listTrackedFiles(process.cwd());

      expect(files).toContain("package.json");
      expect(files).toContain("packages/domain/src/project/ProjectProfile.ts");
    });

    it("ninguna ruta devuelta es absoluta ni usa separador de Windows", async () => {
      const files = await source.listTrackedFiles(process.cwd());

      for (const file of files) {
        expect(file.startsWith("/")).toBe(false);
        expect(file.includes("\\")).toBe(false);
      }
    });

    it("no incluye node_modules/ ni dist/ (no están tracked, no por filtrado del adapter)", async () => {
      const files = await source.listTrackedFiles(process.cwd());

      expect(files.some((file) => file.startsWith("node_modules/"))).toBe(false);
      expect(files.some((file) => file.includes("/dist/"))).toBe(false);
    });
  });

  describe("repositorio sin .git", () => {
    it("lanza not_a_repository cuando el directorio no es un repositorio Git", async () => {
      const nonRepoDir = await mkdtemp(join(tmpdir(), "guerrero-not-a-repo-"));
      try {
        const error = await source.listTrackedFiles(nonRepoDir).catch((caught: unknown) => caught);

        expect(error).toBeInstanceOf(GitTrackedFilesSourceError);
        expect((error as GitTrackedFilesSourceError).reason).toBe("not_a_repository");
      } finally {
        await removeTempDir(nonRepoDir);
      }
    });
  });

  describe("rutas con espacios y Unicode (repositorio temporal desechable)", () => {
    let tempRepoDir: string;

    beforeAll(async () => {
      tempRepoDir = await mkdtemp(join(tmpdir(), "guerrero-unicode-paths-"));
      await execFileAsync("git", ["init", "--quiet"], { cwd: tempRepoDir });
      await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: tempRepoDir });
      await execFileAsync("git", ["config", "user.name", "Test"], { cwd: tempRepoDir });

      await mkdir(join(tempRepoDir, "apps", "my app", "src"), { recursive: true });
      await writeFile(join(tempRepoDir, "apps", "my app", "src", "index.ts"), "export {};\n");
      await mkdir(join(tempRepoDir, "packages", "área", "src"), { recursive: true });
      await writeFile(join(tempRepoDir, "packages", "área", "src", "index.ts"), "export {};\n");

      await execFileAsync("git", ["add", "."], { cwd: tempRepoDir });
      await execFileAsync("git", ["commit", "--quiet", "-m", "chore: fixture con espacios y unicode"], {
        cwd: tempRepoDir,
      });
    });

    afterAll(async () => {
      await removeTempDir(tempRepoDir);
    });

    it("devuelve rutas con espacios y Unicode sin corromperlas", async () => {
      const files = await source.listTrackedFiles(tempRepoDir);

      expect(files).toContain("apps/my app/src/index.ts");
      expect(files).toContain("packages/área/src/index.ts");
    });
  });
});
