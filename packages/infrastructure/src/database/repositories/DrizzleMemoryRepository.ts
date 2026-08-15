import { desc, eq } from "drizzle-orm";
import type { Memory } from "@guerrero-dev/domain";
import type { IMemoryRepository } from "@guerrero-dev/application";
import type { DrizzleClient } from "../client.js";
import { MemoryMapper } from "../mappers/MemoryMapper.js";
import { memories } from "../schema/memories.js";

/** `IMemoryRepository` sobre Drizzle + la tabla `memories` (migración 0002). */
export class DrizzleMemoryRepository implements IMemoryRepository {
  constructor(private readonly db: DrizzleClient) {}

  async create(memory: Memory): Promise<Memory> {
    const [row] = await this.db.insert(memories).values(MemoryMapper.toRow(memory)).returning();
    if (!row) {
      throw new Error("INSERT en memories no devolvió ninguna fila");
    }
    return MemoryMapper.toDomain(row);
  }

  async findById(id: string): Promise<Memory | null> {
    const [row] = await this.db.select().from(memories).where(eq(memories.id, id));
    return row ? MemoryMapper.toDomain(row) : null;
  }

  async update(memory: Memory): Promise<Memory> {
    const [row] = await this.db
      .update(memories)
      .set(MemoryMapper.toRow(memory))
      .where(eq(memories.id, memory.id))
      .returning();
    if (!row) {
      throw new Error(`No existe memory ${memory.id} para actualizar`);
    }
    return MemoryMapper.toDomain(row);
  }

  async findByProject(projectId: string): Promise<Memory[]> {
    const rows = await this.db
      .select()
      .from(memories)
      .where(eq(memories.projectId, projectId))
      .orderBy(desc(memories.createdAt));
    return rows.map(MemoryMapper.toDomain);
  }

  async invalidate(id: string, _reason: string): Promise<void> {
    await this.db
      .update(memories)
      .set({ status: "invalidated", updatedAt: new Date() })
      .where(eq(memories.id, id));
  }
}
