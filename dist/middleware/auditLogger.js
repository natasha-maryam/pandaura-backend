"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditEvent = logAuditEvent;
const db_1 = __importDefault(require("../db"));
const uuid_1 = require("uuid");
async function logAuditEvent(entry) {
    try {
        const stmt = db_1.default.prepare(`
      INSERT INTO audit_logs (id, user_id, org_id, action, ip_address, user_agent, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        stmt.run((0, uuid_1.v4)(), entry.userId || null, entry.orgId || null, entry.action, entry.ip || null, entry.userAgent || null, entry.metadata ? JSON.stringify(entry.metadata) : null);
    }
    catch (err) {
        console.error('Audit log error:', err);
    }
}
