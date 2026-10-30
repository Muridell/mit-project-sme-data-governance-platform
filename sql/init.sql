-- ============================================================
-- SME Metadata Governance Framework — Database Schema
-- Author : Murtadha Oduntan | 2025/A/MIT/0033
-- Version: 1.0.0
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── Stewards ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS stewards (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name       VARCHAR(255) NOT NULL,
    email      VARCHAR(255) UNIQUE NOT NULL,
    role       VARCHAR(100) NOT NULL,
    department VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Datasets (DCAT-AP v2.1 aligned) ──────────────────────────
CREATE TABLE IF NOT EXISTS datasets (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Mandatory baseline (Dublin Core)
    identifier        VARCHAR(255) UNIQUE NOT NULL,   -- dct:identifier
    title             VARCHAR(500)        NOT NULL,   -- dct:title
    description       TEXT                NOT NULL,   -- dct:description
    creator           VARCHAR(255)        NOT NULL,   -- dct:creator
    created_date      DATE                NOT NULL,   -- dct:created
    modified_date     DATE,                           -- dct:modified
    access_rights     VARCHAR(50)         NOT NULL    -- dct:accessRights
        CHECK (access_rights IN ('Public','Internal','Confidential','Restricted')),
    sensitivity_class VARCHAR(50)         NOT NULL    -- smegov:sensitivityClass
        CHECK (sensitivity_class IN ('Public','Internal','Confidential','Restricted')),
    -- Extended (DCAT-AP)
    license_url       VARCHAR(500),                   -- dct:license
    subject_tags      TEXT[],                         -- dct:subject
    language          VARCHAR(10) DEFAULT 'en',       -- dct:language
    temporal_start    DATE,                           -- dct:temporal (start)
    temporal_end      DATE,                           -- dct:temporal (end)
    -- SME custom extensions
    retention_period  VARCHAR(100),                   -- smegov:retentionPeriod
    data_location     VARCHAR(500),                   -- smegov:dataLocation
    steward_id        UUID REFERENCES stewards(id),
    is_active         BOOLEAN DEFAULT TRUE,
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Distributions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distributions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id   UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    title        VARCHAR(500),
    access_url   VARCHAR(500) NOT NULL,               -- dcat:accessURL
    download_url VARCHAR(500),                        -- dcat:downloadURL
    format       VARCHAR(100),                        -- dct:format
    byte_size    BIGINT,                              -- dcat:byteSize
    created_at   TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Lineage Runs (OpenLineage-aligned) ────────────────────────
CREATE TABLE IF NOT EXISTS lineage_runs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name        VARCHAR(255) NOT NULL,
    job_namespace   VARCHAR(255) DEFAULT 'sme-governance',
    run_id          UUID        NOT NULL,
    run_state       VARCHAR(20)
        CHECK (run_state IN ('START','COMPLETE','FAIL','ABORT')),
    nominal_time    TIMESTAMP WITH TIME ZONE,
    input_datasets  JSONB,
    output_datasets JSONB,
    facets          JSONB,
    recorded_at     TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Access Policies (NIST Core RBAC) ─────────────────────────
CREATE TABLE IF NOT EXISTS access_policies (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role        VARCHAR(100) NOT NULL,
    sensitivity VARCHAR(50)  NOT NULL,
    operation   VARCHAR(50)  NOT NULL
        CHECK (operation IN ('read_metadata','write_metadata','read_data','manage_access')),
    permission  VARCHAR(10)  NOT NULL
        CHECK (permission IN ('ALLOW','DENY')),
    UNIQUE (role, sensitivity, operation)
);

-- ── Quality Scores (FAIR) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS quality_scores (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
    fair_score NUMERIC(5,2),
    f_score    NUMERIC(5,2),
    a_score    NUMERIC(5,2),
    i_score    NUMERIC(5,2),
    r_score    NUMERIC(5,2),
    details    JSONB,
    scored_by  VARCHAR(255),
    scored_at  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         VARCHAR(255) UNIQUE NOT NULL,
    full_name     VARCHAR(255) NOT NULL,
    hashed_password TEXT NOT NULL,
    role          VARCHAR(100) NOT NULL
        CHECK (role IN ('data_owner','data_steward','data_analyst','data_consumer','system_admin')),
    is_active     BOOLEAN DEFAULT TRUE,
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Audit Log (immutable with hash chaining) ──────────────────
CREATE TABLE IF NOT EXISTS audit_log (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID,
    user_email  VARCHAR(255),
    user_role   VARCHAR(100),
    dataset_id  UUID,
    operation   VARCHAR(50),
    result      VARCHAR(10) CHECK (result IN ('ALLOW','DENY')),
    ip_address  INET,
    user_agent  VARCHAR(500),
    details     JSONB,
    prev_hash   VARCHAR(64),
    event_time  TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_datasets_sensitivity  ON datasets(sensitivity_class);
CREATE INDEX IF NOT EXISTS idx_datasets_steward      ON datasets(steward_id);
CREATE INDEX IF NOT EXISTS idx_datasets_active       ON datasets(is_active);
CREATE INDEX IF NOT EXISTS idx_lineage_job           ON lineage_runs(job_name);
CREATE INDEX IF NOT EXISTS idx_lineage_run_id        ON lineage_runs(run_id);
CREATE INDEX IF NOT EXISTS idx_policies_role         ON access_policies(role);
CREATE INDEX IF NOT EXISTS idx_quality_dataset       ON quality_scores(dataset_id);
CREATE INDEX IF NOT EXISTS idx_audit_user            ON audit_log(user_email);
CREATE INDEX IF NOT EXISTS idx_audit_dataset         ON audit_log(dataset_id);

-- ── RBAC Seed Data ────────────────────────────────────────────
INSERT INTO access_policies (role, sensitivity, operation, permission) VALUES
-- Data Owner: all permissions on all sensitivity levels
('data_owner','Public',       'read_metadata', 'ALLOW'),
('data_owner','Public',       'write_metadata','ALLOW'),
('data_owner','Public',       'read_data',     'ALLOW'),
('data_owner','Public',       'manage_access', 'ALLOW'),
('data_owner','Internal',     'read_metadata', 'ALLOW'),
('data_owner','Internal',     'write_metadata','ALLOW'),
('data_owner','Internal',     'read_data',     'ALLOW'),
('data_owner','Internal',     'manage_access', 'ALLOW'),
('data_owner','Confidential', 'read_metadata', 'ALLOW'),
('data_owner','Confidential', 'write_metadata','ALLOW'),
('data_owner','Confidential', 'read_data',     'ALLOW'),
('data_owner','Confidential', 'manage_access', 'ALLOW'),
('data_owner','Restricted',   'read_metadata', 'ALLOW'),
('data_owner','Restricted',   'write_metadata','ALLOW'),
('data_owner','Restricted',   'read_data',     'ALLOW'),
('data_owner','Restricted',   'manage_access', 'ALLOW'),
-- Data Steward: R/W metadata + read data on Public/Internal/Confidential
('data_steward','Public',       'read_metadata', 'ALLOW'),
('data_steward','Public',       'write_metadata','ALLOW'),
('data_steward','Public',       'read_data',     'ALLOW'),
('data_steward','Public',       'manage_access', 'DENY'),
('data_steward','Internal',     'read_metadata', 'ALLOW'),
('data_steward','Internal',     'write_metadata','ALLOW'),
('data_steward','Internal',     'read_data',     'ALLOW'),
('data_steward','Internal',     'manage_access', 'DENY'),
('data_steward','Confidential', 'read_metadata', 'ALLOW'),
('data_steward','Confidential', 'write_metadata','ALLOW'),
('data_steward','Confidential', 'read_data',     'ALLOW'),
('data_steward','Confidential', 'manage_access', 'DENY'),
('data_steward','Restricted',   'read_metadata', 'DENY'),
('data_steward','Restricted',   'write_metadata','DENY'),
('data_steward','Restricted',   'read_data',     'DENY'),
('data_steward','Restricted',   'manage_access', 'DENY'),
-- Data Analyst: read metadata + data on Public/Internal only
('data_analyst','Public',       'read_metadata', 'ALLOW'),
('data_analyst','Public',       'write_metadata','DENY'),
('data_analyst','Public',       'read_data',     'ALLOW'),
('data_analyst','Public',       'manage_access', 'DENY'),
('data_analyst','Internal',     'read_metadata', 'ALLOW'),
('data_analyst','Internal',     'write_metadata','DENY'),
('data_analyst','Internal',     'read_data',     'ALLOW'),
('data_analyst','Internal',     'manage_access', 'DENY'),
('data_analyst','Confidential', 'read_metadata', 'DENY'),
('data_analyst','Confidential', 'write_metadata','DENY'),
('data_analyst','Confidential', 'read_data',     'DENY'),
('data_analyst','Confidential', 'manage_access', 'DENY'),
('data_analyst','Restricted',   'read_metadata', 'DENY'),
('data_analyst','Restricted',   'write_metadata','DENY'),
('data_analyst','Restricted',   'read_data',     'DENY'),
('data_analyst','Restricted',   'manage_access', 'DENY'),
-- Data Consumer: read metadata all, read data Public only
('data_consumer','Public',       'read_metadata', 'ALLOW'),
('data_consumer','Public',       'write_metadata','DENY'),
('data_consumer','Public',       'read_data',     'ALLOW'),
('data_consumer','Public',       'manage_access', 'DENY'),
('data_consumer','Internal',     'read_metadata', 'ALLOW'),
('data_consumer','Internal',     'write_metadata','DENY'),
('data_consumer','Internal',     'read_data',     'DENY'),
('data_consumer','Internal',     'manage_access', 'DENY'),
('data_consumer','Confidential', 'read_metadata', 'ALLOW'),
('data_consumer','Confidential', 'write_metadata','DENY'),
('data_consumer','Confidential', 'read_data',     'DENY'),
('data_consumer','Confidential', 'manage_access', 'DENY'),
('data_consumer','Restricted',   'read_metadata', 'DENY'),
('data_consumer','Restricted',   'write_metadata','DENY'),
('data_consumer','Restricted',   'read_data',     'DENY'),
('data_consumer','Restricted',   'manage_access', 'DENY'),
-- System Admin: R/W metadata only, NO data access (separation of duties)
('system_admin','Public',       'read_metadata', 'ALLOW'),
('system_admin','Public',       'write_metadata','ALLOW'),
('system_admin','Public',       'read_data',     'DENY'),
('system_admin','Public',       'manage_access', 'DENY'),
('system_admin','Internal',     'read_metadata', 'ALLOW'),
('system_admin','Internal',     'write_metadata','ALLOW'),
('system_admin','Internal',     'read_data',     'DENY'),
('system_admin','Internal',     'manage_access', 'DENY'),
('system_admin','Confidential', 'read_metadata', 'ALLOW'),
('system_admin','Confidential', 'write_metadata','ALLOW'),
('system_admin','Confidential', 'read_data',     'DENY'),
('system_admin','Confidential', 'manage_access', 'DENY'),
('system_admin','Restricted',   'read_metadata', 'ALLOW'),
('system_admin','Restricted',   'write_metadata','ALLOW'),
('system_admin','Restricted',   'read_data',     'DENY'),
('system_admin','Restricted',   'manage_access', 'DENY')
ON CONFLICT (role, sensitivity, operation) DO NOTHING;

-- ── Default admin user (password: Admin@SMEGov2026 — change in prod) ─
INSERT INTO users (email, full_name, hashed_password, role) VALUES
('admin@smegov.ng', 'System Administrator',
 '$2b$12$4HEaT/BNVM4IABBUJYm3.OUyDjJpCaeiRxdu8CnwaGOYlsWH9RysW', 'system_admin')
ON CONFLICT (email) DO NOTHING;
