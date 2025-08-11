import db from '../index';

export function createDeviceBindingsTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS device_bindings (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      instance_id_hash TEXT NOT NULL,
      device_fingerprint_hash TEXT NOT NULL,
      bound_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `).run();
}