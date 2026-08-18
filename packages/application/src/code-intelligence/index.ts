/**
 * application/code-intelligence
 *
 * Superficie de consulta sobre CodeIndex (Fase 6, mapa §8): puertos de
 * extracción/búsqueda (ports/) y funciones puras de consulta (queries/)
 * sobre un CodeIndex ya construido. Ningún archivo de esta carpeta
 * depende de ts-morph/typescript ni de infraestructura — eso es
 * responsabilidad exclusiva de infrastructure/code-intelligence (6.3).
 */
export * from "./models/index.js";
export * from "./ports/index.js";
export * from "./queries/index.js";
export * from "./services/index.js";
