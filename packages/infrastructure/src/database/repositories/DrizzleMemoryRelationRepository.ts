import { eq, or } from "drizzle-orm";
import type { MemoryRelation } from "@guerrero-dev/domain";
import type { IMemoryRelationRepository } from "@guerrero-dev/application";
import type { DrizzleClient } from "../client.js";
import { MemoryRelationMapper } from "../mappers/MemoryRelationMapper.js";
import { memoryRelations } from "../schema/memoryRelations.js";

/** `IMemoryRelationRepository` sobre Drizzle + la tabla `memory_relations` (migración 0002). */
export class DrizzleMemoryRelationRepository implements IMemoryRelationRepository {
  constructor(private readonly db: DrizzleClient) {}

  async create(relation: MemoryRelation): Promise<MemoryRelation> {
    const [row] = await this.db
      .insert(memoryRelations)
      .values(MemoryRelationMapper.toRow(relation))
      .returning();
    if (!row) {
      throw new Error("INSERT en memory_relations no devolvió ninguna fila");
    }
    return MemoryRelationMapper.toDomain(row);
  }

  async findForMemory(memoryId: string): Promise<MemoryRelation[]> {
    const rows = await this.db
      .select()
      .from(memoryRelations)
      .where(or(eq(memoryRelations.sourceMemoryId, memoryId), eq(memoryRelations.targetMemoryId, memoryId)));
    return rows.map(MemoryRelationMapper.toDomain);
  }
}
