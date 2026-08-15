import { describe, expect, it } from "vitest";
import type { CommitSignal } from "../models/CommitSignal.js";
import { DeterministicCommitNoiseFilter } from "./DeterministicCommitNoiseFilter.js";

/**
 * Suite de evaluación reproducible de `DeterministicCommitNoiseFilter`
 * contra los 23 commits reales del golden dataset
 * (`docs/benchmarks/candidate-detection/`) — Fase 4.8, primer incremento.
 *
 * Los fixtures reproducen `touchedPaths`/magnitud reales (verificados con
 * `git show --shortstat`/`git show --name-only` contra los repos reales,
 * no inventados) para los 23 commits ya auditados a mano en
 * `guerrero-dev/*.json` y `gescomph-api/*.json`. `expectedNoise` viene
 * directo de `classification.includes("noise")` en esos JSON — es la
 * misma etiqueta que ya decidimos a mano, no una nueva.
 *
 * Esta suite mide, NO ajusta reglas hasta que "parezcan razonables" (la
 * disciplina explícita para este incremento): el filtro debe tener CERO
 * falsos positivos (nunca descarta algo que no es ruido — es la
 * propiedad de seguridad que importa, dado que 4.8 tiene sesgo hacia
 * preservar falsos positivos), y se reporta explícitamente qué proporción
 * de los casos de ruido confirmados realmente atrapa (recall), sin
 * forzarlo a 100%.
 */

interface GoldenCase {
  readonly sha: string;
  readonly repo: "guerrero-dev" | "gescomph-api";
  readonly expectedNoise: boolean;
  readonly touchedPaths: readonly string[];
  readonly linesAdded: number;
  readonly linesRemoved: number;
}

const GOLDEN_DATASET: readonly GoldenCase[] = [
  // --- guerrero-dev (Dataset A, 11 commits, historial completo) ---
  {
    sha: "d3b5804",
    repo: "guerrero-dev",
    expectedNoise: false,
    touchedPaths: [
      ".env.example",
      ".github/workflows/ci.yml",
      ".gitignore",
      "README.md",
      "apps/api/src/app.ts",
      "apps/cli/src/commands/doctor.ts",
      "docker-compose.yml",
      "package.json",
      "packages/agent-core/src/AgentLoop.ts",
      "packages/application/src/agent/AgentService.ts",
      "packages/domain/src/agent/AgentMessage.ts",
      "packages/infrastructure/src/database/PostgresProjectRepository.ts",
      "tests/e2e/api.test.ts",
    ],
    linesAdded: 2664,
    linesRemoved: 0,
  },
  {
    sha: "523be5e",
    repo: "guerrero-dev",
    expectedNoise: false,
    touchedPaths: ["docs/fase-3-foundation.md"],
    linesAdded: 198,
    linesRemoved: 0,
  },
  {
    sha: "4a631af",
    repo: "guerrero-dev",
    expectedNoise: false,
    touchedPaths: [
      "README.md",
      "apps/api/src/app.ts",
      "apps/cli/src/commands/doctor.ts",
      "apps/cli/src/commands/project.ts",
      "docs/fase-3-implementacion.md",
      "packages/application/src/projects/AddProject.ts",
      "packages/domain/src/project/Project.ts",
      "packages/infrastructure/src/database/repositories/DrizzleProjectRepository.ts",
      "tests/e2e/api.test.ts",
      "tests/integration/project-repository.test.ts",
    ],
    linesAdded: 861,
    linesRemoved: 334,
  },
  {
    sha: "a1dc883",
    repo: "guerrero-dev",
    expectedNoise: true,
    touchedPaths: [
      ".gitignore",
      "apps/api/tsconfig.tsbuildinfo",
      "apps/cli/tsconfig.tsbuildinfo",
      "packages/agent-core/tsconfig.tsbuildinfo",
      "packages/application/tsconfig.tsbuildinfo",
      "packages/domain/tsconfig.tsbuildinfo",
      "packages/execution/tsconfig.tsbuildinfo",
      "packages/infrastructure/tsconfig.tsbuildinfo",
      "packages/mcp/tsconfig.tsbuildinfo",
      "packages/memory/tsconfig.tsbuildinfo",
      "packages/project-intelligence/tsconfig.tsbuildinfo",
      "packages/shared/tsconfig.tsbuildinfo",
    ],
    linesAdded: 1,
    linesRemoved: 11,
  },
  {
    sha: "1845a52",
    repo: "guerrero-dev",
    expectedNoise: false,
    touchedPaths: [
      "apps/api/tsconfig.tsbuildinfo",
      "apps/cli/src/commands/doctor.ts",
      "apps/cli/tsconfig.tsbuildinfo",
      "packages/agent-core/tsconfig.tsbuildinfo",
      "packages/application/tsconfig.tsbuildinfo",
      "packages/domain/tsconfig.tsbuildinfo",
      "packages/execution/tsconfig.tsbuildinfo",
      "packages/infrastructure/tsconfig.tsbuildinfo",
      "packages/mcp/tsconfig.tsbuildinfo",
      "packages/memory/tsconfig.tsbuildinfo",
      "packages/project-intelligence/tsconfig.tsbuildinfo",
      "packages/shared/tsconfig.tsbuildinfo",
      "pnpm-lock.yaml",
    ],
    linesAdded: 3082,
    linesRemoved: 1,
  },
  {
    sha: "a2dd733",
    repo: "guerrero-dev",
    expectedNoise: false,
    touchedPaths: ["apps/cli/src/commands/doctor.ts"],
    linesAdded: 8,
    linesRemoved: 5,
  },
  {
    sha: "93e9cd1",
    repo: "guerrero-dev",
    expectedNoise: true,
    touchedPaths: ["README.md"],
    linesAdded: 2,
    linesRemoved: 0,
  },
  {
    sha: "2e3240e",
    repo: "guerrero-dev",
    expectedNoise: false,
    touchedPaths: [
      ".editorconfig",
      "docs/adr/0001-core-technology-selection.md",
      "docs/adr/0002-agent-engine-abstraction.md",
    ],
    linesAdded: 112,
    linesRemoved: 0,
  },
  {
    sha: "666edb9",
    repo: "guerrero-dev",
    expectedNoise: false,
    touchedPaths: ["docs/fase-4-memory-engine.md"],
    linesAdded: 420,
    linesRemoved: 0,
  },
  {
    sha: "96f2719",
    repo: "guerrero-dev",
    expectedNoise: false,
    touchedPaths: [
      "packages/application/src/common/ports/IMemoryStore.ts",
      "packages/application/src/memory/MemoryService.ts",
      "packages/domain/src/memory/Memory.ts",
      "packages/domain/src/memory/MemoryCandidate.ts",
      "packages/domain/src/memory/MemoryRecord.ts",
      "packages/domain/src/memory/MemoryRelation.ts",
      "packages/domain/src/memory/MemorySource.ts",
      "packages/domain/src/memory/memory.test.ts",
    ],
    linesAdded: 250,
    linesRemoved: 58,
  },
  {
    sha: "bf7f9fb",
    repo: "guerrero-dev",
    expectedNoise: false,
    touchedPaths: [
      "packages/application/src/common/ports/IMemoryRepository.ts",
      "packages/domain/src/memory/Embedding.ts",
      "packages/infrastructure/src/database/mappers/MemoryMapper.ts",
      "packages/infrastructure/src/database/migrations/0002_memory_tables.sql",
      "packages/infrastructure/src/database/repositories/DrizzleMemoryRepository.ts",
      "packages/infrastructure/src/database/schema/memories.ts",
      "tests/integration/memory-repository.test.ts",
    ],
    linesAdded: 736,
    linesRemoved: 0,
  },
  // --- gescomph-api (Dataset B, 12 de 33 commits reales) ---
  {
    sha: "ec5f766",
    repo: "gescomph-api",
    expectedNoise: true,
    touchedPaths: ["README.md"],
    linesAdded: 2,
    linesRemoved: 0,
  },
  {
    sha: "232a59d",
    repo: "gescomph-api",
    expectedNoise: false,
    touchedPaths: [
      ".gitignore",
      "Diagrama/Diagram/Arriendo_Alcaldia.Designer.cs",
      "Diagrama/Diagram/Arriendo_Alcaldia.edmx",
      "Diagrama/DiagramGESCOMPH.sln",
      "GESCOMPH-DB/docker-compose.yml",
      "GESCOMPH/Business/Business.csproj",
      "GESCOMPH/Business/CustomJWT/TokenBusiness.cs",
      "GESCOMPH/Business/Repository/UnitOfWork.cs",
      "GESCOMPH/Business/Services/Business/AppointmentService.cs",
      "GESCOMPH/Business/Services/Business/EstablishmentService.cs",
      "Jenkinsfile",
      "README.md",
    ],
    linesAdded: 27284,
    linesRemoved: 2,
  },
  {
    sha: "5d6b4a7",
    repo: "gescomph-api",
    expectedNoise: false,
    touchedPaths: [
      "GESCOMPH/Business/Mapping/Registers/BusinessContractMapping.cs",
      "GESCOMPH/Business/Services/Business/EstablishmentService.cs",
      "GESCOMPH/Data/Interfaz/IDataImplement/Business/IEstablishmentsRepository.cs",
      "GESCOMPH/Data/Services/Business/EstablishmentsRepository.cs",
      "GESCOMPH/Entity/DTOs/Implements/Utilities/Images/ImageSelectDto.cs",
      "GESCOMPH/Entity/Domain/Models/Implements/Business/Establishment.cs",
      "GESCOMPH/WebGESCOMPH/appsettings.json",
    ],
    linesAdded: 50,
    linesRemoved: 40,
  },
  {
    sha: "db18646",
    repo: "gescomph-api",
    expectedNoise: false,
    touchedPaths: [
      "GESCOMPH/Business/Services/Business/ObligationMonthService.cs",
      "GESCOMPH/Data/Services/Business/ObligationMonthRepository.cs",
      "GESCOMPH/Entity/Domain/Models/Implements/Business/ObligationMonth.cs",
      "GESCOMPH/Entity/Infrastructure/DataInit/Business/ObligationMonthSeeder .cs",
    ],
    linesAdded: 41,
    linesRemoved: 36,
  },
  {
    sha: "af3fe10",
    repo: "gescomph-api",
    expectedNoise: false,
    touchedPaths: [
      "GESCOMPH/Entity/Infrastructure/Configurations/AdministrationSystem/NotificationConfiguration.cs",
    ],
    linesAdded: 45,
    linesRemoved: 0,
  },
  {
    sha: "92475e3",
    repo: "gescomph-api",
    expectedNoise: false,
    touchedPaths: [
      "GESCOMPH/Data/Services/SecurityAuthentication/RefreshTokenRepository.cs",
      "GESCOMPH/WebGESCOMPH/Controllers/Module/SecurityAuthentication/AuthController.cs",
    ],
    linesAdded: 28,
    linesRemoved: 13,
  },
  {
    sha: "a7942f0",
    repo: "gescomph-api",
    expectedNoise: false,
    touchedPaths: [
      "GESCOMPH/Business/Interfaces/Implements/Business/IMercadoPagoService.cs",
      "GESCOMPH/Business/Services/Business/MercadoPagoService.cs",
      "GESCOMPH/Entity/DTOs/Implements/Payments/MercadoPagoPreferenceResult.cs",
      "GESCOMPH/Entity/Infrastructure/Configurations/Payments/MercadoPagoSettings.cs",
      "GESCOMPH/WebGESCOMPH/Controllers/Module/Business/PaymentsController.cs",
      "GESCOMPH/WebGESCOMPH/Program.cs",
      "GESCOMPH/WebGESCOMPH/appsettings.json",
    ],
    linesAdded: 463,
    linesRemoved: 24,
  },
  {
    sha: "a384c61",
    repo: "gescomph-api",
    expectedNoise: false,
    touchedPaths: [
      "GESCOMPH/Business/Interfaces/Implements/Business/IObligationNotifier.cs",
      "GESCOMPH/Business/Services/Business/ObligationMonthService.cs",
      "GESCOMPH/Entity/Domain/Models/Implements/Business/Contract.cs",
      "GESCOMPH/Test/Modulo/Business/ContractServiceTests.cs",
      "GESCOMPH/WebGESCOMPH/Program.cs",
      "GESCOMPH/WebGESCOMPH/Services/SignalRObligationNotifier.cs",
    ],
    linesAdded: 313,
    linesRemoved: 33,
  },
  {
    sha: "60c34f2",
    repo: "gescomph-api",
    expectedNoise: false,
    touchedPaths: [
      "GESCOMPH/Entity/Infrastructure/Configurations/AdministrationSystem/CollectionSettingConfiguration.cs",
    ],
    linesAdded: 22,
    linesRemoved: 0,
  },
  {
    sha: "bb705ac",
    repo: "gescomph-api",
    expectedNoise: false,
    touchedPaths: [
      "GESCOMPH/Data/Services/SecurityAuthentication/RolFormPermissionRepository.cs",
      "GESCOMPH/Test/Modulo/Business/AppointmentServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/ContractServiceTests.cs",
      "GESCOMPH/Test/Modulo/Data/ContractRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/RolTest/RolRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Web/UserControllerTests.cs",
    ],
    linesAdded: 2288,
    linesRemoved: 1431,
  },
  {
    sha: "6537bec",
    repo: "gescomph-api",
    expectedNoise: true,
    touchedPaths: [
      "Diagrama/Diagram/App.Config",
      "Diagrama/Diagram/Appointments.cs",
      "Diagrama/Diagram/Arriendo_Alcaldia.Context.cs",
      "Diagrama/Diagram/Arriendo_Alcaldia.Context.tt",
      "Diagrama/Diagram/Arriendo_Alcaldia.Designer.cs",
      "Diagrama/Diagram/Arriendo_Alcaldia.cs",
      "Diagrama/Diagram/Arriendo_Alcaldia.edmx",
      "Diagrama/Diagram/Arriendo_Alcaldia.edmx.diagram",
      "Diagrama/Diagram/Arriendo_Alcaldia.tt",
      "Diagrama/Diagram/Cities.cs",
      "Diagrama/Diagram/Diagram.csproj",
      "Diagrama/Diagram/Users.cs",
      "Diagrama/Diagram/packages.config",
    ],
    linesAdded: 4117,
    linesRemoved: 330,
  },
  {
    sha: "97942f6",
    repo: "gescomph-api",
    expectedNoise: false,
    touchedPaths: ["GESCOMPH/WebGESCOMPH/appsettings.json"],
    linesAdded: 3,
    linesRemoved: 3,
  },
];

function toSignal(goldenCase: GoldenCase): CommitSignal {
  return {
    commit: {
      sha: goldenCase.sha,
      message: `${goldenCase.repo}@${goldenCase.sha}`,
      author: "unknown",
      timestamp: new Date("2026-01-01"),
      diff: "",
      changedFiles: goldenCase.touchedPaths,
    },
    filesChanged: goldenCase.touchedPaths.length,
    linesAdded: goldenCase.linesAdded,
    linesRemoved: goldenCase.linesRemoved,
    touchedPaths: goldenCase.touchedPaths,
    recentRelatedCommits: [],
  };
}

describe("DeterministicCommitNoiseFilter — golden dataset (23 commits reales, 2 repositorios)", () => {
  const filter = new DeterministicCommitNoiseFilter();

  const results = GOLDEN_DATASET.map((goldenCase) => ({
    goldenCase,
    result: filter.shouldDiscard(toSignal(goldenCase)),
  }));

  const falsePositives = results.filter((r) => !r.goldenCase.expectedNoise && r.result.discard);
  const truePositives = results.filter((r) => r.goldenCase.expectedNoise && r.result.discard);
  const falseNegatives = results.filter((r) => r.goldenCase.expectedNoise && !r.result.discard);

  it("CERO falsos positivos: nunca descarta un commit que no está etiquetado como ruido", () => {
    expect(falsePositives.map((r) => r.goldenCase.sha)).toEqual([]);
  });

  it("atrapa exactamente los 3 casos de ruido con patrón de archivo reconocible (a1dc883, 93e9cd1, ec5f766)", () => {
    expect(truePositives.map((r) => r.goldenCase.sha).sort()).toEqual(["93e9cd1", "a1dc883", "ec5f766"]);
  });

  it("gap conocido y documentado: NO atrapa 6537bec (archivos .cs planos generados sin extensión distintiva)", () => {
    expect(falseNegatives.map((r) => r.goldenCase.sha)).toEqual(["6537bec"]);
  });

  it("precision de descarte = 100% (todo lo que descarta es ruido confirmado)", () => {
    const discardedCount = truePositives.length + falsePositives.length;
    const precision = discardedCount === 0 ? 1 : truePositives.length / discardedCount;
    expect(precision).toBe(1);
  });

  it("recall sobre ruido confirmado = 75% (3 de 4 casos, ver taxonomy.md)", () => {
    const totalNoise = GOLDEN_DATASET.filter((c) => c.expectedNoise).length;
    const recall = truePositives.length / totalNoise;
    expect(recall).toBeCloseTo(0.75, 5);
  });
});
