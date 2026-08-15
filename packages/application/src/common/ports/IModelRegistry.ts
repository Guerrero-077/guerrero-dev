import type { HardwareProfile, ModelDescriptor, TaskModelRequirements } from "@guerrero-dev/domain";

/**
 * Registro central de modelos conocidos (locales y cloud), usado para
 * elegir el mejor modelo disponible dada una tarea y el hardware actual
 * (Adaptive Model Routing, Fase 2 §20).
 */
export interface IModelRegistry {
  register(model: ModelDescriptor): void;

  all(): ModelDescriptor[];

  selectBestModel(
    requirements: TaskModelRequirements,
    hardware: HardwareProfile,
  ): ModelDescriptor | undefined;
}
