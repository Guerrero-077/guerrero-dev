import { randomUUID } from "node:crypto";
import { isValidComponent, isValidTechnology } from "@guerrero-dev/domain";
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
 * Gate de aceptación de Fase 5 (Fase 5.9) — verifica directamente los
 * criterios de cierre de §12 del mapa, no el comportamiento interno de
 * cada subfase (eso ya lo cubren sus propios tests: 5.2, 5.4, 5.5, 5.6,
 * 5.7). Compone las cinco implementaciones reales contra este mismo
 * repositorio y contra PostgreSQL real — mismo patrón que
 * `project-profile-scanner.test.ts`, con foco distinto: aquí lo que se
 * comprueba es "¿el objeto que el sistema produce de verdad satisface los
 * invariantes de dominio y las garantías de persistencia?", no "¿la
 * orquestación está bien cableada?".
 *
 * Se salta si RUN_INTEGRATION_TESTS no está en "true".
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

async function countProjectProfileRows(pool: PgPool, projectId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    "SELECT COUNT(*)::text AS count FROM project_profiles WHERE project_id = $1",
    [projectId],
  );
  return Number(result.rows[0]?.count ?? "0");
}

describe.skipIf(!RUN)(
  "Fase 5 — acceptance (§12 del mapa, contra guerrero-dev real + PostgreSQL real)",
  () => {
    let pool: PgPool;
    let scanner: ProjectProfileScanner;
    let repository: DrizzleProjectIntelligenceRepository;
    let projectId: string;

    beforeAll(async () => {
      const config = loadConfig();
      pool = createPostgresPool(config);
      await runMigrations(pool);
      const db = createDrizzleClient(pool);

      repository = new DrizzleProjectIntelligenceRepository(db);
      scanner = new ProjectProfileScanner(
        new GitTrackedFilesSource(),
        new DeterministicComponentStructureDetector(),
        new PackageManifestReader(new FileReader()),
        new DeterministicTechnologyDetector(),
        repository,
      );

      const projectRepo = new DrizzleProjectRepository(db);
      const now = new Date();
      const project = await projectRepo.create({
        id: randomUUID(),
        name: "fase-5-acceptance-test",
        path: `/tmp/guerrero-fase5-acceptance-${Date.now()}`,
        createdAt: now,
        updatedAt: now,
      });
      projectId = project.id;
    });

    afterAll(async () => {
      await pool.end();
    });

    describe("technologies[] con evidencia trazable en el 100% de las entradas", () => {
      it("cada Technology del scan real satisface isValidTechnology", async () => {
        const profile = await scanner.scanProject(projectId, process.cwd());

        // No vacío: evita que el criterio se cumpla trivialmente sobre un array sin nada que validar.
        expect(profile.technologies.length).toBeGreaterThan(0);
        for (const technology of profile.technologies) {
          expect(isValidTechnology(technology)).toBe(true);
        }
      });
    });

    describe("components[] satisface los invariantes de dominio", () => {
      it("cada ProjectComponent del scan real satisface isValidComponent", async () => {
        const profile = await scanner.scanProject(projectId, process.cwd());

        expect(profile.components.length).toBeGreaterThan(0);
        for (const component of profile.components) {
          expect(isValidComponent(component)).toBe(true);
        }
      });
    });

    describe("schemaVersion presente en el perfil persistido", () => {
      it("schemaVersion === 1, leído desde PostgreSQL vía findByProjectId, no del retorno de scanProject()", async () => {
        await scanner.scanProject(projectId, process.cwd());

        const persisted = await repository.findByProjectId(projectId);

        expect(persisted?.schemaVersion).toBe(1);
      });
    });

    describe("repetibilidad — scan → upsert → scan, sin duplicar filas", () => {
      it("un segundo scan preserva el id, actualiza scannedAt, y persiste exactamente una fila en ambos momentos", async () => {
        const first = await scanner.scanProject(projectId, process.cwd());
        const rowsAfterFirst = await countProjectProfileRows(pool, projectId);

        const second = await scanner.scanProject(projectId, process.cwd());
        const rowsAfterSecond = await countProjectProfileRows(pool, projectId);

        expect(second.id).toBe(first.id);
        expect(second.scannedAt.getTime()).toBeGreaterThanOrEqual(first.scannedAt.getTime());
        expect(rowsAfterFirst).toBe(1);
        expect(rowsAfterSecond).toBe(1);
      });
    });
  },
);
