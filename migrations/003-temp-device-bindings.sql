BEGIN TRANSACTION;

-- Temporary device bindings for signup flow
CREATE TABLE IF NOT EXISTS temp_device_bindings (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  email TEXT NOT NULL,
  instance_id TEXT NOT NULL,
  device_fingerprint_hash TEXT NOT NULL,
  is_org_creator INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s','now')),
  expires_at INTEGER DEFAULT (strftime('%s','now') + 3600) -- Expire after 1 hour
);

-- Index for cleanup and lookup
CREATE INDEX IF NOT EXISTS idx_temp_device_bindings_email ON temp_device_bindings(email);
CREATE INDEX IF NOT EXISTS idx_temp_device_bindings_expires_at ON temp_device_bindings(expires_at);

COMMIT;
