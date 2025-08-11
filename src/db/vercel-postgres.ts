import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL, // Use Railway Postgres connection string
  ssl: { rejectUnauthorized: false } // Needed for Railway's SSL requirement
});

export const db = {
  // User operations
  async createUser(userData: {
    id: string;
    email: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
    role?: string;
  }) {
    const { id, email, passwordHash, firstName = '', lastName = '', role = 'user' } = userData;

    const result = await pool.query(
      `INSERT INTO users (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`,
      [id, email, passwordHash, firstName, lastName, role]
    );
    return result.rows[0];
  },

  async getUserByEmail(email: string) {
    const result = await pool.query(
      `SELECT * FROM users WHERE email = $1 LIMIT 1`,
      [email]
    );
    return result.rows[0] || null;
  },

  async getUserById(id: string) {
    const result = await pool.query(
      `SELECT * FROM users WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async updateUser(id: string, updates: any) {
    const keys = Object.keys(updates);
    const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = Object.values(updates);

    const result = await pool.query(
      `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return result.rows[0];
  },

  // Device Bindings operations
  async createDeviceBinding(bindingData: {
    id: string;
    userId: string;
    deviceFingerprint: string;
    ipAddress: string;
    userAgent: string;
    totpSecret: string;
    isVerified?: boolean;
  }) {
    const {
      id,
      userId,
      deviceFingerprint,
      ipAddress,
      userAgent,
      totpSecret,
      isVerified = false
    } = bindingData;

    const result = await pool.query(
      `INSERT INTO device_bindings (
        id, user_id, device_fingerprint, ip_address, user_agent, 
        totp_secret, is_verified, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *`,
      [id, userId, deviceFingerprint, ipAddress, userAgent, totpSecret, isVerified]
    );
    return result.rows[0];
  },

  async getDeviceBinding(userId: string, deviceFingerprint: string) {
    const result = await pool.query(
      `SELECT * FROM device_bindings 
       WHERE user_id = $1 AND device_fingerprint = $2
       LIMIT 1`,
      [userId, deviceFingerprint]
    );
    return result.rows[0] || null;
  },

  async updateDeviceBinding(id: string, updates: any) {
    const keys = Object.keys(updates);
    const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = Object.values(updates);

    const result = await pool.query(
      `UPDATE device_bindings SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return result.rows[0];
  },

  // Organization operations
  async createOrganization(orgData: {
    id?: string;
    name: string;
    industry?: string;
    size?: string;
  }) {
    const { id, name, industry, size } = orgData;

    const result = await pool.query(
      `INSERT INTO organizations (id, name, industry, size, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())
       RETURNING *`,
      [id || `gen_random_uuid()`, name, industry, size]
    );
    return result.rows[0];
  },

  async getOrganizationById(id: string) {
    const result = await pool.query(
      `SELECT * FROM organizations WHERE id = $1 LIMIT 1`,
      [id]
    );
    return result.rows[0] || null;
  },

  async updateOrganization(id: string, updates: any) {
    const keys = Object.keys(updates);
    const setClause = keys.map((key, index) => `${key} = $${index + 2}`).join(', ');
    const values = Object.values(updates);

    const result = await pool.query(
      `UPDATE organizations SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    return result.rows[0];
  },

  // Team Members operations
  async createTeamMember(memberData: {
    id?: string;
    userId: string;
    orgId: string;
    role?: string;
  }) {
    const { id, userId, orgId, role = 'Viewer' } = memberData;

    const result = await pool.query(
      `INSERT INTO team_members (id, user_id, org_id, role, joined_at)
       VALUES ($1, $2, $3, $4, NOW())
       RETURNING *`,
      [id || `gen_random_uuid()`, userId, orgId, role]
    );
    return result.rows[0];
  },

  async getTeamMembersByOrg(orgId: string) {
    const result = await pool.query(
      `SELECT tm.*, u.email, u.first_name, u.last_name 
       FROM team_members tm 
       JOIN users u ON tm.user_id = u.id 
       WHERE tm.org_id = $1`,
      [orgId]
    );
    return result.rows;
  },

  async getTeamMembersByUser(userId: string) {
    const result = await pool.query(
      `SELECT tm.*, o.name as org_name 
       FROM team_members tm 
       JOIN organizations o ON tm.org_id = o.id 
       WHERE tm.user_id = $1`,
      [userId]
    );
    return result.rows;
  },

  async updateTeamMemberRole(userId: string, orgId: string, role: string) {
    const result = await pool.query(
      `UPDATE team_members SET role = $3 WHERE user_id = $1 AND org_id = $2 RETURNING *`,
      [userId, orgId, role]
    );
    return result.rows[0];
  },

  async removeTeamMember(userId: string, orgId: string) {
    const result = await pool.query(
      `DELETE FROM team_members WHERE user_id = $1 AND org_id = $2 RETURNING *`,
      [userId, orgId]
    );
    return result.rows[0];
  },

  // Invites operations
  async createInvite(inviteData: {
    id?: string;
    orgId: string;
    email: string;
    code: string;
    role?: string;
    expiresAt: Date;
  }) {
    const { id, orgId, email, code, role = 'Viewer', expiresAt } = inviteData;

    const result = await pool.query(
      `INSERT INTO invites (id, org_id, email, code, role, expires_at, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       RETURNING *`,
      [id || `gen_random_uuid()`, orgId, email, code, role, expiresAt]
    );
    return result.rows[0];
  },

  async getInviteByCode(code: string) {
    const result = await pool.query(
      `SELECT i.*, o.name as org_name 
       FROM invites i 
       JOIN organizations o ON i.org_id = o.id 
       WHERE i.code = $1 AND i.used_at IS NULL AND i.expires_at > NOW()
       LIMIT 1`,
      [code]
    );
    return result.rows[0] || null;
  },

  async getInvitesByOrg(orgId: string) {
    const result = await pool.query(
      `SELECT * FROM invites WHERE org_id = $1 ORDER BY created_at DESC`,
      [orgId]
    );
    return result.rows;
  },

  async markInviteAsUsed(code: string) {
    const result = await pool.query(
      `UPDATE invites SET used_at = NOW() WHERE code = $1 RETURNING *`,
      [code]
    );
    return result.rows[0];
  },

  async deleteInvite(id: string) {
    const result = await pool.query(
      `DELETE FROM invites WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  // Temporary Device Bindings operations
  async createTempDeviceBinding(bindingData: {
    id?: string;
    email: string;
    instanceId: string;
    deviceFingerprintHash: string;
    isOrgCreator?: boolean;
  }) {
    const { id, email, instanceId, deviceFingerprintHash, isOrgCreator = false } = bindingData;

    const result = await pool.query(
      `INSERT INTO temp_device_bindings (
        id, email, instance_id, device_fingerprint_hash, is_org_creator, created_at, expires_at
      )
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '1 hour')
      RETURNING *`,
      [id || `gen_random_uuid()`, email, instanceId, deviceFingerprintHash, isOrgCreator]
    );
    return result.rows[0];
  },

  async getTempDeviceBinding(email: string, instanceId: string, deviceFingerprintHash: string) {
    const result = await pool.query(
      `SELECT * FROM temp_device_bindings 
       WHERE email = $1 AND instance_id = $2 AND device_fingerprint_hash = $3 
       AND expires_at > NOW()
       LIMIT 1`,
      [email, instanceId, deviceFingerprintHash]
    );
    return result.rows[0] || null;
  },

  async deleteTempDeviceBinding(id: string) {
    const result = await pool.query(
      `DELETE FROM temp_device_bindings WHERE id = $1 RETURNING *`,
      [id]
    );
    return result.rows[0];
  },

  async cleanupExpiredTempBindings() {
    const result = await pool.query(
      `DELETE FROM temp_device_bindings WHERE expires_at <= NOW() RETURNING *`
    );
    return result.rows;
  },

  // Audit Log operations
  async createAuditLog(logData: {
    id?: string;
    userId?: string;
    orgId?: string;
    action: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: any;
  }) {
    const { id, userId, orgId, action, ipAddress, userAgent, metadata = {} } = logData;

    const result = await pool.query(
      `INSERT INTO audit_logs (
        id, user_id, org_id, action, ip_address, user_agent, metadata, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *`,
      [id || `gen_random_uuid()`, userId, orgId, action, ipAddress, userAgent, JSON.stringify(metadata)]
    );
    return result.rows[0];
  },

  async getAuditLogsByUser(userId: string, limit: number = 50) {
    const result = await pool.query(
      `SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [userId, limit]
    );
    return result.rows;
  },

  async getAuditLogsByOrg(orgId: string, limit: number = 50) {
    const result = await pool.query(
      `SELECT al.*, u.email as user_email 
       FROM audit_logs al 
       LEFT JOIN users u ON al.user_id = u.id 
       WHERE al.org_id = $1 
       ORDER BY al.created_at DESC 
       LIMIT $2`,
      [orgId, limit]
    );
    return result.rows;
  },

  // Session Policy operations
  async getSessionPolicy() {
    const result = await pool.query(
      `SELECT * FROM session_policy ORDER BY updated_at DESC LIMIT 1`
    );
    return result.rows[0] || null;
  },

  async updateSessionPolicy(policyJson: string) {
    const result = await pool.query(
      `INSERT INTO session_policy (policy_json, updated_at) VALUES ($1, NOW()) RETURNING *`,
      [policyJson]
    );
    return result.rows[0];
  },

  // Activity Log operations (keeping for backward compatibility)
  async createActivityLog(logData: {
    id: string;
    userId?: string;
    action: string;
    ipAddress: string;
    userAgent: string;
    success: boolean;
    details?: any;
  }) {
    const { id, userId, action, ipAddress, userAgent, success, details = {} } = logData;

    const result = await pool.query(
      `INSERT INTO activity_log (
        id, user_id, action, ip_address, user_agent, success, details, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *`,
      [id, userId, action, ipAddress, userAgent, success, JSON.stringify(details)]
    );
    return result.rows[0];
  },

  // Utility operations
  async initializeTables() {
    // Create organizations table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS organizations (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        industry TEXT,
        size TEXT,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT DEFAULT '',
        last_name TEXT DEFAULT '',
        full_name TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        totp_secret TEXT,
        totp_enabled BOOLEAN DEFAULT false,
        two_factor_enabled BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create team_members table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS team_members (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        org_id TEXT NOT NULL,
        role TEXT CHECK (role IN ('Admin', 'Editor', 'Viewer')) DEFAULT 'Viewer',
        joined_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE,
        UNIQUE(user_id, org_id)
      )
    `);

    // Create invites table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS invites (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        org_id TEXT NOT NULL,
        email TEXT NOT NULL,
        code TEXT UNIQUE NOT NULL,
        role TEXT CHECK (role IN ('Admin', 'Editor', 'Viewer')) DEFAULT 'Viewer',
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        used_at TIMESTAMP,
        FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE CASCADE
      )
    `);

    // Create device_bindings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS device_bindings (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        device_fingerprint TEXT NOT NULL,
        device_fingerprint_hash TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        totp_secret TEXT NOT NULL,
        is_verified BOOLEAN DEFAULT false,
        last_used TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, instance_id, device_fingerprint_hash),
        UNIQUE(user_id, device_fingerprint)
      )
    `);

    // Create temp_device_bindings table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS temp_device_bindings (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        email TEXT NOT NULL,
        instance_id TEXT NOT NULL,
        device_fingerprint_hash TEXT NOT NULL,
        is_org_creator BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        expires_at TIMESTAMP DEFAULT (NOW() + INTERVAL '1 hour')
      )
    `);

    // Create audit_logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT,
        org_id TEXT,
        action TEXT NOT NULL,
        ip_address TEXT,
        user_agent TEXT,
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
        FOREIGN KEY(org_id) REFERENCES organizations(id) ON DELETE SET NULL
      )
    `);

    // Create activity_log table (for backward compatibility)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id TEXT,
        action TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        details JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `);

    // Create session_policy table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS session_policy (
        id SERIAL PRIMARY KEY,
        policy_json TEXT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Create indexes
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_team_members_org_id ON team_members(org_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invites_code ON invites(code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_invites_email ON invites(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_device_bindings_user_id ON device_bindings(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_org_id ON audit_logs(org_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_temp_device_bindings_email ON temp_device_bindings(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_temp_device_bindings_expires_at ON temp_device_bindings(expires_at)`);

    console.log('Database tables initialized successfully');
  }
};

export default db;
