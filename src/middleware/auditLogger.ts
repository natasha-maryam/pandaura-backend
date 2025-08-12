import { db } from '../db/database-adapter';
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
    await db.createAuditLog({
      id: uuidv4(),
      userId: entry.userId,
      orgId: entry.orgId,
      action: entry.action,
      ipAddress: entry.ip,
      userAgent: entry.userAgent,
      metadata: entry.metadata
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
