import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'pandaura.db');
const db = new Database(DB_PATH);

// optional: pragmas for safety / WAL
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export default db;