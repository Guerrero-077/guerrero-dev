import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileReader } from "../filesystem/FileReader.js";
import { FileReaderError } from "../filesystem/FileReaderError.js";
import { ManifestReaderError } from "./ManifestReaderError.js";
import { PackageManifestReader } from "./PackageManifestReader.js";

async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

describe("PackageManifestReader", () => {
  const reader = new PackageManifestReader(new FileReader());

  describe("contra el package.json real de este repositorio (dogfooding)", () => {
    it("lee y parsea el manifiesto raíz real", async () => {
      const manifest = await reader.readPackageManifest(process.cwd(), "package.json");

      expect(manifest.packageManager).toBe("pnpm@9.15.0");
      expect(manifest.engines["node"]).toBe(">=24.0.0");
      expect(manifest.devDependencies["typescript"]).toBeDefined();
    });
  });

  describe("errores", () => {
    let tempDir: string;

    beforeAll(async () => {
      tempDir = await mkdtemp(join(tmpdir(), "guerrero-manifest-reader-"));
      await writeFile(join(tempDir, "corrupto.json"), "{ esto no es json", "utf8");
    });

    afterAll(async () => {
      await removeTempDir(tempDir);
    });

    it("propaga FileReaderError intacto cuando el archivo no existe (no lo reenvuelve)", async () => {
      const error = await reader
        .readPackageManifest(tempDir, "no-existe.json")
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(FileReaderError);
      expect((error as FileReaderError).reason).toBe("not_found");
    });

    it("lanza ManifestReaderError cuando el archivo existe pero no es JSON válido", async () => {
      const error = await reader
        .readPackageManifest(tempDir, "corrupto.json")
        .catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(ManifestReaderError);
      expect((error as ManifestReaderError).reason).toBe("invalid_manifest");
    });
  });
});
