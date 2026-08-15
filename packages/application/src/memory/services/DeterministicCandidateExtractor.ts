import type { MemoryCandidate, MemoryType } from "@guerrero-dev/domain";
import type { CandidateExtractionResult } from "../models/CandidateExtractionResult.js";
import type { CommitSignal } from "../models/CommitSignal.js";
import type { ICandidateExtractor } from "../ports/ICandidateExtractor.js";

/**
 * Identificadores estables de las cinco reglas deterministas (Fase 4.8.4).
 * Viven exclusivamente en `MemoryCandidate.source.metadata.rule` — NO se
 * agregó un campo `ruleName` al contrato de `CandidateExtractionResult`
 * (decisión explícita: no ampliar un contrato por estética cuando
 * `metadata` ya cubre la trazabilidad). Cambiar la redacción de `reason`
 * no debe romper nada que dependa de identificar qué regla disparó.
 */
export type DeterministicCandidateRuleName =
  "ADR_PATH" | "DOCS_PATH" | "SCHEMA_PATH" | "INTERFACE_IMPL_DI_PATTERN" | "TEST_PATH_PATTERN";

/**
 * Baseline sin tunear, no una estimación calculada por regla (decisión
 * deliberada, ver `docs/fase-4-memory-engine.md` §14j): cada regla
 * identifica que existe evidencia estructural suficiente para *proponer*
 * una candidata, no que su contenido sea semánticamente correcto. Inventar
 * confidence/importance distintos por regla sin evidencia real de que esos
 * números importan sería la misma trampa que ya se evitó con los
 * thresholds del noise filter. Se revisita si el proceso de revisión
 * humana (`pending_review`) genera evidencia de que hace falta diferenciar.
 */
const BASELINE_CONFIDENCE = 0.5;
const BASELINE_IMPORTANCE = 0.5;

const ADR_DIR = "docs/adr";
const DOCS_DIR = "docs";
const SCHEMA_DIRS = ["database/migrations", "database/schema"];

/** `path` está bajo `dir`, ya sea en la raíz del repo o anidado en un subpaquete. */
function isUnderDir(path: string, dir: string): boolean {
  return path === dir || path.startsWith(`${dir}/`) || path.includes(`/${dir}/`);
}

function fileNameWithoutExtension(path: string): string {
  const file = path.slice(path.lastIndexOf("/") + 1);
  return file.replace(/\.[^.]+$/, "");
}

interface RuleMatch {
  readonly rule: DeterministicCandidateRuleName;
  readonly type: MemoryType;
  readonly matchedPaths: readonly string[];
  readonly fact: string;
}

function buildResult(signal: CommitSignal, match: RuleMatch): CandidateExtractionResult {
  const candidate: MemoryCandidate = {
    type: match.type,
    // Sin projectId disponible en CommitSignal/CommitSnapshot todavía — se
    // asume scope global hasta que exista un caso de uso real que inyecte
    // el proyecto (mismo criterio que "no IIdGenerator sin evidencia").
    scope: "global",
    projectId: null,
    content:
      `${match.fact} Commit ${signal.commit.sha.slice(0, 7)}: "${signal.commit.message}". ` +
      "Contenido no verificado semánticamente — revisar el diff antes de confirmar.",
    confidence: BASELINE_CONFIDENCE,
    importance: BASELINE_IMPORTANCE,
    source: {
      sourceType: "commit",
      sourceReference: signal.commit.sha,
      excerpt: signal.commit.message,
      metadata: { rule: match.rule, matchedPaths: match.matchedPaths },
    },
  };

  return {
    // Ninguna de las cinco reglas afirma que el contenido es correcto,
    // solo que hay evidencia estructural suficiente para proponerlo —
    // "ready" implicaría una certeza que ninguna regla determinista tiene.
    outcome: "pending_review",
    candidate,
    riskSignals: [],
    reason: match.fact,
  };
}

/**
 * `docs/adr/**` (en cualquier nivel del monorepo). Señal fuerte por sí
 * sola: un ADR es, por definición, una decisión arquitectónica formal.
 * Verificado contra `2e3240e` (2 ADRs + `.editorconfig`, no requiere el
 * 100% de los paths).
 */
function adrPathRule(signal: CommitSignal): CandidateExtractionResult | null {
  const matched = signal.touchedPaths.filter((p) => isUnderDir(p, ADR_DIR));
  if (matched.length === 0) return null;

  return buildResult(signal, {
    rule: "ADR_PATH",
    type: "decision",
    matchedPaths: matched,
    fact: `El commit modifica Architecture Decision Record(s): ${matched.join(", ")}.`,
  });
}

/**
 * `docs/**` excluyendo ADR — requiere que TODOS los `touchedPaths` estén
 * bajo `docs/` (no solo alguno), a diferencia de `ADR_PATH`. Necesario
 * para no disparar en commits donde `docs/` es un cambio incidental junto
 * a trabajo real en otras capas — verificado contra `4a631af` (35
 * archivos, 1 solo bajo `docs/`): con el requisito de "todos", NO dispara,
 * correctamente. Verificado positivo contra `523be5e`/`666edb9` (100% del
 * commit bajo `docs/`).
 */
function docsPathRule(signal: CommitSignal): CandidateExtractionResult | null {
  if (signal.touchedPaths.length === 0) return null;
  const anyAdr = signal.touchedPaths.some((p) => isUnderDir(p, ADR_DIR));
  const allDocs = signal.touchedPaths.every((p) => isUnderDir(p, DOCS_DIR));
  if (anyAdr || !allDocs) return null;

  return buildResult(signal, {
    rule: "DOCS_PATH",
    type: "knowledge",
    matchedPaths: signal.touchedPaths,
    fact: `El commit es exclusivamente documentación: ${signal.touchedPaths.join(", ")}.`,
  });
}

/**
 * `database/migrations/**` o `database/schema/**`. Deliberadamente
 * produce `type: "fact"`, NUNCA `"decision"` — que exista una migración no
 * significa que sea una decisión arquitectónicamente significativa (eso
 * requiere leer qué constraint/índice cambió). Verificado contra `bf7f9fb`.
 */
function schemaPathRule(signal: CommitSignal): CandidateExtractionResult | null {
  const matched = signal.touchedPaths.filter((p) => SCHEMA_DIRS.some((dir) => isUnderDir(p, dir)));
  if (matched.length === 0) return null;

  return buildResult(signal, {
    rule: "SCHEMA_PATH",
    type: "fact",
    matchedPaths: matched,
    fact: `El commit modifica schema/migraciones de base de datos: ${matched.join(", ")}.`,
  });
}

const INTERFACE_FILE_PATTERN = /(?:^|\/)I([A-Z][A-Za-z0-9]*)\.(?:cs|ts)$/;

/**
 * Un archivo `I<Nombre>.(cs|ts)` + otro archivo tocado cuyo nombre
 * (sin extensión) contiene `<Nombre>` — el patrón puerto+adapter/interfaz+
 * implementación (`MemoryType: "pattern"`, coincide literalmente con el
 * ejemplo de `pattern` en el JSDoc del dominio: "Repository + Service").
 *
 * Deliberadamente NO exige un archivo de registro DI separado: verificado
 * contra `a384c61` (gescomph-api), que solo modifica `Program.cs`
 * directamente, sin un `*Extensions.cs`/`*DependencyInjection.cs` dedicado
 * — exigirlo habría dejado ese caso real fuera. El nombre del
 * implementador tampoco necesita ser exactamente `<Nombre>`: en `a384c61`,
 * `IObligationNotifier` se implementa en `SignalRObligationNotifier.cs`
 * (contiene el nombre base, no lo iguala) — por eso el match es por
 * substring, no por igualdad.
 *
 * Verificado además contra `a7942f0` (`IMercadoPagoService` +
 * `MercadoPagoService.cs` + `MercadoPagoServiceCollectionExtensions.cs`,
 * match exacto) y, cruzando a un repositorio distinto, contra `4a631af`
 * (`IProjectRepository.ts` + `DrizzleProjectRepository.ts`) y `bf7f9fb`
 * (`IMemoryRepository.ts`/`IMemorySourceRepository.ts`/
 * `IMemoryRelationRepository.ts` + sus `Drizzle*Repository.ts`) en
 * `guerrero-dev` mismo — la misma regla generaliza al patrón puerto+adapter
 * de este propio proyecto, no solo al caso .NET que la motivó.
 */
function interfaceImplDiPatternRule(signal: CommitSignal): CandidateExtractionResult | null {
  const matches: Array<{ interfacePath: string; implPath: string; baseName: string }> = [];

  for (const path of signal.touchedPaths) {
    const match = INTERFACE_FILE_PATTERN.exec(path);
    if (!match) continue;
    const baseName = match[1]!;

    const implPath = signal.touchedPaths.find(
      (other) => other !== path && fileNameWithoutExtension(other).includes(baseName),
    );
    if (implPath) matches.push({ interfacePath: path, implPath, baseName });
  }

  if (matches.length === 0) return null;

  const matchedPaths = matches.flatMap((m) => [m.interfacePath, m.implPath]);
  const description = matches.map((m) => `${m.interfacePath} -> ${m.implPath}`).join("; ");

  return buildResult(signal, {
    rule: "INTERFACE_IMPL_DI_PATTERN",
    type: "pattern",
    matchedPaths,
    fact: `El commit introduce o modifica el patrón interfaz+implementación: ${description}.`,
  });
}

const TEST_PATH_REGEX = /(^|\/)(tests?|__tests__)(\/|$)/i;
const TEST_FILE_REGEX = /\.(test|spec)\.[jt]sx?$/i;
const TEST_CS_REGEX = /Tests?\.cs$/i;

function isTestPath(path: string): boolean {
  return TEST_PATH_REGEX.test(path) || TEST_FILE_REGEX.test(path) || TEST_CS_REGEX.test(path);
}

/**
 * Mayoría (>50%) de `touchedPaths` bajo convención de tests. NO exige el
 * 100%: verificado contra `bb705ac` (64 archivos, 63 tests + 1 archivo de
 * producción tocado incidentalmente — exigir 100% lo habría excluido).
 * El umbral de mayoría simple (no un porcentaje ajustado, p. ej. 90%) es
 * el criterio más simple que separa correctamente `bb705ac` (~98% tests)
 * de `a384c61` (12.5% tests, 1 de 8 archivos) — no se ajustó a un número
 * exacto de ninguno de los dos casos.
 */
function testPathPatternRule(signal: CommitSignal): CandidateExtractionResult | null {
  if (signal.touchedPaths.length === 0) return null;
  const testPaths = signal.touchedPaths.filter(isTestPath);
  if (testPaths.length <= signal.touchedPaths.length / 2) return null;

  return buildResult(signal, {
    rule: "TEST_PATH_PATTERN",
    type: "pattern",
    matchedPaths: testPaths,
    fact: `El commit es mayoritariamente de tests (${testPaths.length}/${signal.touchedPaths.length} archivos).`,
  });
}

const RULES: ReadonlyArray<(signal: CommitSignal) => CandidateExtractionResult | null> = [
  adrPathRule,
  docsPathRule,
  schemaPathRule,
  interfaceImplDiPatternRule,
  testPathPatternRule,
];

/**
 * Primera implementación de `ICandidateExtractor` (Fase 4.8.4): cinco
 * reglas estructurales, cada una respaldada por ≥2 casos reales de al
 * menos dos repositorios distintos (`guerrero-dev` + `gescomph-api`).
 * Deliberadamente "aburrido" — sin Git adicional, sin DB, sin LLM, sin
 * inferencia semántica, sin tocar `CommitSignal`. Evalúa las cinco reglas
 * de forma independiente contra el mismo `CommitSignal`: un commit puede
 * producir 0, 1, o varias candidatas (p. ej. `4a631af` dispara
 * `SCHEMA_PATH` + `INTERFACE_IMPL_DI_PATTERN` simultáneamente).
 *
 * Regla de oro aplicada: si una regla no puede defenderse únicamente con
 * evidencia estructural de `CommitSignal`, no está aquí. De los 23 casos
 * del golden dataset, 11 quedan deliberadamente sin ninguna candidata
 * (devuelven `[]`) — "no sé" es preferible a inventar, ver
 * `docs/fase-4-memory-engine.md` §14j para la matriz completa de decisión.
 */
export class DeterministicCandidateExtractor implements ICandidateExtractor {
  async extract(signal: CommitSignal): Promise<readonly CandidateExtractionResult[]> {
    const results: CandidateExtractionResult[] = [];
    for (const rule of RULES) {
      const result = rule(signal);
      if (result !== null) results.push(result);
    }
    return results;
  }
}
