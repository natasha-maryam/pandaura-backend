-- SQLite version of the projects table
CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL, -- UUID as string in SQLite
    project_name TEXT NOT NULL,
    client_name TEXT,
    project_type TEXT,
    description TEXT,
    target_plc_vendor TEXT CHECK (target_plc_vendor IN ('siemens', 'rockwell', 'beckhoff')),
    autosave_state TEXT, -- JSON as TEXT in SQLite
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC);
