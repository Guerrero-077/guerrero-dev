import { eq } from "drizzle-orm";
import type { MemorySource } from "@guerrero-dev/domain";
import type { IMemorySourceRepository } from "@guerrero-dev/application";
import type { DrizzleClient } from "../client.js";
import { MemorySourceMapper } from "../mappers/MemorySourceMapper.js";
import { memorySources } from "../schema/memorySources.js";

/** `IMemorySourceRepository` sobre Drizzle + la tabla `memory_sources` (migración 0002). */
export class DrizzleMemorySourceRepository implements IMemorySourceRepository {
  constructor(private readonly db: DrizzleClient) {}

  async add(source: MemorySource): Promise<MemorySource> {
    const [row] = await this.db.insert(memorySources).values(MemorySourceMapper.toRow(source)).returning();
    if (!row) {
      throw new Error("INSERT en memory_sources no devolvió ninguna fila");
    }
    return MemorySourceMapper.toDomain(row);
  }

  async findByMemory(memoryId: string): Promise<MemorySource[]> {
    const rows = await this.db.select().from(memorySources).where(eq(memorySources.memoryId, memoryId));
    return rows.map(MemorySourceMapper.toDomain);
  }
}
