import db from '../index';

export function createUsersTable() {
  db.prepare(`
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
    )
  `).run();
}

export function createOrganizationsTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS organizations (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      name TEXT NOT NULL,
      industry TEXT,
      size TEXT,
      created_at INTEGER DEFAULT (strftime('%s','now')),
      updated_at INTEGER DEFAULT (strftime('%s','now'))
    )
  `).run();
}

export function createTeamMembersTable() {
  db.prepare(`
    CREATE TABLE IF NOT EXISTS team_members (
      id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
      user_id TEXT NOT NULL,
      org_id TEXT NOT NULL,
      role TEXT CHECK (role IN ('Admin', 'Editor', 'Viewer')) DEFAULT 'Viewer',
      joined_at INTEGER DEFAULT (strftime('%s','now')),
      FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
      UNIQUE(user_id, org_id)
    )
  `).run();
}

export function createInvitesTable() {
  db.prepare(`
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
    )
  `).run();
}