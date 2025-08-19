// This file contains TypeScript interfaces for user-related tables
// Table creation is handled by Knex migrations

export interface User {
  id: string;
  email: string;
  password_hash: string;
  first_name?: string;
  last_name?: string;
  name?: string;
  org_name?: string;
  industry?: string;
  role?: string;
  is_active: boolean;
  email_verified: boolean;
  totp_secret?: string;
  totp_enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Organization {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

export interface TeamMember {
  id: string;
  user_id: string;
  organization_id: string;
  role: 'Admin' | 'Editor' | 'Viewer';
  created_at: string;
  updated_at: string;
}

export interface Invite {
  id: string;
  email: string;
  token: string;
  organization_id: string;
  role: 'Admin' | 'Editor' | 'Viewer';
  used_at?: string;
  created_at: string;
  updated_at: string;
}