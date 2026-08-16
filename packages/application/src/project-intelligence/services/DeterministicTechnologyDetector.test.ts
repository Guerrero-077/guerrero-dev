import { isValidTechnology } from "@guerrero-dev/domain";
import { describe, expect, it } from "vitest";
import type { PackageManifest } from "../models/PackageManifest.js";
import { DeterministicTechnologyDetector } from "./DeterministicTechnologyDetector.js";

const EMPTY_MANIFEST: PackageManifest = {
  dependencies: {},
  devDependencies: {},
  engines: {},
  packageManager: null,
};

/**
 * Espejo literal del `package.json` real de la raíz de este repositorio
 * (campos relevantes para las reglas de 5.4) — no un fixture inventado.
 * Sin `dependencies` (el manifiesto raíz real no declara ninguna).
 */
const ROOT_PACKAGE_JSON: PackageManifest = {
  dependencies: {},
  devDependencies: {
    "@guerrero-dev/api": "workspace:*",
    "@types/node": "^22.10.0",
    fastify: "^5.2.0",
    typescript: "^5.7.2",
    vitest: "^2.1.8",
  },
  engines: { node: ">=24.0.0" },
  packageManager: "pnpm@9.15.0",
};

/** Espejo literal del `package.json` real de `apps/api` — sin `engines` ni `packageManager` propios. */
const APPS_API_PACKAGE_JSON: PackageManifest = {
  dependencies: {
    "@guerrero-dev/application": "workspace:*",
    fastify: "^5.2.0",
    "fastify-plugin": "^5.0.1",
  },
  devDependencies: {
    typescript: "^5.7.2",
    tsx: "^4.19.2",
  },
  engines: {},
  packageManager: null,
};

describe("DeterministicTechnologyDetector", () => {
  const detector = new DeterministicTechnologyDetector();

  describe("detectFromPackageManifest", () => {
    it("manifiesto vacío no produce ninguna tecnología", () => {
      expect(detector.detectFromPackageManifest("package.json", EMPTY_MANIFEST)).toEqual([]);
    });

    it("detecta exactamente lo real del package.json raíz: TypeScript, Node.js, pnpm y Fastify (los 4 en devDependencies/engines/packageManager)", () => {
      const result = detector.detectFromPackageManifest("package.json", ROOT_PACKAGE_JSON);

      expect(result).toEqual([
        {
          name: "TypeScript",
          category: "language",
          sourceFile: "package.json",
          evidence: "devDependencies.typescript",
        },
        { name: "Node.js", category: "runtime", sourceFile: "package.json", evidence: "engines.node" },
        { name: "pnpm", category: "package_manager", sourceFile: "package.json", evidence: "packageManager" },
        {
          name: "Fastify",
          category: "framework",
          sourceFile: "package.json",
          evidence: "devDependencies.fastify",
        },
      ]);
    });

    it("detecta exactamente lo real de apps/api/package.json: TypeScript y Fastify en dependencies, sin Node.js ni pnpm", () => {
      const result = detector.detectFromPackageManifest("apps/api/package.json", APPS_API_PACKAGE_JSON);

      expect(result).toEqual([
        {
          name: "TypeScript",
          category: "language",
          sourceFile: "apps/api/package.json",
          evidence: "devDependencies.typescript",
        },
        {
          name: "Fastify",
          category: "framework",
          sourceFile: "apps/api/package.json",
          evidence: "dependencies.fastify",
        },
      ]);
    });

    it("fastify declarado en dependencies Y devDependencies a la vez produce dos entradas, sin deduplicar", () => {
      const manifest: PackageManifest = {
        ...EMPTY_MANIFEST,
        dependencies: { fastify: "^5.2.0" },
        devDependencies: { fastify: "^4.0.0" },
      };

      const result = detector.detectFromPackageManifest("package.json", manifest);

      expect(result).toEqual([
        {
          name: "Fastify",
          category: "framework",
          sourceFile: "package.json",
          evidence: "dependencies.fastify",
        },
        {
          name: "Fastify",
          category: "framework",
          sourceFile: "package.json",
          evidence: "devDependencies.fastify",
        },
      ]);
    });

    it("packageManager que no empieza con pnpm@ no detecta pnpm", () => {
      const manifest: PackageManifest = { ...EMPTY_MANIFEST, packageManager: "npm@10.0.0" };

      expect(detector.detectFromPackageManifest("package.json", manifest)).toEqual([]);
    });

    it("no valida semver de packageManager ni de engines.node — el valor declarado es evidencia suficiente tal cual", () => {
      const manifest: PackageManifest = {
        ...EMPTY_MANIFEST,
        packageManager: "pnpm@not-a-real-version",
        engines: { node: "esto-no-es-un-rango-semver" },
      };

      const result = detector.detectFromPackageManifest("package.json", manifest);

      expect(result).toEqual([
        { name: "Node.js", category: "runtime", sourceFile: "package.json", evidence: "engines.node" },
        { name: "pnpm", category: "package_manager", sourceFile: "package.json", evidence: "packageManager" },
      ]);
    });

    it("toda Technology emitida cumple isValidTechnology (dominio, 5.1)", () => {
      const result = [
        ...detector.detectFromPackageManifest("package.json", ROOT_PACKAGE_JSON),
        ...detector.detectFromPackageManifest("apps/api/package.json", APPS_API_PACKAGE_JSON),
      ];

      expect(result.length).toBeGreaterThan(0);
      for (const technology of result) {
        expect(isValidTechnology(technology)).toBe(true);
      }
    });
  });

  describe("detectFromTrackedFiles", () => {
    it("detecta pnpm por existencia de pnpm-workspace.yaml", () => {
      const result = detector.detectFromTrackedFiles([
        "package.json",
        "pnpm-workspace.yaml",
        "pnpm-lock.yaml",
      ]);

      expect(result).toEqual([
        {
          name: "pnpm",
          category: "package_manager",
          sourceFile: "pnpm-workspace.yaml",
          evidence: "file exists",
        },
      ]);
    });

    it("sin pnpm-workspace.yaml en la lista, no detecta nada", () => {
      expect(detector.detectFromTrackedFiles(["package.json", "README.md"])).toEqual([]);
    });

    it("lista vacía no detecta nada", () => {
      expect(detector.detectFromTrackedFiles([])).toEqual([]);
    });
  });
});
