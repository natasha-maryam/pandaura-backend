import { sql } from '@vercel/postgres';

// Database connection using Vercel Postgres
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
    
    const result = await sql`
      INSERT INTO users (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
      VALUES (${id}, ${email}, ${passwordHash}, ${firstName}, ${lastName}, ${role}, NOW(), NOW())
      RETURNING *
    `;
    
    return result.rows[0];
  },

  async getUserByEmail(email: string) {
    const result = await sql`
      SELECT * FROM users WHERE email = ${email} LIMIT 1
    `;
    
    return result.rows[0] || null;
  },

  async getUserById(id: string) {
    const result = await sql`
      SELECT * FROM users WHERE id = ${id} LIMIT 1
    `;
    
    return result.rows[0] || null;
  },

  async updateUser(id: string, updates: any) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = Object.values(updates);
    
    const result = await sql.query(
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
    
    const result = await sql`
      INSERT INTO device_bindings (
        id, user_id, device_fingerprint, ip_address, user_agent, 
        totp_secret, is_verified, created_at, updated_at
      )
      VALUES (
        ${id}, ${userId}, ${deviceFingerprint}, ${ipAddress}, ${userAgent},
        ${totpSecret}, ${isVerified}, NOW(), NOW()
      )
      RETURNING *
    `;
    
    return result.rows[0];
  },

  async getDeviceBinding(userId: string, deviceFingerprint: string) {
    const result = await sql`
      SELECT * FROM device_bindings 
      WHERE user_id = ${userId} AND device_fingerprint = ${deviceFingerprint}
      LIMIT 1
    `;
    
    return result.rows[0] || null;
  },

  async updateDeviceBinding(id: string, updates: any) {
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');
    
    const values = Object.values(updates);
    
    const result = await sql.query(
      `UPDATE device_bindings SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...values]
    );
    
    return result.rows[0];
  },

  // Activity Log operations
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
    
    const result = await sql`
      INSERT INTO activity_log (
        id, user_id, action, ip_address, user_agent, success, details, created_at
      )
      VALUES (
        ${id}, ${userId}, ${action}, ${ipAddress}, ${userAgent}, 
        ${success}, ${JSON.stringify(details)}, NOW()
      )
      RETURNING *
    `;
    
    return result.rows[0];
  },

  // Utility operations
  async initializeTables() {
    // Create users table
    await sql`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT DEFAULT '',
        last_name TEXT DEFAULT '',
        role TEXT DEFAULT 'user',
        is_active BOOLEAN DEFAULT true,
        email_verified BOOLEAN DEFAULT false,
        totp_secret TEXT,
        totp_enabled BOOLEAN DEFAULT false,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `;

    // Create device_bindings table
    await sql`
      CREATE TABLE IF NOT EXISTS device_bindings (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        device_fingerprint TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        totp_secret TEXT NOT NULL,
        is_verified BOOLEAN DEFAULT false,
        last_used TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(user_id, device_fingerprint)
      )
    `;

    // Create activity_log table
    await sql`
      CREATE TABLE IF NOT EXISTS activity_log (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        action TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        user_agent TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        details JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT NOW(),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
      )
    `;

    console.log('Database tables initialized successfully');
  }
};

export default db;