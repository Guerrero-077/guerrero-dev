-- Fase 3.7 — schema inicial (Fase 2 §5: PostgreSQL + pgvector, una sola DB).
-- Dimensión de embeddings fijada a 768 (nomic-embed-text / modelos similares
-- servidos por Ollama). Ajustar si se elige otro modelo de embeddings.

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS projects (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    root_path   TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS agent_sessions (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status      TEXT NOT NULL DEFAULT 'idle',
    engine      TEXT NOT NULL,
    model_name  TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tool_requests (
    id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id    UUID NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
    tool_name     TEXT NOT NULL,
    input         JSONB NOT NULL,
    requested_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS policy_decisions (
    tool_request_id  UUID PRIMARY KEY REFERENCES tool_requests(id) ON DELETE CASCADE,
    allowed          BOOLEAN NOT NULL,
    risk_level       TEXT NOT NULL,
    reason           TEXT NOT NULL,
    decided_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Memoria (Fase 4). Se crea desde ya para no romper compatibilidad más
-- adelante, aunque el package `memory` todavía no la usa.
CREATE TABLE IF NOT EXISTS memory_records (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id  UUID REFERENCES projects(id) ON DELETE CASCADE,
    kind        TEXT NOT NULL,
    content     TEXT NOT NULL,
    embedding   vector(768),
    metadata    JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS memory_records_embedding_idx
    ON memory_records USING hnsw (embedding vector_cosine_ops);

CREATE INDEX IF NOT EXISTS memory_records_project_id_idx ON memory_records(project_id);
CREATE INDEX IF NOT EXISTS agent_sessions_project_id_idx ON agent_sessions(project_id);
CREATE INDEX IF NOT EXISTS tool_requests_session_id_idx ON tool_requests(session_id);
