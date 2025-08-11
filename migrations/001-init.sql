BEGIN TRANSACTION;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  org_name TEXT,
  industry TEXT,
  role TEXT,
  totp_secret_encrypted TEXT, -- store encrypted or as-is if DB is local and file-system secured
  two_factor_enabled INTEGER DEFAULT 0,
  account_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

CREATE TABLE IF NOT EXISTS device_bindings (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  instance_id_hash TEXT NOT NULL,
  device_fingerprint_hash TEXT NOT NULL,
  bound_at INTEGER DEFAULT (strftime('%s','now')),
  FOREIGN KEY(user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS activity_log (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  event TEXT NOT NULL,
  ip TEXT,
  user_agent TEXT,
  created_at INTEGER DEFAULT (strftime('%s','now'))
);

-- session_policy could be a JSON file on disk; optional table:
CREATE TABLE IF NOT EXISTS session_policy (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  policy_json TEXT NOT NULL,
  updated_at INTEGER DEFAULT (strftime('%s','now'))
);

COMMIT;
