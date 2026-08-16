/**
 * application/project-intelligence
 *
 * Construcción/consulta de conocimiento derivado del proyecto (Fase 5) —
 * distinto de `projects/`, que son operaciones CRUD sobre la entidad
 * `Project`. `DeterministicTechnologyDetector` (Fase 5.4): reglas
 * deterministas que convierten manifiestos/evidencia de archivos en
 * `Technology[]`. No vive en `packages/project-intelligence` (ese paquete
 * standalone está reservado para el análisis profundo de código de Fase 6
 * — AST, símbolos, grafo de dependencias, RAG).
 */
export * from "./models/index.js";
export * from "./ports/index.js";
export * from "./services/index.js";
