import { randomUUID } from "node:crypto";
import type { ProjectProfile, Technology } from "@guerrero-dev/domain";
import type { IGitTrackedFilesSource } from "../../common/ports/IGitTrackedFilesSource.js";
import type { IProjectIntelligenceRepository } from "../../common/ports/IProjectIntelligenceRepository.js";
import type { IComponentStructureDetector } from "../ports/IComponentStructureDetector.js";
import type { IPackageManifestReader } from "../ports/IPackageManifestReader.js";
import type { IProjectProfileScanner } from "../ports/IProjectProfileScanner.js";
import type { ITechnologyDetector } from "../ports/ITechnologyDetector.js";

const MANIFEST_FILE = "package.json";

/**
 * `IProjectProfileScanner` (Fase 5.7): orquesta `IGitTrackedFilesSource`,
 * `IComponentStructureDetector`, `IPackageManifestReader`,
 * `ITechnologyDetector` e `IProjectIntelligenceRepository` — mismo estilo
 * que `CandidateDetectionService` (Memory Engine, Fase 4.8): coordina el
 * orden, no decide nada por sí misma. 5.7 orquesta; no interpreta el
 * resultado de 5.4/5.5.
 *
 * Lectura de manifiestos secuencial (`for...of`, no `Promise.all`) —
 * decisión de implementación, no obligación del contrato: construye un
 * pipeline de evidencia fácil de razonar, sin evidencia de que el
 * paralelismo haga falta para I/O local pequeña.
 *
 * Todo o nada: cualquier fallo de `IGitTrackedFilesSource` o
 * `IPackageManifestReader` se propaga sin envolver (ninguna de estas dos
 * clases introduce un tipo de error propio) y aborta antes de llegar a
 * `repository.upsert()` — nunca se persiste un perfil parcial.
 */
export class ProjectProfileScanner implements IProjectProfileScanner {
  constructor(
    private readonly gitTrackedFilesSource: IGitTrackedFilesSource,
    private readonly componentStructureDetector: IComponentStructureDetector,
    private readonly packageManifestReader: IPackageManifestReader,
    private readonly technologyDetector: ITechnologyDetector,
    private readonly repository: IProjectIntelligenceRepository,
  ) {}

  async scanProject(projectId: string, repoRoot: string): Promise<ProjectProfile> {
    const scannedAt = new Date();

    const trackedFiles = await this.gitTrackedFilesSource.listTrackedFiles(repoRoot);

    const structure = this.componentStructureDetector.detectStructure(trackedFiles);
    const components = this.componentStructureDetector.detectComponents(trackedFiles);

    const manifestPaths = [
      MANIFEST_FILE,
      ...components.map((component) => `${component.path}/${MANIFEST_FILE}`),
    ];

    const technologies: Technology[] = [...this.technologyDetector.detectFromTrackedFiles(trackedFiles)];
    for (const manifestPath of manifestPaths) {
      const manifest = await this.packageManifestReader.readPackageManifest(repoRoot, manifestPath);
      technologies.push(...this.technologyDetector.detectFromPackageManifest(manifestPath, manifest));
    }

    const profile: ProjectProfile = {
      id: randomUUID(),
      projectId,
      schemaVersion: 1,
      scannedAt,
      technologies,
      components,
      dependencies: [],
      structure,
      configuration: {},
    };

    return this.repository.upsert(profile);
  }
}
