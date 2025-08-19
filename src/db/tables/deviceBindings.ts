// This file contains TypeScript interfaces for device bindings table
// Table creation is handled by Knex migrations

export interface DeviceBinding {
  id: string;
  user_id: string;
  device_fingerprint: string;
  ip_address: string;
  user_agent: string;
  totp_secret: string;
  is_verified: boolean;
  last_used: string;
  created_at: string;
  updated_at: string;
}