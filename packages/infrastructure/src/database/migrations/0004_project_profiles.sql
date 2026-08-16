-- Fase 5.6 — Project Intelligence: persistencia (docs/fase-5-project-intelligence-map.md
-- §5, §5.6). Una sola fila vigente por proyecto, no histórico (§3 del mapa):
-- project_id UNIQUE es lo que hace cumplir esa regla a nivel de base de
-- datos, y es el target del UPSERT que usa DrizzleProjectIntelligenceRepository.
--
-- id propio (no project_id como PK): identidad del snapshot persistente
-- (ProjectProfile extends Entity, dominio Fase 5.1) vs. identidad del
-- proyecto al que pertenece son conceptos distintos, aunque v1 no tenga
-- histórico. En un re-scan (ON CONFLICT (project_id) DO UPDATE), el id
-- existente se conserva deliberadamente — un re-scan no crea otra
-- identidad de ProjectProfile, actualiza el snapshot vigente del mismo
-- perfil.
--
-- schema_version IN (1): espeja isKnownSchemaVersion (dominio, Fase 5.1).
-- Ampliar a v2 es una migración explícita que extiende este CHECK, mismo
-- criterio que memory_embeddings_provider_valid (0003_memory_embeddings_vector.sql).
--
-- Los arrays JSONB (technologies/components/dependencies/structure) no
-- tienen CHECK sobre su forma interna: la única vía de escritura pasa por
-- ProjectProfileMapper, alimentado exclusivamente por objetos que ya
-- pasaron los invariantes de dominio (isValidTechnology/isValidComponent)
-- antes de llegar aquí — a diferencia de scope/type/status (enums de
-- texto), validar la forma de un array de objetos en SQL sería una pieza
-- pesada sin evidencia de que el dominio no sea ya suficiente.

CREATE TABLE IF NOT EXISTS project_profiles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id      UUID NOT NULL UNIQUE REFERENCES projects(id) ON DELETE CASCADE,
    schema_version  INTEGER NOT NULL,
    scanned_at      TIMESTAMPTZ NOT NULL,
    technologies    JSONB NOT NULL DEFAULT '[]'::jsonb,
    components      JSONB NOT NULL DEFAULT '[]'::jsonb,
    dependencies    JSONB NOT NULL DEFAULT '[]'::jsonb,
    structure       JSONB NOT NULL DEFAULT '[]'::jsonb,
    configuration   JSONB NOT NULL DEFAULT '{}'::jsonb,

    CONSTRAINT project_profiles_schema_version_valid CHECK (schema_version IN (1))
);
