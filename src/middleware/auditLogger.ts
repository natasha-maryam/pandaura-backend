import db from '../db/knex';
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
    await db('activity_log').insert({
      id: uuidv4(),
      user_id: entry.userId || null,
      action: entry.action,
      ip_address: entry.ip || null,
      user_agent: entry.userAgent || null,
      success: true,
      details: entry.metadata ? JSON.stringify(entry.metadata) : '{}',
      created_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Audit log error:', err);
  }
}
