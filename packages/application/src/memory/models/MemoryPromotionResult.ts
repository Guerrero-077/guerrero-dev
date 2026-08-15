/**
 * Resultado de `IMemoryCandidatePromoter.promote` (Fase 4.7).
 *
 * `action` describe únicamente qué pasó con el registro `Memory` en sí —
 * `created` | `updated` | `rejected`. No existe una acción `"duplicate"` a
 * propósito: un duplicado no crea una `Memory` nueva, actualiza la
 * existente (`lastVerifiedAt`/`confidence`) y le agrega una `MemorySource`
 * nueva, es decir `action: "updated"` con `memoryId` apuntando a
 * `evaluation.duplicateOf`.
 *
 * `conflictRelationsCreated` es un efecto **independiente** de `action`,
 * no una acción alternativa: `evaluation.duplicateOf` y
 * `evaluation.conflictsWith` no son mutuamente excluyentes (ver JSDoc de
 * `evaluationOutcome` en `MemoryEvaluation.ts`), así que un candidato puede
 * perfectamente actualizar una memoria duplicada (`action: "updated"`) Y
 * crear una o más `MemoryRelation` de tipo `contradicts` (Fase 4.2) al
 * mismo tiempo. Este campo lista los `id` de las memorias contra las que
 * se creó una relación de conflicto — vacío si no hubo ninguna.
 */
export interface MemoryPromotionResult {
  readonly action: "created" | "updated" | "rejected";
  readonly memoryId: string | null;
  readonly conflictRelationsCreated: readonly string[];
}
