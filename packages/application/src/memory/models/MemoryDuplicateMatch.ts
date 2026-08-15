/**
 * Resultado de `IMemoryCandidateDeduplicator.findDuplicate` (Fase 4.7):
 * no alcanza con devolver el `memoryId` del duplicado, se conserva también
 * la evidencia (`similarity`) para debugging, métricas y políticas futuras
 * (por ejemplo, un umbral distinto según el tipo de memoria).
 */
export interface MemoryDuplicateMatch {
  readonly memoryId: string;
  readonly similarity: number;
}
