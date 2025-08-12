"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createDeviceBindingsTable = createDeviceBindingsTable;
const index_1 = __importDefault(require("../index"));
function createDeviceBindingsTable() {
    index_1.default.prepare(`
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
