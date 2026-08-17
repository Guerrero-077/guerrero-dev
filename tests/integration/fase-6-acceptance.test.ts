import { findSymbolsByName } from "@guerrero-dev/application";
import { isValidCodeSymbol, isValidDependencyEdge, isValidLiteralMatch } from "@guerrero-dev/domain";
import {
  FileReader,
  GitTrackedFilesSource,
  LiteralCodeSearch,
  TsMorphCodeAnalyzer,
} from "@guerrero-dev/infrastructure";
import { describe, expect, it } from "vitest";

/**
 * Gate de aceptación de Fase 6.x (Fase 6.5) — verifica los criterios de
 * cierre de §12 del mapa contra el propio `guerrero-dev`, componiendo
 * `TsMorphCodeAnalyzer` (6.3) y `LiteralCodeSearch` (6.4) reales, sin
 * ningún código de producción nuevo. Mismo patrón que
 * `fase-5-acceptance.test.ts`: aserciones sobre propiedades del
 * contrato, nunca sobre conteos globales — el número de symbols/edges
 * del repo real cambia con cada commit ajeno a Code Intelligence, así
 * que no forma parte de lo que este test verifica.
 *
 * Se salta si RUN_INTEGRATION_TESTS no está en "true".
 */
const RUN = process.env["RUN_INTEGRATION_TESTS"] === "true";

const PROJECT_PROFILE_MAPPER_PATH = "packages/infrastructure/src/database/mappers/ProjectProfileMapper.ts";
const CONTEXT_BUILDER_PATH = "packages/agent-core/src/ContextBuilder.ts";
const APPLICATION_BARREL_PATH = "packages/application/src/index.ts";
const DATABASE_PLUGIN_PATH = "apps/api/src/plugins/database.ts";

describe.skipIf(!RUN)("Fase 6.x — acceptance (§12 del mapa, contra guerrero-dev real)", () => {
  const repoRoot = process.cwd();
  const trackedFilesSource = new GitTrackedFilesSource();
  const fileReader = new FileReader();
  const analyzer = new TsMorphCodeAnalyzer(trackedFilesSource, fileReader);
  const literalSearch = new LiteralCodeSearch(trackedFilesSource, fileReader);

  describe("extracción — CodeSymbol/DependencyEdge satisfacen sus invariantes en el 100% de un análisis real", () => {
    it("cada CodeSymbol del análisis real satisface isValidCodeSymbol", async () => {
      const index = await analyzer.analyze(repoRoot);

      expect(index.symbols.length).toBeGreaterThan(0);
      for (const symbol of index.symbols) {
        expect(isValidCodeSymbol(symbol)).toBe(true);
      }
    });

    it("cada DependencyEdge del análisis real satisface isValidDependencyEdge", async () => {
      const index = await analyzer.analyze(repoRoot);

      expect(index.edges.length).toBeGreaterThan(0);
      for (const edge of index.edges) {
        expect(isValidDependencyEdge(edge)).toBe(true);
      }
    });
  });

  describe("determinismo — dos análisis consecutivos producen el mismo CodeIndex", () => {
    it("symbols y edges son idénticos entre dos análisis del mismo estado del repo", async () => {
      const first = await analyzer.analyze(repoRoot);
      const second = await analyzer.analyze(repoRoot);

      expect(second).toEqual(first);
    });
  });

  describe("caso Mapper real — ProjectProfileMapper.ts", () => {
    it("ProjectProfileMapper se indexa como const exportado, containerName null", async () => {
      const index = await analyzer.analyze(repoRoot);
      const mapper = index.symbols.find(
        (s) => s.filePath === PROJECT_PROFILE_MAPPER_PATH && s.name === "ProjectProfileMapper",
      );

      expect(mapper).toMatchObject({ kind: "const", exported: true, containerName: null });
    });

    it("toDomain y toRow se indexan como method, containerName 'ProjectProfileMapper', exported false", async () => {
      const index = await analyzer.analyze(repoRoot);
      const toDomain = index.symbols.find(
        (s) => s.filePath === PROJECT_PROFILE_MAPPER_PATH && s.name === "toDomain",
      );
      const toRow = index.symbols.find(
        (s) => s.filePath === PROJECT_PROFILE_MAPPER_PATH && s.name === "toRow",
      );

      expect(toDomain).toMatchObject({
        kind: "method",
        containerName: "ProjectProfileMapper",
        exported: false,
      });
      expect(toRow).toMatchObject({ kind: "method", containerName: "ProjectProfileMapper", exported: false });
    });
  });

  describe("símbolo real localizable vía la superficie de consulta — ContextBuilder", () => {
    it("findSymbolsByName encuentra ContextBuilder como class exportada", async () => {
      const index = await analyzer.analyze(repoRoot);
      const matches = findSymbolsByName(index, "ContextBuilder");

      expect(matches).toHaveLength(1);
      expect(matches[0]).toMatchObject({
        kind: "class",
        filePath: CONTEXT_BUILDER_PATH,
        exported: true,
        containerName: null,
      });
    });
  });

  describe("caso re-export puro — application/src/index.ts", () => {
    it("todas sus edges son re-export con importedNames ['*'], cero import", async () => {
      const index = await analyzer.analyze(repoRoot);
      const edges = index.edges.filter((edge) => edge.fromFile === APPLICATION_BARREL_PATH);

      expect(edges.length).toBeGreaterThan(0);
      for (const edge of edges) {
        expect(edge.kind).toBe("re-export");
        expect(edge.importedNames).toEqual(["*"]);
      }
    });
  });

  describe("exclusión de declare module — apps/api/src/plugins/database.ts", () => {
    it('no produce ningún símbolo derivado del bloque declare module "fastify"', async () => {
      const index = await analyzer.analyze(repoRoot);
      const symbols = index.symbols.filter((s) => s.filePath === DATABASE_PLUGIN_PATH);

      expect(symbols.some((s) => s.name === "FastifyInstance")).toBe(false);
    });
  });

  describe("búsqueda literal real", () => {
    it("encuentra coincidencias reales para un string conocido del repo, todas válidas", async () => {
      const matches = await literalSearch.search(repoRoot, "ProjectProfileMapper");

      expect(matches.length).toBeGreaterThan(0);
      for (const match of matches) {
        expect(isValidLiteralMatch(match)).toBe(true);
      }
    });
  });
});
