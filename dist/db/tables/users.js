"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createUsersTable = createUsersTable;
exports.createOrganizationsTable = createOrganizationsTable;
exports.createTeamMembersTable = createTeamMembersTable;
exports.createInvitesTable = createInvitesTable;
const index_1 = __importDefault(require("../index"));
function createUsersTable() {
    index_1.default.prepare(`
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
function createOrganizationsTable() {
    index_1.default.prepare(`
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
function createTeamMembersTable() {
    index_1.default.prepare(`
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
function createInvitesTable() {
    index_1.default.prepare(`
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
