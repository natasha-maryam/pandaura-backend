"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const path_1 = __importDefault(require("path"));
const DB_PATH = process.env.DB_PATH || path_1.default.join(process.cwd(), 'pandaura.db');
const db = new better_sqlite3_1.default(DB_PATH);
// optional: pragmas for safety / WAL
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
exports.default = db;
