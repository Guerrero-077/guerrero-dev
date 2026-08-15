-- Fase 4.3 — Memory Engine: persistencia (docs/fase-4-memory-engine.md).
--
-- Domain -> Application ports -> Infrastructure -> PostgreSQL, nunca al
-- revés: este schema es un mapping del dominio (packages/infrastructure/
-- src/database/mappers/), no el dominio en sí.
--
-- confidence/importance en DOUBLE PRECISION, no REAL: JS y PostgreSQL usan
-- IEEE 754 de 64 bits, así que valores como 0.87 hacen round-trip
-- bit-exacto. REAL (float4) perdería precisión en el camino de vuelta —
-- ver docs/fase-4-memory-engine.md §18 (round-trip sin pérdida).
--
-- session_id no se agrega todavía a `memories`: primero se valida el
-- lifecycle global/project (Fase 4.1 §3).
--
-- CHECK constraints como defensa en profundidad (Fase 4.3 §3): el dominio
-- ya valida confidence/importance/scope-projectId (ver
-- packages/domain/src/memory/MemoryInvariants.ts), pero PostgreSQL no
-- debe confiar ciegamente en que todo insert pasó por ahí.

CREATE TABLE IF NOT EXISTS memories (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id         UUID NULL REFERENCES projects(id) ON DELETE CASCADE,
    scope              TEXT NOT NULL,
    type               TEXT NOT NULL,
    content            TEXT NOT NULL,
    status             TEXT NOT NULL,
    confidence         DOUBLE PRECISION NOT NULL,
    importance         DOUBLE PRECISION NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_verified_at   TIMESTAMPTZ NULL,
    expires_at         TIMESTAMPTZ NULL,

    CONSTRAINT memories_confidence_range CHECK (confidence >= 0 AND confidence <= 1),
    CONSTRAINT memories_importance_range CHECK (importance >= 0 AND importance <= 1),
    CONSTRAINT memories_scope_valid CHECK (scope IN ('global', 'project', 'session')),
    CONSTRAINT memories_type_valid CHECK (
        type IN ('fact', 'decision', 'preference', 'pattern', 'experience', 'knowledge')
    ),
    CONSTRAINT memories_status_valid CHECK (
        status IN ('candidate', 'active', 'superseded', 'invalidated', 'archived')
    ),
    -- global -> sin proyecto; project/session -> con proyecto (Fase 4.1 §3,
    -- isScopeConsistent en el dominio).
    CONSTRAINT memories_scope_project_consistency CHECK (
        (scope = 'global' AND project_id IS NULL) OR
        (scope IN ('project', 'session') AND project_id IS NOT NULL)
    )
);

-- Índices sobre columnas de filtro reales (Fase 4.3 §14), no "por si
-- acaso" (§15): project_id/status/type/scope se usan en findByProject y en
-- el retrieval de Fase 4.6+; el compuesto cubre la consulta más frecuente
-- ("memorias activas de este proyecto").
CREATE INDEX IF NOT EXISTS memories_project_id_idx ON memories (project_id);
CREATE INDEX IF NOT EXISTS memories_status_idx ON memories (status);
CREATE INDEX IF NOT EXISTS memories_type_idx ON memories (type);
CREATE INDEX IF NOT EXISTS memories_scope_idx ON memories (scope);
CREATE INDEX IF NOT EXISTS memories_project_status_idx ON memories (project_id, status);

CREATE TABLE IF NOT EXISTS memory_sources (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id          UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    source_type        TEXT NOT NULL,
    source_reference   TEXT NOT NULL,
    excerpt            TEXT NULL,
    metadata           JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT memory_sources_source_type_valid CHECK (
        source_type IN ('repository', 'file', 'commit', 'conversation', 'test', 'agent_observation', 'manual')
    )
);

CREATE INDEX IF NOT EXISTS memory_sources_memory_id_idx ON memory_sources (memory_id);

CREATE TABLE IF NOT EXISTS memory_relations (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_memory_id   UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    target_memory_id   UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    relation_type      TEXT NOT NULL,
    confidence         DOUBLE PRECISION NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT memory_relations_type_valid CHECK (
        relation_type IN ('supports', 'contradicts', 'supersedes', 'derived_from', 'related_to')
    ),
    CONSTRAINT memory_relations_confidence_range CHECK (confidence >= 0 AND confidence <= 1),
    -- Una memoria no puede relacionarse consigo misma (Fase 4.3 §5).
    CONSTRAINT memory_relations_no_self_relation CHECK (source_memory_id <> target_memory_id)
);

CREATE INDEX IF NOT EXISTS memory_relations_source_idx ON memory_relations (source_memory_id);
CREATE INDEX IF NOT EXISTS memory_relations_target_idx ON memory_relations (target_memory_id);

-- Estructura provisional (Fase 4.3 §6-9): `embedding vector` sin dimensión
-- fija todavía. No se crea índice HNSW/IVFFlat ni se expone
-- repository/mapper para esta tabla hasta Fase 4.4, cuando se elija el
-- embedding provider real y se sepa si es vector(768)/vector(1024)/
-- vector(1536).
CREATE TABLE IF NOT EXISTS memory_embeddings (
    id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    memory_id          UUID NOT NULL REFERENCES memories(id) ON DELETE CASCADE,
    model              TEXT NOT NULL,
    dimensions         INTEGER NOT NULL,
    embedding          vector NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_embeddings_memory_id_idx ON memory_embeddings (memory_id);
