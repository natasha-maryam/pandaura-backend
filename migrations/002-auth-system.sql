BEGIN TRANSACTION;

-- Drop existing tables if they exist (for clean slate)
DROP TABLE IF EXISTS activity_log;
DROP TABLE IF EXISTS device_bindings;
DROP TABLE IF EXISTS users;

-- Organizations table
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  industry TEXT,
  size TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Users table (updated schema)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  two_factor_enabled INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Team members (relationship between users and organizations)
CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  org_id TEXT NOT NULL,
  role TEXT CHECK (role IN ('Admin', 'Editor', 'Viewer')) DEFAULT 'Viewer',
  joined_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(user_id, org_id)
);

-- Invites table
CREATE TABLE IF NOT EXISTS invites (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  org_id TEXT NOT NULL,
  email TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  role TEXT CHECK (role IN ('Admin', 'Editor', 'Viewer')) DEFAULT 'Viewer',
  expires_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  used_at INTEGER,
  FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Device bindings (updated schema)
CREATE TABLE IF NOT EXISTS device_bindings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  device_fingerprint_hash TEXT NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, instance_id, device_fingerprint_hash)
);

-- Audit logs (updated schema)
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  user_id TEXT,
  org_id TEXT,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata TEXT, -- JSON string
  created_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE SET NULL
);

-- Session policy table
CREATE TABLE IF NOT EXISTS session_policy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_json TEXT NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_org_id ON team_members(org_id);
CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code);
CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email);
CREATE INDEX IF NOT EXISTS idx_device_bindings_user_id ON device_bindings(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);

COMMIT;
