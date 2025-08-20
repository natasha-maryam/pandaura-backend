"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditEvent = logAuditEvent;
const knex_1 = __importDefault(require("../db/knex"));
const uuid_1 = require("uuid");
async function logAuditEvent(entry) {
    try {
        await (0, knex_1.default)('activity_log').insert({
            id: (0, uuid_1.v4)(),
            user_id: entry.userId || null,
            action: entry.action,
            ip_address: entry.ip || null,
            user_agent: entry.userAgent || null,
            success: true,
            details: entry.metadata ? JSON.stringify(entry.metadata) : '{}',
            created_at: new Date().toISOString()
        });
    }
    catch (err) {
        console.error('Audit log error:', err);
    }
}
