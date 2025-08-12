-- PostgreSQL Database Schema for Pandaura AS
-- This should match the SQLite schema from migrations 002 and 003

BEGIN;

-- Drop existing tables if they exist (for clean setup)
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS temp_device_bindings CASCADE;
DROP TABLE IF EXISTS device_bindings CASCADE;
DROP TABLE IF EXISTS invites CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS session_policy CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS organizations CASCADE;

-- Organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT,
  size TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  totp_secret TEXT,
  two_factor_enabled BOOLEAN DEFAULT FALSE,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Team members (relationship between users and organizations)
CREATE TABLE team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  org_id UUID NOT NULL,
  role TEXT CHECK (role IN ('Admin', 'Editor', 'Viewer')) DEFAULT 'Viewer',
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE(user_id, org_id)
);

-- Invites table
CREATE TABLE invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL,
  email TEXT NOT NULL,
  code TEXT UNIQUE NOT NULL,
  role TEXT CHECK (role IN ('Admin', 'Editor', 'Viewer')) DEFAULT 'Viewer',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  used_at TIMESTAMPTZ,
  FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
);

-- Device bindings
CREATE TABLE device_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  instance_id TEXT NOT NULL,
  device_fingerprint_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, instance_id, device_fingerprint_hash)
);

-- Temporary device bindings for signup flow
CREATE TABLE temp_device_bindings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,  -- Add unique constraint for ON CONFLICT
  instance_id TEXT NOT NULL,
  device_fingerprint_hash TEXT NOT NULL,
  is_org_creator BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 hour')
);

-- Audit logs
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  org_id UUID,
  action TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB, -- Use JSONB for better performance
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE SET NULL
);

-- Session policy table
CREATE TABLE session_policy (
  id SERIAL PRIMARY KEY,
  policy_json JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_team_members_user_id ON team_members(user_id);
CREATE INDEX idx_team_members_org_id ON team_members(org_id);
CREATE INDEX idx_invites_code ON invites(code);
CREATE INDEX idx_invites_email ON invites(email);
CREATE INDEX idx_invites_expires_at ON invites(expires_at);
CREATE INDEX idx_device_bindings_user_id ON device_bindings(user_id);
CREATE INDEX idx_temp_device_bindings_email ON temp_device_bindings(email);
CREATE INDEX idx_temp_device_bindings_expires_at ON temp_device_bindings(expires_at);
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_org_id ON audit_logs(org_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);

-- Add some useful PostgreSQL-specific features
CREATE INDEX idx_audit_logs_metadata_gin ON audit_logs USING GIN(metadata);
CREATE INDEX idx_users_email_lower ON users(LOWER(email));

COMMIT;

-- Add comments for documentation
COMMENT ON TABLE organizations IS 'Organizations/companies using the system';
COMMENT ON TABLE users IS 'User accounts';
COMMENT ON TABLE team_members IS 'Relationship between users and organizations with roles';
COMMENT ON TABLE invites IS 'Invitation codes for joining organizations';
COMMENT ON TABLE device_bindings IS 'Device bindings for zero-trust security';
COMMENT ON TABLE temp_device_bindings IS 'Temporary device bindings during signup';
COMMENT ON TABLE audit_logs IS 'Comprehensive audit trail';
COMMENT ON TABLE session_policy IS 'Session and security policies';