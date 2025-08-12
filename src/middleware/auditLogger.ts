import db from '../db';
import { v4 as uuidv4 } from 'uuid';

interface AuditLogEntry {
  userId?: string;
  orgId?: string;
  action: string;
  ip?: string;
  userAgent?: string;
  metadata?: any;
}

export async function logAuditEvent(entry: AuditLogEntry): Promise<void> {
  try {
    const stmt = db.prepare(`
      INSERT INTO audit_logs (id, user_id, org_id, action, ip_address, user_agent, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      uuidv4(),
      entry.userId || null,
      entry.orgId || null,
      entry.action,
      entry.ip || null,
      entry.userAgent || null,
      entry.metadata ? JSON.stringify(entry.metadata) : null
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
