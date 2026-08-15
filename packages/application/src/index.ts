/**
 * @guerrero-dev/application
 *
 * Casos de uso, organizados por capacidad (Fase 3.5): agent/, projects/,
 * memory/, analysis/. Los servicios dependen de puertos definidos en
 * common/ports (IProjectRepository, IMemoryStore, ILLMProvider,
 * IExecutionEngine, IPolicyEngine, IModelRegistry), nunca de
 * implementaciones concretas de infrastructure.
 */
export * from "./agent/index.js";
export * from "./analysis/index.js";
export * from "./common/index.js";
export * from "./memory/index.js";
export * from "./projects/index.js";
