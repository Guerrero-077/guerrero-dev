import type { LiteralMatch } from "@guerrero-dev/domain";
import type { ICodeLiteralSearch, IFileReader, IGitTrackedFilesSource } from "@guerrero-dev/application";
import { findLiteralMatches } from "./findLiteralMatches.js";

const TS_EXTENSION = ".ts";

/**
 * Implementación de `ICodeLiteralSearch` (Fase 6.4) — búsqueda de texto
 * plano sobre los `.ts` trackeados, sin AST, sin `ts-morph`: un `.ts` con
 * sintaxis inválida sigue siendo texto válido para este caso de uso, a
 * diferencia de `TsMorphCodeAnalyzer` (6.3). Reutiliza exactamente los
 * mismos dos puertos que 6.3 (`IGitTrackedFilesSource` + `IFileReader`),
 * mismo filtro a `.ts` (mapa §4).
 *
 * Orden: el que devuelve `IGitTrackedFilesSource`, sin sort propio — el
 * puerto no promete orden por contrato, pero `git ls-files` es
 * determinista para un mismo estado de repo, mismo criterio ya aplicado
 * en `TsMorphCodeAnalyzer` (6.3).
 *
 * `repoRoot` es parámetro de `search()`, no del constructor — sin
 * estado, se reutiliza contra N repositorios.
 */
export class LiteralCodeSearch implements ICodeLiteralSearch {
  constructor(
    private readonly trackedFilesSource: IGitTrackedFilesSource,
    private readonly fileReader: IFileReader,
  ) {}

  async search(repoRoot: string, query: string): Promise<readonly LiteralMatch[]> {
    const trackedFiles = await this.trackedFilesSource.listTrackedFiles(repoRoot);
    const tsFiles = trackedFiles.filter((file) => file.endsWith(TS_EXTENSION));

    const matches: LiteralMatch[] = [];
    for (const filePath of tsFiles) {
      const content = await this.fileReader.readFile(repoRoot, filePath);
      matches.push(...findLiteralMatches(content, filePath, query));
    }

    return matches;
  }
}
