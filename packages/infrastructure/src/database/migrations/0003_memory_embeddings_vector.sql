-- Fase 4.5 — Memory Engine: embedding persistence (docs/fase-4-memory-engine.md
-- §14/§14b/§14c). Cierra lo que 0002_memory_tables.sql dejó deliberadamente
-- provisional: `memory_embeddings.embedding` pasa de `vector` (sin
-- dimensión) a `vector(1024)`, y se agrega `provider`.
--
-- 1024 no es un número arbitrario: es la dimensión de qwen3-embedding:4b
-- (vía MRL) tal como quedó decidido y medido en Fase 4.4 — Recall@5 100%,
-- MRR 0.875 sobre un corpus real de 14 memorias (ver §14b). Cambiar de
-- modelo/dimensión en el futuro requiere una migración nueva, no un ALTER
-- silencioso de esta columna.
--
-- ALTER COLUMN ... TYPE vector(1024) asume la tabla vacía (cierto en todos
-- los entornos hasta ahora: no existía repository ni mapper antes de esta
-- fase, así que nada pudo haber insertado filas). Si en algún momento hay
-- datos reales antes de correr esta migración, hace falta un backfill
-- explícito, no este ALTER directo.

ALTER TABLE memory_embeddings
    ADD COLUMN provider TEXT NOT NULL DEFAULT 'ollama';

ALTER TABLE memory_embeddings
    ALTER COLUMN provider DROP DEFAULT;

-- Solo 'ollama' por ahora (Fase 4.4 §14b: single provider, sin proveedores
-- cloud todavía). Agregar un proveedor nuevo es una migración explícita que
-- extiende este CHECK, no un valor libre.
ALTER TABLE memory_embeddings
    ADD CONSTRAINT memory_embeddings_provider_valid CHECK (provider IN ('ollama'));

ALTER TABLE memory_embeddings
    ALTER COLUMN embedding TYPE vector(1024);

-- HNSW con distancia coseno: el provider (OllamaEmbeddingProvider) devuelve
-- vectores L2-normalizados y el benchmark de Fase 4.4 midió cosine
-- similarity, así que `vector_cosine_ops` es la métrica consistente con
-- cómo se generaron y evaluaron los embeddings — no una eleccion default.
--
-- Sin tuning de m/ef_construction/ef_search todavía (Fase 4.5 §14c): no hay
-- volumen real ni consultas reales para justificar ajustar esos parámetros
-- por encima de los defaults de pgvector. Eso se revisita en Fase 4.6
-- (Retrieval), cuando exista tráfico de búsqueda real que medir.
CREATE INDEX IF NOT EXISTS memory_embeddings_embedding_hnsw_idx
    ON memory_embeddings USING hnsw (embedding vector_cosine_ops);
