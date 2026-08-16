import { posix } from "node:path";
import type { CodeIndex, DependencyEdge } from "@guerrero-dev/domain";

/**
 * Dependientes de filePath — best-effort, NO resolución de módulos
 * (Fase 6, mapa §2/§8; frontera cerrada en el diseño de 6.2). Solo
 * resuelve targets relativos (`./`, `../`) vía join sintáctico contra
 * `dirname(fromFile)`; si el resultado termina exactamente en el sufijo
 * `.js`, se sustituye ese sufijo por `.ts` (el patrón NodeNext real del
 * repo). No resuelve: paquetes (`@scope/...`), aliases, tsconfig,
 * package.json, index.ts implícito, ni usa ts.Program/type-checker. No
 * modifica `DependencyEdge.target`. Un edge con target de paquete puede
 * existir en `index.edges` sin ser reportado aquí — es la frontera
 * deliberada del contrato, no un defecto.
 */
export function getDependents(index: CodeIndex, filePath: string): readonly DependencyEdge[] {
  return index.edges.filter((edge) => resolvesRelativeTargetTo(edge, filePath));
}

function resolvesRelativeTargetTo(edge: DependencyEdge, filePath: string): boolean {
  if (!edge.target.startsWith("./") && !edge.target.startsWith("../")) {
    return false;
  }
  const joined = posix.normalize(posix.join(posix.dirname(edge.fromFile), edge.target));
  const resolved = joined.endsWith(".js") ? `${joined.slice(0, -3)}.ts` : joined;
  return resolved === filePath;
}
