-- Migration to update project_versions table schema

-- First, create a backup of existing data
CREATE TABLE IF NOT EXISTS project_versions_backup AS 
SELECT * FROM project_versions;

-- Drop existing table
DROP TABLE IF EXISTS project_versions;

-- Recreate table with new schema
CREATE TABLE project_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  data TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  message TEXT,
  is_auto INTEGER DEFAULT 0,
  CONSTRAINT unique_project_version UNIQUE (project_id, version_number),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

-- Create indices
CREATE INDEX IF NOT EXISTS idx_project_versions_latest ON project_versions (project_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_project_versions_user ON project_versions (user_id);

-- Migrate existing data
INSERT INTO project_versions (
  id, 
  project_id, 
  user_id, 
  version_number, 
  data, 
  created_at, 
  message, 
  is_auto
)
SELECT 
  id,
  project_id,
  user_id,
  version_number,
  json_object(
    'projectMetadata', json_object(
      'id', project_id,
      'project_name', 'Migrated Project',
      'metadata', '{}'
    ),
    'timestamp', strftime('%s', created_at),
    'version_info', json_object(
      'created_by', user_id,
      'created_at', created_at,
      'message', COALESCE(message, 'Migrated version')
    )
  ) as data,
  created_at,
  message,
  COALESCE(is_auto, 0)
FROM project_versions_backup;

-- Drop backup table
DROP TABLE IF EXISTS project_versions_backup;
