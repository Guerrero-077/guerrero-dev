import { customType, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { memories } from "./memories.js";

/**
 * `vector(N)` como `customType` (Fase 4.5 §14c): esta versión de
 * drizzle-orm (0.38.x) no tiene un tipo `vector` nativo para pgvector, así
 * que se define acá con la serialización explícita:
 *
 * - `toDriver`: `number[]` -> `"[0.1,0.2,...]"`, el formato de texto que
 *   pgvector castea implícitamente al insertar/actualizar.
 * - `fromDriver`: el driver `pg` no tiene un parser registrado para el OID
 *   de `vector` (es un tipo de extensión, no built-in), así que PostgreSQL
 *   lo devuelve como el mismo texto `"[0.1,0.2,...]"` — se parsea acá.
 *
 * `dimensions` queda fijo en la definición de columna (no es un parámetro
 * de runtime): cambiar de modelo/dimensión implica una migración nueva, tal
 * como quedó documentado en la migración 0003.
 */
function vector(dimensions: number) {
  return customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${dimensions})`;
    },
    toDriver(value) {
      return `[${value.join(",")}]`;
    },
    fromDriver(value) {
      return value
        .slice(1, -1)
        .split(",")
        .filter((v) => v.length > 0)
        .map(Number);
    },
  });
}

/**
 * Debe reflejar exactamente la migración 0002_memory_tables.sql +
 * 0003_memory_embeddings_vector.sql (Fase 4.3 + Fase 4.5). `provider` +
 * `model` + `dimensions` identifican el origen del vector — ver JSDoc de
 * `MemoryEmbedding` en `@guerrero-dev/domain` para el razonamiento completo.
 */
export const memoryEmbeddings = pgTable("memory_embeddings", {
  id: uuid("id").primaryKey().defaultRandom(),
  memoryId: uuid("memory_id")
    .notNull()
    .references(() => memories.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  model: text("model").notNull(),
  dimensions: integer("dimensions").notNull(),
  embedding: vector(1024)("embedding").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
