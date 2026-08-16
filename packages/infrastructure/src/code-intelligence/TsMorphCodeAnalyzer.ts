import { Project } from "ts-morph";
import type { SourceFile } from "ts-morph";
import type { CodeIndex } from "@guerrero-dev/domain";
import type { ICodeAnalyzer, IFileReader, IGitTrackedFilesSource } from "@guerrero-dev/application";
import { extractEdges } from "./extractEdges.js";
import { extractSymbols } from "./extractSymbols.js";
import { TsMorphCodeAnalyzerError } from "./TsMorphCodeAnalyzerError.js";

const TS_EXTENSION = ".ts";

interface ParsedFile {
  readonly filePath: string;
  readonly sourceFile: SourceFile;
}

/**
 * Implementación de `ICodeAnalyzer` (Fase 6.3) vía `ts-morph`, en un
 * `Project` in-memory alimentado exclusivamente por
 * `IGitTrackedFilesSource` + `IFileReader` — nunca toca disco ni
 * `tsconfig.json` real (mapa §9). Análisis puramente sintáctico: nunca
 * invoca `getTypeChecker()`/`getSemanticDiagnostics()`;
 * `getProgram().getSyntacticDiagnostics()` se usa exclusivamente para
 * detectar sintaxis inválida (mapa §9, precisión de 6.3).
 *
 * `repoRoot` es parámetro de `analyze()`, no del constructor — mismo
 * criterio que `IGitTrackedFilesSource`/`IFileReader`: sin estado, se
 * reutiliza contra N repositorios.
 */
export class TsMorphCodeAnalyzer implements ICodeAnalyzer {
  constructor(
    private readonly trackedFilesSource: IGitTrackedFilesSource,
    private readonly fileReader: IFileReader,
  ) {}

  async analyze(repoRoot: string): Promise<CodeIndex> {
    const trackedFiles = await this.trackedFilesSource.listTrackedFiles(repoRoot);
    const tsFiles = trackedFiles.filter((file) => file.endsWith(TS_EXTENSION));

    const project = new Project({ useInMemoryFileSystem: true, skipAddingFilesFromTsConfig: true });
    const parsedFiles: ParsedFile[] = [];
    for (const filePath of tsFiles) {
      const content = await this.fileReader.readFile(repoRoot, filePath);
      const sourceFile = project.createSourceFile(filePath, content, { overwrite: true });
      parsedFiles.push({ filePath, sourceFile });
    }

    this.assertValidSyntax(project, parsedFiles);

    const symbols = parsedFiles.flatMap(({ filePath, sourceFile }) => extractSymbols(sourceFile, filePath));
    const edges = parsedFiles.flatMap(({ filePath, sourceFile }) => extractEdges(sourceFile, filePath));

    return { symbols, edges };
  }

  private assertValidSyntax(project: Project, parsedFiles: readonly ParsedFile[]): void {
    const program = project.getProgram();
    for (const { filePath, sourceFile } of parsedFiles) {
      const diagnostics = program.getSyntacticDiagnostics(sourceFile);
      if (diagnostics.length > 0) {
        const details = diagnostics.map((diagnostic) => diagnostic.getMessageText()).join("; ");
        throw new TsMorphCodeAnalyzerError(
          "syntax_error",
          `"${filePath}" contiene sintaxis inválida: ${details}`,
          diagnostics,
        );
      }
    }
  }
}
