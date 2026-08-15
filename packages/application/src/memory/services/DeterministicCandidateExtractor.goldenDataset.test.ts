import { describe, expect, it } from "vitest";
import type { CommitSignal } from "../models/CommitSignal.js";
import { DeterministicCandidateExtractor } from "./DeterministicCandidateExtractor.js";

/**
 * Suite de regresión (Fase 4.8.4) contra 18 de los 23 casos del golden
 * dataset (`docs/benchmarks/candidate-detection/`), con `touchedPaths`
 * reales extraídos vía `git show --name-only` de `guerrero-dev` y
 * `gescomph-api` — no inventados. Los 5 casos restantes (`93e9cd1`,
 * `a1dc883`, `ec5f766`: ruido puro, ya nunca llegan al extractor porque el
 * noise filter los descarta antes; `d3b5804`/`232a59d`: primeros commits
 * con cientos de archivos, omitidos por tamaño, ya cubiertos
 * conceptualmente por `4a631af`/`bf7f9fb` para las mismas reglas) no
 * aportan evidencia adicional sobre las 5 reglas deterministas.
 *
 * Esto es evidencia de que las reglas generalizan a través de datasets, NO
 * una lista de casos que el extractor deba memorizar — cada expectativa
 * está derivada de inspeccionar los paths reales, no ajustada a que el
 * test pase (ver `docs/fase-4-memory-engine.md` §14j para el hallazgo de
 * precisión en `5d6b4a7`, aceptado y documentado, no ocultado).
 */
interface GoldenCase {
  readonly sha: string;
  readonly repo: "guerrero-dev" | "gescomph-api";
  readonly touchedPaths: readonly string[];
  readonly expectedRules: readonly string[];
  readonly note?: string;
}

const GOLDEN_DATASET: readonly GoldenCase[] = [
  {
    sha: "bf7f9fb",
    repo: "guerrero-dev",
    expectedRules: ["INTERFACE_IMPL_DI_PATTERN", "SCHEMA_PATH"],
    touchedPaths: [
      "packages/application/src/common/ports/IEmbeddingProvider.ts",
      "packages/application/src/common/ports/IMemoryRelationRepository.ts",
      "packages/application/src/common/ports/IMemoryRepository.ts",
      "packages/application/src/common/ports/IMemorySourceRepository.ts",
      "packages/application/src/common/ports/index.ts",
      "packages/domain/src/memory/Embedding.ts",
      "packages/domain/src/memory/index.ts",
      "packages/infrastructure/src/database/index.ts",
      "packages/infrastructure/src/database/mappers/MemoryMapper.ts",
      "packages/infrastructure/src/database/mappers/MemoryRelationMapper.ts",
      "packages/infrastructure/src/database/mappers/MemorySourceMapper.ts",
      "packages/infrastructure/src/database/migrations/0002_memory_tables.sql",
      "packages/infrastructure/src/database/repositories/DrizzleMemoryRelationRepository.ts",
      "packages/infrastructure/src/database/repositories/DrizzleMemoryRepository.ts",
      "packages/infrastructure/src/database/repositories/DrizzleMemorySourceRepository.ts",
      "packages/infrastructure/src/database/schema/index.ts",
      "packages/infrastructure/src/database/schema/memories.ts",
      "packages/infrastructure/src/database/schema/memoryEmbeddings.ts",
      "packages/infrastructure/src/database/schema/memoryRelations.ts",
      "packages/infrastructure/src/database/schema/memorySources.ts",
      "tests/integration/memory-repository.test.ts",
    ],
  },
  {
    sha: "96f2719",
    repo: "guerrero-dev",
    expectedRules: [],
    note:
      "IMemoryStore.ts se elimina sin que ningún archivo tocado contenga 'MemoryStore' en su nombre — " +
      "sin desglose por archivo (gap documentado en §14j), la regla no puede confirmar una implementación real.",
    touchedPaths: [
      "packages/application/src/common/ports/IMemoryStore.ts",
      "packages/application/src/common/ports/index.ts",
      "packages/application/src/memory/MemoryService.ts",
      "packages/application/src/memory/index.ts",
      "packages/domain/src/memory/Memory.ts",
      "packages/domain/src/memory/MemoryCandidate.ts",
      "packages/domain/src/memory/MemoryEmbedding.ts",
      "packages/domain/src/memory/MemoryInvariants.ts",
      "packages/domain/src/memory/MemoryRecord.ts",
      "packages/domain/src/memory/MemoryRelation.ts",
      "packages/domain/src/memory/MemoryScope.ts",
      "packages/domain/src/memory/MemorySource.ts",
      "packages/domain/src/memory/MemoryStatus.ts",
      "packages/domain/src/memory/MemoryType.ts",
      "packages/domain/src/memory/index.ts",
      "packages/domain/src/memory/memory.test.ts",
    ],
  },
  {
    sha: "2e3240e",
    repo: "guerrero-dev",
    expectedRules: ["ADR_PATH"],
    touchedPaths: [
      ".editorconfig",
      "docs/adr/0001-core-technology-selection.md",
      "docs/adr/0002-agent-engine-abstraction.md",
    ],
  },
  {
    sha: "523be5e",
    repo: "guerrero-dev",
    expectedRules: ["DOCS_PATH"],
    touchedPaths: ["docs/fase-3-foundation.md"],
  },
  {
    sha: "666edb9",
    repo: "guerrero-dev",
    expectedRules: ["DOCS_PATH"],
    note: "Produce una única candidata de baja confianza — descomponerla en N (una por decisión documentada) queda fuera del extractor determinista.",
    touchedPaths: ["docs/fase-4-memory-engine.md"],
  },
  {
    sha: "a2dd733",
    repo: "guerrero-dev",
    expectedRules: [],
    note: "El motivo real (DEP0190) solo está en un comentario del diff — ninguna regla estructural puede alcanzarlo.",
    touchedPaths: ["apps/cli/src/commands/doctor.ts"],
  },
  {
    sha: "1845a52",
    repo: "guerrero-dev",
    expectedRules: [],
    note: "Magnitud dominada por *.tsbuildinfo + pnpm-lock.yaml accidentales; ninguna regla estructural aplica al único archivo real (doctor.ts).",
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
  },
  {
    sha: "4a631af",
    repo: "guerrero-dev",
    expectedRules: ["INTERFACE_IMPL_DI_PATTERN", "SCHEMA_PATH"],
    note: "docs/fase-3-implementacion.md es 1 de 35 archivos — DOCS_PATH correctamente NO dispara (no es el 100%).",
    touchedPaths: [
      "README.md",
      "apps/api/package.json",
      "apps/api/src/app.ts",
      "apps/api/src/index.ts",
      "apps/api/src/plugins/database.ts",
      "apps/api/src/routes/health.ts",
      "apps/api/src/routes/projects.ts",
      "apps/api/src/server.ts",
      "apps/cli/src/commands/doctor.ts",
      "apps/cli/src/commands/project.ts",
      "apps/cli/src/context.ts",
      "apps/cli/src/index.ts",
      "docs/fase-3-implementacion.md",
      "packages/application/src/common/ports/IProjectRepository.ts",
      "packages/application/src/projects/AddProject.ts",
      "packages/application/src/projects/GetProject.ts",
      "packages/application/src/projects/ListProjects.ts",
      "packages/application/src/projects/ProjectService.test.ts",
      "packages/application/src/projects/ProjectService.ts",
      "packages/application/src/projects/index.ts",
      "packages/application/src/projects/projects.test.ts",
      "packages/domain/src/project/Project.ts",
      "packages/domain/src/shared/Entity.ts",
      "packages/domain/src/shared/Result.ts",
      "packages/domain/src/shared/index.ts",
      "packages/infrastructure/package.json",
      "packages/infrastructure/src/database/PostgresProjectRepository.ts",
      "packages/infrastructure/src/database/client.ts",
      "packages/infrastructure/src/database/index.ts",
      "packages/infrastructure/src/database/migrations/0001_init.sql",
      "packages/infrastructure/src/database/repositories/DrizzleProjectRepository.ts",
      "packages/infrastructure/src/database/schema/index.ts",
      "packages/infrastructure/src/database/schema/projects.ts",
      "tests/e2e/api.test.ts",
      "tests/integration/project-repository.test.ts",
    ],
  },
  {
    sha: "a7942f0",
    repo: "gescomph-api",
    expectedRules: ["INTERFACE_IMPL_DI_PATTERN"],
    touchedPaths: [
      "GESCOMPH/Business/Interfaces/Implements/Business/IMercadoPagoService.cs",
      "GESCOMPH/Business/Services/Business/MercadoPagoService.cs",
      "GESCOMPH/Entity/DTOs/Implements/Payments/MercadoPagoPreferenceResult.cs",
      "GESCOMPH/Entity/DTOs/Implements/Payments/MercadoPagoWebhookPayload.cs",
      "GESCOMPH/Entity/Infrastructure/Configurations/Payments/MercadoPagoSettings.cs",
      "GESCOMPH/WebGESCOMPH/Controllers/Module/Business/PaymentsController.cs",
      "GESCOMPH/WebGESCOMPH/Extensions/Payments/MercadoPagoServiceCollectionExtensions.cs",
      "GESCOMPH/WebGESCOMPH/Program.cs",
      "GESCOMPH/WebGESCOMPH/Properties/launchSettings.json",
      "GESCOMPH/WebGESCOMPH/appsettings.json",
    ],
  },
  {
    sha: "a384c61",
    repo: "gescomph-api",
    expectedRules: ["INTERFACE_IMPL_DI_PATTERN"],
    note:
      "IObligationNotifier.cs se implementa en SignalRObligationNotifier.cs (contiene el nombre base, no lo " +
      "iguala) y sin archivo de registro DI dedicado (solo Program.cs) — ambos casos que motivaron relajar la regla.",
    touchedPaths: [
      "GESCOMPH/Business/Interfaces/Implements/Business/IObligationNotifier.cs",
      "GESCOMPH/Business/Services/Business/MercadoPagoService.cs",
      "GESCOMPH/Business/Services/Business/ObligationMonthService.cs",
      "GESCOMPH/Entity/Domain/Models/Implements/Business/Contract.cs",
      "GESCOMPH/Test/Modulo/Business/ContractServiceTests.cs",
      "GESCOMPH/WebGESCOMPH/Program.cs",
      "GESCOMPH/WebGESCOMPH/RealTime/Collection/CollectionJobs.cs",
      "GESCOMPH/WebGESCOMPH/Services/SignalRObligationNotifier.cs",
    ],
  },
  {
    sha: "af3fe10",
    repo: "gescomph-api",
    expectedRules: [],
    note: "Un solo archivo Configuration.cs, sin interfaz nueva — el patrón de 3+ archivos no aplica.",
    touchedPaths: [
      "GESCOMPH/Entity/Infrastructure/Configurations/AdministrationSystem/NotificationConfiguration.cs",
    ],
  },
  {
    sha: "60c34f2",
    repo: "gescomph-api",
    expectedRules: [],
    touchedPaths: [
      "GESCOMPH/Entity/Infrastructure/Configurations/AdministrationSystem/CollectionSettingConfiguration.cs",
    ],
  },
  {
    sha: "bb705ac",
    repo: "gescomph-api",
    expectedRules: ["TEST_PATH_PATTERN"],
    note: "63 de 64 archivos son tests (98%) — el umbral de mayoría simple (>50%), no un 90%/100% ajustado, ya lo cubre.",
    touchedPaths: [
      "GESCOMPH/Data/Services/SecurityAuthentication/RolFormPermissionRepository.cs",
      "GESCOMPH/Test/Modulo/Business/AppointmentServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/CityServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/ClauseServiceMoreTests.cs",
      "GESCOMPH/Test/Modulo/Business/ClauseServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/ContractClauseServiceGenericTests.cs",
      "GESCOMPH/Test/Modulo/Business/ContractServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/DepartmentServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/EstablishmentServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/FormServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/ModuleServiceMoreTests.cs",
      "GESCOMPH/Test/Modulo/Business/ModuleServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/ObligationMontServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/PermissionServiceMoreTests.cs",
      "GESCOMPH/Test/Modulo/Business/PermissionServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/PersonServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/PlazasServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/RolServiceTests.cs",
      "GESCOMPH/Test/Modulo/Business/SystemParameterServiceTests.cs",
      "GESCOMPH/Test/Modulo/Data/CityRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/ClauseRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/ContractRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/DepartmentRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/EstablishmentsRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/FormModuleRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/FormRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/ImagesRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/MeRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/ModuleRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/ObligationMonthRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/PermissionRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/PersonRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/PremisesLeasedRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/RefreshTokenRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/RolFormPermissionRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/RolRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/RolUserRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/SystemParameterRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/Data/UserRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/PDF/ContractPdfServiceTests.cs",
      "GESCOMPH/Test/Modulo/RolTest/RolRepositoryTests.cs",
      "GESCOMPH/Test/Modulo/RolTest/RolTest.cs",
      "GESCOMPH/Test/Modulo/Web/AppointmentControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/AuthControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/CityControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/ClauseControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/ContractClauseControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/ContractControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/DepartmentControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/EstablishmentsControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/FormControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/FormModuleControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/ImagesControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/ModuleControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/ObligationMonthsControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/PaymentsControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/PermissionControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/PersonControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/PlazaControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/RolControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/RolFormPermissionControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/RolUserControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/SystemParameterControllerTests.cs",
      "GESCOMPH/Test/Modulo/Web/UserControllerTests.cs",
    ],
  },
  {
    sha: "92475e3",
    repo: "gescomph-api",
    expectedRules: [],
    note: "El bypass CSRF solo se ve leyendo el diff completo — caso paradigma de '🔴 necesita LLM', ninguna regla estructural debe fingir cubrirlo.",
    touchedPaths: [
      "GESCOMPH/Data/Services/SecurityAuthentication/RefreshTokenRepository.cs",
      "GESCOMPH/WebGESCOMPH/Controllers/Module/SecurityAuthentication/AuthController.cs",
    ],
  },
  {
    sha: "db18646",
    repo: "gescomph-api",
    expectedRules: [],
    note: "'refactor' en el mensaje no es señal estructural (principio anti-prefijo) — sin interfaz nueva tocada, ninguna regla dispara.",
    touchedPaths: [
      "GESCOMPH/Business/Services/Business/ObligationMonthService.cs",
      "GESCOMPH/Data/Services/Business/ObligationMonthRepository.cs",
      "GESCOMPH/Entity/Domain/Models/Implements/Business/ObligationMonth.cs",
      "GESCOMPH/Entity/Infrastructure/DataInit/Business/ObligationMonthSeeder .cs",
    ],
  },
  {
    sha: "97942f6",
    repo: "gescomph-api",
    expectedRules: [],
    note: "Un config que revela URLs de despliegue reales — el VALOR importa, no que 'un config cambió'; ninguna regla estructural lo alcanza.",
    touchedPaths: ["GESCOMPH/WebGESCOMPH/appsettings.json"],
  },
  {
    sha: "5d6b4a7",
    repo: "gescomph-api",
    expectedRules: ["INTERFACE_IMPL_DI_PATTERN"],
    note:
      "Hallazgo de precisión, documentado y aceptado (§14j): IEstablishmentsRepository.cs + EstablishmentsRepository.cs " +
      "SÍ están presentes en este bug fix ordinario. La regla no distingue 'introduce un patrón nuevo' de 'toca un " +
      "par interfaz+implementación ya existente' — ambos son estructuralmente idénticos desde CommitSignal. Costo " +
      "aceptable porque el outcome siempre es pending_review, nunca ready: un falso positivo aquí es una revisión " +
      "humana de más, no una memoria mal promovida.",
    touchedPaths: [
      "GESCOMPH/Business/Mapping/Registers/BusinessContractMapping.cs",
      "GESCOMPH/Business/Mapping/Registers/BusinessEstablishmentMapping.cs",
      "GESCOMPH/Business/Services/Business/EstablishmentService.cs",
      "GESCOMPH/Data/Interfaz/IDataImplement/Business/IEstablishmentsRepository.cs",
      "GESCOMPH/Data/Services/Business/EstablishmentsRepository.cs",
      "GESCOMPH/Entity/DTOs/Implements/Utilities/Images/ImageSelectDto.cs",
      "GESCOMPH/Entity/Domain/Models/Implements/Business/Establishment.cs",
      "GESCOMPH/WebGESCOMPH/appsettings.json",
    ],
  },
  {
    sha: "6537bec",
    repo: "gescomph-api",
    expectedRules: [],
    note:
      "Falso negativo conocido del noise filter (§14f) — SÍ llega al extractor. Ninguna regla dispara: diagrama EF " +
      "autogenerado, sin interfaz/test/docs/schema real. El extractor tampoco resuelve este gap, y no debería.",
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
      "Diagrama/Diagram/Clauses.cs",
      "Diagrama/Diagram/CollectionSettings.cs",
      "Diagrama/Diagram/ContractClauses.cs",
      "Diagrama/Diagram/Contracts.cs",
      "Diagrama/Diagram/DATABASECHANGELOG.cs",
      "Diagrama/Diagram/DATABASECHANGELOGLOCK.cs",
      "Diagrama/Diagram/Departments.cs",
      "Diagrama/Diagram/Diagram.csproj",
      "Diagrama/Diagram/Establishments.cs",
      "Diagrama/Diagram/FormModules.cs",
      "Diagrama/Diagram/Forms.cs",
      "Diagrama/Diagram/Images.cs",
      "Diagrama/Diagram/Modules.cs",
      "Diagrama/Diagram/Notifications.cs",
      "Diagrama/Diagram/ObligationMonths.cs",
      "Diagrama/Diagram/PasswordResetCodes.cs",
      "Diagrama/Diagram/Permissions.cs",
      "Diagrama/Diagram/Persons.cs",
      "Diagrama/Diagram/Plazas.cs",
      "Diagrama/Diagram/PremisesLeaseds.cs",
      "Diagrama/Diagram/RefreshToken.cs",
      "Diagrama/Diagram/RolFormPermissions.cs",
      "Diagrama/Diagram/RolUsers.cs",
      "Diagrama/Diagram/Roles.cs",
      "Diagrama/Diagram/SystemParameters.cs",
      "Diagrama/Diagram/TwoFactorCodes.cs",
      "Diagrama/Diagram/Users.cs",
      "Diagrama/Diagram/packages.config",
    ],
  },
];

function toSignal(golden: GoldenCase): CommitSignal {
  return {
    commit: {
      sha: golden.sha,
      message: `commit real ${golden.sha} (${golden.repo})`,
      author: "test",
      timestamp: new Date("2026-01-01"),
      diff: "",
      changedFiles: golden.touchedPaths,
    },
    filesChanged: golden.touchedPaths.length,
    linesAdded: 0,
    linesRemoved: 0,
    recentRelatedCommits: [],
    touchedPaths: golden.touchedPaths,
  };
}

describe("DeterministicCandidateExtractor — golden dataset (18 casos reales, 2 repositorios)", () => {
  const extractor = new DeterministicCandidateExtractor();

  it.each(GOLDEN_DATASET)("$sha ($repo): dispara exactamente $expectedRules", async (golden) => {
    const results = await extractor.extract(toSignal(golden));
    const firedRules = [...new Set(results.map((r) => r.candidate?.source.metadata?.["rule"]))].sort();
    expect(firedRules).toEqual([...golden.expectedRules].sort());
  });

  it("11 de 18 casos no disparan ninguna regla — precisión sobre recall, tal como se decidió", () => {
    const noMatch = GOLDEN_DATASET.filter((g) => g.expectedRules.length === 0);
    expect(noMatch.length).toBeGreaterThanOrEqual(9);
  });
});
