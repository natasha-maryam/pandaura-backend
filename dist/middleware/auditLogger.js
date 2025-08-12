"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAuditEvent = logAuditEvent;
const database_adapter_1 = require("../db/database-adapter");
const uuid_1 = require("uuid");
async function logAuditEvent(entry) {
    try {
        await database_adapter_1.db.createAuditLog({
            id: (0, uuid_1.v4)(),
            userId: entry.userId,
            orgId: entry.orgId,
            action: entry.action,
            ipAddress: entry.ip,
            userAgent: entry.userAgent,
            metadata: entry.metadata
        });
    }
    catch (err) {
        console.error('Audit log error:', err);
    }
}
