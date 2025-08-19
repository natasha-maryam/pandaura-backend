// This file contains TypeScript interfaces for activity log table
// Table creation is handled by Knex migrations

export interface ActivityLog {
  id: string;
  user_id?: string;
  action: string;
  ip_address: string;
  user_agent: string;
  success: boolean;
  details?: any;
  created_at: string;
}

export interface AuditLog {
  id: string;
  user_id?: string;
  org_id?: string;
  action: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: any;
  created_at: string;
}