-- Fase 3.7 — schema deliberadamente pequeño: solo `projects`.
-- pgvector se instala ya (Fase 3.8) para que `guerrero doctor` pueda
-- verificarlo, pero SIN crear todavía ninguna tabla con columnas
-- `vector(n)` — la dimensión depende del modelo de embeddings, que aún
-- no se ha seleccionado. agent_sessions/agent_messages/agent_runs y la
-- tabla de memoria llegan en migraciones posteriores (Fase 4+).

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS projects (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name        TEXT NOT NULL,
    path        TEXT NOT NULL UNIQUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
