import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { FileReader } from "./FileReader.js";
import { FileReaderError } from "./FileReaderError.js";

/** Mismo motivo que en los tests de Git: EBUSY real en Windows tras I/O reciente sobre el directorio. */
async function removeTempDir(dir: string): Promise<void> {
  await rm(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}

/**
 * Prueba, en el propio entorno donde corre la suite, si `chmod 000`
 * realmente impide leer un archivo. Corriendo como root (frecuente en
 * sandboxes), el kernel ignora los permisos de archivo y la lectura igual
 * tiene éxito — en ese caso el test de `access_denied` se salta con una
 * razón explícita, en vez de fingir cobertura que el entorno no permite
 * ejercer. Se calcula una sola vez, de forma síncrona, para poder usarse
 * con `it.skipIf` en tiempo de colección.
 */
function canEnforceFilePermissions(): boolean {
  const probeDir = mkdtempSync(join(tmpdir(), "guerrero-filereader-probe-"));
  try {
    const probeFile = join(probeDir, "secret.txt");
    writeFileSync(probeFile, "x");
    chmodSync(probeFile, 0o000);
    try {
      readFileSync(probeFile);
      return false;
    } catch {
      return true;
    }
  } finally {
    chmodSync(probeDir, 0o755);
    rmSync(probeDir, { recursive: true, force: true });
  }
}

const CAN_ENFORCE_PERMISSIONS = canEnforceFilePermissions();

describe("FileReader", () => {
  let repoRoot: string;
  let reader: FileReader;

  beforeAll(async () => {
    repoRoot = await mkdtemp(join(tmpdir(), "guerrero-filereader-"));
    reader = new FileReader();

    await writeFile(join(repoRoot, "package.json"), '{"name":"fixture"}\n', "utf8");
    await writeFile(join(repoRoot, "con espacios.txt"), "contenido con espacios en el nombre\n", "utf8");
    await writeFile(join(repoRoot, "unicode.txt"), "café, señal, área, 日本語\n", "utf8");
    await mkdir(join(repoRoot, "src"), { recursive: true });
    await writeFile(join(repoRoot, "src", "index.ts"), "export {};\n", "utf8");
  });

  afterAll(async () => {
    await removeTempDir(repoRoot);
  });

  it("lee el contenido real de un archivo normal", async () => {
    const content = await reader.readFile(repoRoot, "package.json");

    expect(content).toBe('{"name":"fixture"}\n');
  });

  it("lee un archivo anidado bajo un subdirectorio", async () => {
    const content = await reader.readFile(repoRoot, "src/index.ts");

    expect(content).toBe("export {};\n");
  });

  it("preserva contenido Unicode sin corromperlo", async () => {
    const content = await reader.readFile(repoRoot, "unicode.txt");

    expect(content).toBe("café, señal, área, 日本語\n");
  });

  it("lee un archivo cuyo path tiene espacios", async () => {
    const content = await reader.readFile(repoRoot, "con espacios.txt");

    expect(content).toBe("contenido con espacios en el nombre\n");
  });

  it("lanza not_found para un archivo inexistente", async () => {
    const error = await reader.readFile(repoRoot, "no-existe.json").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FileReaderError);
    expect((error as FileReaderError).reason).toBe("not_found");
  });

  it("lanza invalid_path ante un intento de escape con ../ ", async () => {
    const error = await reader.readFile(repoRoot, "../outside.txt").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FileReaderError);
    expect((error as FileReaderError).reason).toBe("invalid_path");
  });

  it("lanza invalid_path ante un intento de escape con .. en un segmento interno", async () => {
    const error = await reader.readFile(repoRoot, "src/../../outside.txt").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FileReaderError);
    expect((error as FileReaderError).reason).toBe("invalid_path");
  });

  it("lanza invalid_path ante una ruta absoluta", async () => {
    const error = await reader.readFile(repoRoot, "/etc/passwd").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FileReaderError);
    expect((error as FileReaderError).reason).toBe("invalid_path");
  });

  it("lanza invalid_path ante un separador de Windows", async () => {
    const error = await reader.readFile(repoRoot, "src\\index.ts").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FileReaderError);
    expect((error as FileReaderError).reason).toBe("invalid_path");
  });

  it("lanza is_a_directory cuando relativePath apunta a un directorio", async () => {
    const error = await reader.readFile(repoRoot, "src").catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(FileReaderError);
    expect((error as FileReaderError).reason).toBe("is_a_directory");
  });

  describe("EACCES", () => {
    let restrictedFile: string;

    beforeAll(async () => {
      restrictedFile = join(repoRoot, "restricted.txt");
      await writeFile(restrictedFile, "no deberías poder leer esto\n", "utf8");
      await chmod(restrictedFile, 0o000);
    });

    afterAll(async () => {
      await chmod(restrictedFile, 0o644);
    });

    it.skipIf(!CAN_ENFORCE_PERMISSIONS)("lanza access_denied cuando el archivo no es legible", async () => {
      const error = await reader.readFile(repoRoot, "restricted.txt").catch((caught: unknown) => caught);

      expect(error).toBeInstanceOf(FileReaderError);
      expect((error as FileReaderError).reason).toBe("access_denied");
    });
  });
});
