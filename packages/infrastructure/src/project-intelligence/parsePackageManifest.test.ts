import { describe, expect, it } from "vitest";
import { ManifestReaderError } from "./ManifestReaderError.js";
import { parsePackageManifest } from "./parsePackageManifest.js";

describe("parsePackageManifest", () => {
  it("parsea un manifiesto completo con todos los campos relevantes", () => {
    const raw = JSON.stringify({
      name: "fixture",
      dependencies: { fastify: "^5.2.0" },
      devDependencies: { typescript: "^5.7.2" },
      engines: { node: ">=24.0.0" },
      packageManager: "pnpm@9.15.0",
    });

    expect(parsePackageManifest(raw)).toEqual({
      dependencies: { fastify: "^5.2.0" },
      devDependencies: { typescript: "^5.7.2" },
      engines: { node: ">=24.0.0" },
      packageManager: "pnpm@9.15.0",
    });
  });

  it("campos ausentes producen defaults ({} / null), no un error", () => {
    expect(parsePackageManifest(JSON.stringify({ name: "fixture" }))).toEqual({
      dependencies: {},
      devDependencies: {},
      engines: {},
      packageManager: null,
    });
  });

  it("lanza invalid_manifest ante JSON no parseable", () => {
    expect(() => parsePackageManifest("{ esto no es json")).toThrow(ManifestReaderError);
    try {
      parsePackageManifest("{ esto no es json");
      expect.unreachable();
    } catch (error) {
      expect((error as ManifestReaderError).reason).toBe("invalid_manifest");
    }
  });

  it.each([
    ["[]", "un array"],
    ['"solo un string"', "un string"],
    ["42", "un número"],
    ["null", "null"],
  ])("lanza invalid_manifest cuando el nivel superior es %s (%s)", (raw) => {
    expect(() => parsePackageManifest(raw)).toThrow(ManifestReaderError);
  });

  it("lanza invalid_manifest cuando dependencies no es un objeto de string a string (array)", () => {
    const raw = JSON.stringify({ dependencies: ["fastify"] });

    expect(() => parsePackageManifest(raw)).toThrow(ManifestReaderError);
  });

  it("lanza invalid_manifest cuando devDependencies tiene un valor no-string", () => {
    const raw = JSON.stringify({ devDependencies: { typescript: 5 } });

    expect(() => parsePackageManifest(raw)).toThrow(ManifestReaderError);
  });

  it("lanza invalid_manifest cuando engines no es un objeto", () => {
    const raw = JSON.stringify({ engines: "node>=24" });

    expect(() => parsePackageManifest(raw)).toThrow(ManifestReaderError);
  });

  it("lanza invalid_manifest cuando packageManager no es un string", () => {
    const raw = JSON.stringify({ packageManager: 9.15 });

    expect(() => parsePackageManifest(raw)).toThrow(ManifestReaderError);
  });
});
