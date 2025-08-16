-- Enhanced project versioning system migration
-- This migration updates the existing project_versions table to match the new specification

-- First, create a backup of existing data
CREATE TABLE project_versions_backup AS SELECT * FROM project_versions;

-- Drop existing table and recreate with enhanced schema
DROP TABLE IF EXISTS project_versions;

CREATE TABLE project_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    version_number INTEGER NOT NULL,
    data TEXT NOT NULL, -- JSON string (SQLite doesn't have JSONB)
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    message TEXT,
    is_auto INTEGER DEFAULT 0,
    CONSTRAINT unique_project_version UNIQUE (project_id, version_number),
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Create index for fast retrieval of latest version
CREATE INDEX idx_project_versions_latest ON project_versions (project_id, version_number DESC);

-- Create index for user tracking
CREATE INDEX idx_project_versions_user ON project_versions (user_id);

-- Migrate existing data back with proper structure
INSERT INTO project_versions (id, project_id, user_id, version_number, data, created_at, message, is_auto)
SELECT 
    id,
    project_id,
    user_id,
    version_number,
    json_object(
        'state', state,
        'metadata', json_object(
            'timestamp', timestamp,
            'legacy_migration', 1
        )
    ) as data,
    datetime(timestamp, 'unixepoch') as created_at,
    message,
    is_auto
FROM project_versions_backup;

-- Clean up backup table
DROP TABLE project_versions_backup;

-- Update projects table to include metadata column if it doesn't exist
ALTER TABLE projects ADD COLUMN metadata TEXT DEFAULT '{}';

-- Create audit log table for enhanced tracking
CREATE TABLE IF NOT EXISTS project_version_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    action TEXT NOT NULL, -- 'create', 'rollback', 'restore'
    version_number INTEGER,
    metadata TEXT, -- JSON string
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    ip_address TEXT,
    user_agent TEXT,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX idx_version_audit_project ON project_version_audit (project_id);
CREATE INDEX idx_version_audit_user ON project_version_audit (user_id);
CREATE INDEX idx_version_audit_action ON project_version_audit (action);
