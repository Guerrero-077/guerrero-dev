import { randomUUID } from "node:crypto";
import {
  DeterministicComponentStructureDetector,
  DeterministicTechnologyDetector,
  ProjectProfileScanner,
} from "@guerrero-dev/application";
import {
  createDrizzleClient,
  createPostgresPool,
  DrizzleProjectIntelligenceRepository,
  DrizzleProjectRepository,
  FileReader,
  GitTrackedFilesSource,
  loadConfig,
  PackageManifestReader,
  runMigrations,
  type PgPool,
} from "@guerrero-dev/infrastructure";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Test de integración (Fase 5.7): compone las cinco implementaciones
 * reales — `GitTrackedFilesSource` (5.2), `DeterministicComponentStructureDetector`
 * (5.5), `PackageManifestReader` sobre `FileReader` real (5.3/5.4),
 * `DeterministicTechnologyDetector` (5.4), `DrizzleProjectIntelligenceRepository`
 * (5.6) — y corre `scanProject()` contra este mismo repositorio y contra
 * PostgreSQL real. No repite lo que 5.2/5.4/5.5/5.6 ya verificaron por
 * separado; prueba que la orquestación de 5.7 los conecta correctamente.
 * Se salta si RUN_INTEGRATION_TESTS no está en "true".
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

describe.skipIf(!RUN)(
  "ProjectProfileScanner (integration, contra este mismo repositorio + Postgres real)",
  () => {
    let pool: PgPool;
    let scanner: ProjectProfileScanner;
    let projectId: string;

    beforeAll(async () => {
      const config = loadConfig();
      pool = createPostgresPool(config);
      await runMigrations(pool);
      const db = createDrizzleClient(pool);

      const fileReader = new FileReader();
      scanner = new ProjectProfileScanner(
        new GitTrackedFilesSource(),
        new DeterministicComponentStructureDetector(),
        new PackageManifestReader(fileReader),
        new DeterministicTechnologyDetector(),
        new DrizzleProjectIntelligenceRepository(db),
      );

      const projectRepo = new DrizzleProjectRepository(db);
      const now = new Date();
      const project = await projectRepo.create({
        id: randomUUID(),
        name: "project-profile-scanner-test",
        path: `/tmp/guerrero-scanner-test-${Date.now()}`,
        createdAt: now,
        updatedAt: now,
      });
      projectId = project.id;
    });

    afterAll(async () => {
      await pool.end();
    });

    it("escanea guerrero-dev real y produce un ProjectProfile con hechos conocidos", async () => {
      const profile = await scanner.scanProject(projectId, process.cwd());

      expect(profile.projectId).toBe(projectId);
      expect(profile.schemaVersion).toBe(1);

      const technologyNames = profile.technologies.map((t) => t.name);
      expect(technologyNames).toContain("TypeScript");
      expect(technologyNames).toContain("Node.js");
      expect(technologyNames).toContain("pnpm");
      expect(technologyNames).toContain("Fastify");

      expect(profile.components).toContainEqual({ name: "api", path: "apps/api", type: "app" });
      expect(profile.components).toContainEqual({ name: "domain", path: "packages/domain", type: "package" });
      // apps/web: limitación conocida de 5.5, reconfirmada aquí de punta a punta.
      expect(profile.components).toContainEqual({ name: "web", path: "apps/web", type: "app" });

      expect(profile.structure).toContain("apps");
      expect(profile.structure).toContain("packages/domain");

      expect(profile.dependencies).toEqual([]);
      expect(profile.configuration).toEqual({});
    });

    it("un segundo scan sobre el mismo proyecto conserva el id y actualiza scannedAt", async () => {
      const first = await scanner.scanProject(projectId, process.cwd());
      const second = await scanner.scanProject(projectId, process.cwd());

      expect(second.id).toBe(first.id);
      expect(second.scannedAt.getTime()).toBeGreaterThanOrEqual(first.scannedAt.getTime());
    });
  },
);
