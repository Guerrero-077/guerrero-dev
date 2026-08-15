import type { CommitSignal } from "../models/CommitSignal.js";
import type { CommitNoiseFilterResult, ICommitNoiseFilter } from "../ports/ICommitNoiseFilter.js";

const BUILD_ARTIFACT_PATTERN = /\.tsbuildinfo$/i;
const GITIGNORE_FILE = ".gitignore";
const EF_GENERATED_EXTENSION_PATTERN = /\.(designer\.cs|edmx(\.diagram)?|tt)$/i;
const TRIVIAL_README_PATH = "README.md";
const TRIVIAL_README_MAX_LINES_CHANGED = 5;

/**
 * `ICommitNoiseFilter` de alta confianza (Fase 4.8, primer incremento de
 * código): tres reglas, cada una justificada por un caso real del golden
 * dataset (`docs/benchmarks/candidate-detection/`), no especuladas.
 * Deliberadamente conservador — "esto es casi seguro ruido", no "esto es
 * arquitectónicamente importante". Sesgo hacia preservar falsos
 * positivos: ante la duda, `discard: false`.
 *
 * No usa umbrales de magnitud como criterio general (`filesChanged`/
 * `linesAdded` grandes o chicos) — el golden dataset mostró que magnitud
 * mide cuánto cambió el texto, no cuánto conocimiento nuevo apareció
 * (`a2dd733`: 8 líneas, señal alta; `6537bec`: 4117 líneas, casi ruido
 * puro). La única regla que usa una cota de líneas (README trivial) es
 * intencionalmente angosta — un solo archivo, un nombre específico, no un
 * umbral general — y queda documentada como el punto más discutible de
 * este filtro, no una decisión definitiva.
 *
 * Reglas, en orden:
 *
 * 1. **Artefactos de build**: el commit solo toca `.gitignore` y/o
 *    archivos `*.tsbuildinfo`, con al menos uno de estos últimos presente.
 *    Caso real: `guerrero-dev/a1dc883.json`.
 * 2. **Archivos generados por herramienta EF/ORM**: el 100% de los
 *    archivos tocados matchea `*.designer.cs`/`*.edmx`/`*.edmx.diagram`/
 *    `*.tt`. Caso real: `guerrero-dev/a1dc883.json` no aplica acá — el
 *    caso real es `gescomph-api/6537bec.json`, aunque esa regla NO
 *    alcanza a cubrirlo completo (ver limitación documentada abajo).
 * 3. **Cambio cosmético trivial de README**: un único archivo `README.md`
 *    con `linesAdded + linesRemoved <= 5`. Casos reales:
 *    `guerrero-dev/93e9cd1.json`, `gescomph-api/ec5f766.json`.
 *
 * **Limitación conocida, medida, no oculta**: `gescomph-api/6537bec.json`
 * (commit "fix diagram mer", 4117 líneas, prácticamente ruido) NO es
 * descartado por este filtro — la mayoría de sus archivos son `.cs` planos
 * generados por una herramienta de diagramación EF, sin una extensión
 * distintiva que los diferencie de código escrito a mano sin acoplarse al
 * layout de directorios de un repositorio específico (`Diagrama/`). Una
 * regla basada en ese path sería efectiva pero no generaliza a otros
 * repos — se documenta como gap conocido en vez de forzar una regla
 * sobreajustada a un solo caso.
 * Ver `docs/benchmarks/candidate-detection/` y
 * `CommitNoiseFilter.goldenDataset.test.ts` para la evaluación completa
 * contra los 23 commits reales.
 */
export class DeterministicCommitNoiseFilter implements ICommitNoiseFilter {
  shouldDiscard(signal: CommitSignal): CommitNoiseFilterResult {
    const { touchedPaths } = signal;

    if (touchedPaths.length > 0) {
      const buildArtifacts = touchedPaths.filter((path) => BUILD_ARTIFACT_PATTERN.test(path));
      const otherFiles = touchedPaths.filter(
        (path) => path !== GITIGNORE_FILE && !BUILD_ARTIFACT_PATTERN.test(path),
      );
      if (buildArtifacts.length > 0 && otherFiles.length === 0) {
        return {
          discard: true,
          reason:
            "Solo toca .gitignore y/o artefactos *.tsbuildinfo — limpieza de build, sin impacto en comportamiento ni arquitectura.",
        };
      }
    }

    if (touchedPaths.length > 0 && touchedPaths.every((path) => EF_GENERATED_EXTENSION_PATTERN.test(path))) {
      return {
        discard: true,
        reason:
          "100% de los archivos tocados son generados por herramienta (*.designer.cs/*.edmx/*.tt) — no escritos a mano.",
      };
    }

    if (
      touchedPaths.length === 1 &&
      touchedPaths[0] === TRIVIAL_README_PATH &&
      signal.linesAdded + signal.linesRemoved <= TRIVIAL_README_MAX_LINES_CHANGED
    ) {
      return {
        discard: true,
        reason:
          "Cambio cosmético trivial a README.md (<=5 líneas), sin impacto en comportamiento ni decisiones.",
      };
    }

    return {
      discard: false,
      reason:
        "No matchea ningún patrón de alta confianza para ruido — se preserva para interpretación (sesgo hacia falsos positivos).",
    };
  }
}
