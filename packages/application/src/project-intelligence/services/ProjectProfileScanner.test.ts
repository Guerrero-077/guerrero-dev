import { randomUUID } from "node:crypto";
import type { ProjectComponent, ProjectProfile, Technology } from "@guerrero-dev/domain";
import { describe, expect, it } from "vitest";
import type { IGitTrackedFilesSource } from "../../common/ports/IGitTrackedFilesSource.js";
import type { IProjectIntelligenceRepository } from "../../common/ports/IProjectIntelligenceRepository.js";
import type { PackageManifest } from "../models/PackageManifest.js";
import type { IComponentStructureDetector } from "../ports/IComponentStructureDetector.js";
import type { IPackageManifestReader } from "../ports/IPackageManifestReader.js";
import type { ITechnologyDetector } from "../ports/ITechnologyDetector.js";
import { ProjectProfileScanner } from "./ProjectProfileScanner.js";

/**
 * Dobles de test deliberadamente "tontos" — devuelven exactamente lo
 * configurado, sin ninguna heurística propia, mismo criterio que
 * `CandidateDetectionService.test.ts`. Cada uno registra sus llamadas para
 * verificar orden y argumentos, no solo el resultado final.
 *
 * Los errores usados en los tests de fallo son instancias de `Error`
 * simples, no los tipos reales de `infrastructure` (`GitTrackedFilesSourceError`/
 * `FileReaderError`/`ManifestReaderError`): este test vive en `application`,
 * que nunca depende de `infrastructure` — lo que importa aquí es que
 * `ProjectProfileScanner` propaga cualquier error que sus puertos lancen,
 * sin envolverlo, sea cual sea su tipo concreto.
 */

const EMPTY_MANIFEST: PackageManifest = {
  dependencies: {},
  devDependencies: {},
  engines: {},
  packageManager: null,
};

function fakeGitTrackedFilesSource(result: readonly string[] | Error): {
  source: IGitTrackedFilesSource;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    source: {
      async listTrackedFiles(repoRoot) {
        calls.push(repoRoot);
        if (result instanceof Error) throw result;
        return result;
      },
    },
    calls,
  };
}

function fakeComponentStructureDetector(
  structure: readonly string[],
  components: readonly ProjectComponent[],
): { detector: IComponentStructureDetector } {
  return {
    detector: {
      detectStructure: () => structure,
      detectComponents: () => components,
    },
  };
}

function fakePackageManifestReader(manifestsByPath: Readonly<Record<string, PackageManifest | Error>>): {
  reader: IPackageManifestReader;
  calls: string[];
} {
  const calls: string[] = [];
  return {
    reader: {
      async readPackageManifest(_repoRoot, relativePath) {
        calls.push(relativePath);
        const result = manifestsByPath[relativePath];
        if (result === undefined) {
          throw new Error(`fixture sin manifiesto configurado para "${relativePath}"`);
        }
        if (result instanceof Error) throw result;
        return result;
      },
    },
    calls,
  };
}

function fakeTechnologyDetector(
  fromTrackedFiles: readonly Technology[],
  fromManifestByPath: Readonly<Record<string, readonly Technology[]>>,
): { detector: ITechnologyDetector } {
  return {
    detector: {
      detectFromTrackedFiles: () => fromTrackedFiles,
      detectFromPackageManifest: (sourceFile) => fromManifestByPath[sourceFile] ?? [],
    },
  };
}

function fakeRepository(upsertResult: (profile: ProjectProfile) => ProjectProfile): {
  repository: IProjectIntelligenceRepository;
  upsertCalls: ProjectProfile[];
} {
  const upsertCalls: ProjectProfile[] = [];
  return {
    repository: {
      async upsert(profile) {
        upsertCalls.push(profile);
        return upsertResult(profile);
      },
      async findByProjectId() {
        throw new Error("no usado en estos tests");
      },
    },
    upsertCalls,
  };
}

const PROJECT_ID = randomUUID();
const REPO_ROOT = "/tmp/fixture-repo";

describe("ProjectProfileScanner", () => {
  it("camino feliz: lee el manifiesto raíz y uno por cada componente, en orden", async () => {
    const { source } = fakeGitTrackedFilesSource([
      "package.json",
      "apps/api/package.json",
      "packages/domain/package.json",
    ]);
    const components: ProjectComponent[] = [
      { name: "api", path: "apps/api", type: "app" },
      { name: "domain", path: "packages/domain", type: "package" },
    ];
    const { detector: structureDetector } = fakeComponentStructureDetector(["apps", "packages"], components);
    const { reader, calls: manifestCalls } = fakePackageManifestReader({
      "package.json": EMPTY_MANIFEST,
      "apps/api/package.json": EMPTY_MANIFEST,
      "packages/domain/package.json": EMPTY_MANIFEST,
    });
    const { detector: techDetector } = fakeTechnologyDetector([], {});
    const { repository } = fakeRepository((profile) => profile);

    const scanner = new ProjectProfileScanner(source, structureDetector, reader, techDetector, repository);
    await scanner.scanProject(PROJECT_ID, REPO_ROOT);

    expect(manifestCalls).toEqual(["package.json", "apps/api/package.json", "packages/domain/package.json"]);
  });

  it("sin componentes detectados, solo se lee el manifiesto raíz", async () => {
    const { source } = fakeGitTrackedFilesSource(["package.json"]);
    const { detector: structureDetector } = fakeComponentStructureDetector([], []);
    const { reader, calls: manifestCalls } = fakePackageManifestReader({ "package.json": EMPTY_MANIFEST });
    const { detector: techDetector } = fakeTechnologyDetector([], {});
    const { repository } = fakeRepository((profile) => profile);

    const scanner = new ProjectProfileScanner(source, structureDetector, reader, techDetector, repository);
    await scanner.scanProject(PROJECT_ID, REPO_ROOT);

    expect(manifestCalls).toEqual(["package.json"]);
  });

  it("technologies concatena detectFromTrackedFiles + detectFromPackageManifest por cada manifiesto, sin deduplicar", async () => {
    const { source } = fakeGitTrackedFilesSource(["package.json", "apps/api/package.json"]);
    const components: ProjectComponent[] = [{ name: "api", path: "apps/api", type: "app" }];
    const { detector: structureDetector } = fakeComponentStructureDetector([], components);
    const { reader } = fakePackageManifestReader({
      "package.json": EMPTY_MANIFEST,
      "apps/api/package.json": EMPTY_MANIFEST,
    });

    const workspaceTech: Technology = {
      name: "pnpm",
      category: "package_manager",
      sourceFile: "pnpm-workspace.yaml",
      evidence: "file exists",
    };
    const rootTech: Technology = {
      name: "TypeScript",
      category: "language",
      sourceFile: "package.json",
      evidence: "devDependencies.typescript",
    };
    const apiTech: Technology = {
      name: "Fastify",
      category: "framework",
      sourceFile: "apps/api/package.json",
      evidence: "dependencies.fastify",
    };
    const { detector: techDetector } = fakeTechnologyDetector([workspaceTech], {
      "package.json": [rootTech],
      "apps/api/package.json": [apiTech],
    });
    const { repository, upsertCalls } = fakeRepository((profile) => profile);

    const scanner = new ProjectProfileScanner(source, structureDetector, reader, techDetector, repository);
    await scanner.scanProject(PROJECT_ID, REPO_ROOT);

    expect(upsertCalls[0]?.technologies).toEqual([workspaceTech, rootTech, apiTech]);
  });

  it("components y structure pasan sin transformar al ProjectProfile final", async () => {
    const { source } = fakeGitTrackedFilesSource(["package.json", "apps/api/package.json"]);
    const components: ProjectComponent[] = [{ name: "api", path: "apps/api", type: "app" }];
    const structure = ["apps", "apps/api"];
    const { detector: structureDetector } = fakeComponentStructureDetector(structure, components);
    const { reader } = fakePackageManifestReader({
      "package.json": EMPTY_MANIFEST,
      "apps/api/package.json": EMPTY_MANIFEST,
    });
    const { detector: techDetector } = fakeTechnologyDetector([], {});
    const { repository, upsertCalls } = fakeRepository((profile) => profile);

    const scanner = new ProjectProfileScanner(source, structureDetector, reader, techDetector, repository);
    await scanner.scanProject(PROJECT_ID, REPO_ROOT);

    expect(upsertCalls[0]?.structure).toBe(structure);
    expect(upsertCalls[0]?.components).toBe(components);
  });

  it("dependencies y configuration siempre son [] y {} — sin dueño de subfase todavía", async () => {
    const { source } = fakeGitTrackedFilesSource(["package.json"]);
    const { detector: structureDetector } = fakeComponentStructureDetector([], []);
    const { reader } = fakePackageManifestReader({ "package.json": EMPTY_MANIFEST });
    const { detector: techDetector } = fakeTechnologyDetector([], {});
    const { repository, upsertCalls } = fakeRepository((profile) => profile);

    const scanner = new ProjectProfileScanner(source, structureDetector, reader, techDetector, repository);
    await scanner.scanProject(PROJECT_ID, REPO_ROOT);

    expect(upsertCalls[0]?.dependencies).toEqual([]);
    expect(upsertCalls[0]?.configuration).toEqual({});
  });

  it("scannedAt es un único Date, capturado dentro de la ventana de ejecución de scanProject", async () => {
    const { source } = fakeGitTrackedFilesSource(["package.json"]);
    const { detector: structureDetector } = fakeComponentStructureDetector([], []);
    const { reader } = fakePackageManifestReader({ "package.json": EMPTY_MANIFEST });
    const { detector: techDetector } = fakeTechnologyDetector([], {});
    const { repository, upsertCalls } = fakeRepository((profile) => profile);
    const scanner = new ProjectProfileScanner(source, structureDetector, reader, techDetector, repository);

    const before = new Date();
    await scanner.scanProject(PROJECT_ID, REPO_ROOT);
    const after = new Date();

    const scannedAt = upsertCalls[0]?.scannedAt;
    expect(scannedAt).toBeInstanceOf(Date);
    expect(scannedAt?.getTime()).toBeGreaterThanOrEqual(before.getTime());
    expect(scannedAt?.getTime()).toBeLessThanOrEqual(after.getTime());
  });

  it("upsert() recibe un UUID recién generado; scanProject() devuelve el id autoritativo del repository, no el generado", async () => {
    const { source } = fakeGitTrackedFilesSource(["package.json"]);
    const { detector: structureDetector } = fakeComponentStructureDetector([], []);
    const { reader } = fakePackageManifestReader({ "package.json": EMPTY_MANIFEST });
    const { detector: techDetector } = fakeTechnologyDetector([], {});
    const AUTHORITATIVE_ID = randomUUID();
    const { repository, upsertCalls } = fakeRepository((profile) => ({ ...profile, id: AUTHORITATIVE_ID }));

    const scanner = new ProjectProfileScanner(source, structureDetector, reader, techDetector, repository);
    const result = await scanner.scanProject(PROJECT_ID, REPO_ROOT);

    const generatedId = upsertCalls[0]?.id;
    expect(generatedId).toBeDefined();
    expect(generatedId).not.toBe(AUTHORITATIVE_ID);
    expect(result.id).toBe(AUTHORITATIVE_ID);
  });

  it("si listTrackedFiles falla, scanProject() rechaza con la misma instancia y no llama a upsert()", async () => {
    const originalError = new Error("no es un repositorio Git");
    const { source } = fakeGitTrackedFilesSource(originalError);
    const { detector: structureDetector } = fakeComponentStructureDetector([], []);
    const { reader } = fakePackageManifestReader({});
    const { detector: techDetector } = fakeTechnologyDetector([], {});
    const { repository, upsertCalls } = fakeRepository((profile) => profile);

    const scanner = new ProjectProfileScanner(source, structureDetector, reader, techDetector, repository);
    const error = await scanner.scanProject(PROJECT_ID, REPO_ROOT).catch((caught: unknown) => caught);

    expect(error).toBe(originalError);
    expect(upsertCalls).toHaveLength(0);
  });

  it("si el manifiesto raíz falla, scanProject() rechaza con la misma instancia y no llama a upsert()", async () => {
    const { source } = fakeGitTrackedFilesSource(["package.json"]);
    const { detector: structureDetector } = fakeComponentStructureDetector([], []);
    const originalError = new Error("manifiesto raíz corrupto");
    const { reader } = fakePackageManifestReader({ "package.json": originalError });
    const { detector: techDetector } = fakeTechnologyDetector([], {});
    const { repository, upsertCalls } = fakeRepository((profile) => profile);

    const scanner = new ProjectProfileScanner(source, structureDetector, reader, techDetector, repository);
    const error = await scanner.scanProject(PROJECT_ID, REPO_ROOT).catch((caught: unknown) => caught);

    expect(error).toBe(originalError);
    expect(upsertCalls).toHaveLength(0);
  });

  it("si el manifiesto de un componente falla (no el raíz), también aborta sin llamar a upsert()", async () => {
    const { source } = fakeGitTrackedFilesSource(["package.json", "apps/api/package.json"]);
    const components: ProjectComponent[] = [{ name: "api", path: "apps/api", type: "app" }];
    const { detector: structureDetector } = fakeComponentStructureDetector([], components);
    const originalError = new Error("apps/api/package.json corrupto");
    const { reader } = fakePackageManifestReader({
      "package.json": EMPTY_MANIFEST,
      "apps/api/package.json": originalError,
    });
    const { detector: techDetector } = fakeTechnologyDetector([], {});
    const { repository, upsertCalls } = fakeRepository((profile) => profile);

    const scanner = new ProjectProfileScanner(source, structureDetector, reader, techDetector, repository);
    const error = await scanner.scanProject(PROJECT_ID, REPO_ROOT).catch((caught: unknown) => caught);

    expect(error).toBe(originalError);
    expect(upsertCalls).toHaveLength(0);
  });
});
