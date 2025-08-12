import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL, // Use Railway Postgres connection string
  ssl: { rejectUnauthorized: false } // Needed for Railway's SSL requirement
});

// Database connection using pg Pool
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
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const result = await pool.query(
      `UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`,
      [id, ...Object.values(updates)]
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
    const setClause = Object.keys(updates)
      .map((key, index) => `${key} = $${index + 2}`)
      .join(', ');

    const values = Object.values(updates);

    const result = await pool.query(
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
    try {
      // Create users table
      await pool.query(`
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
      `);

      // Create device_bindings table
      await pool.query(`
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
      `);

      // Create activity_log table
      await pool.query(`
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
      `);

      // Create organizations table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS organizations (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create invites table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS invites (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL,
          token TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create team_members table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS team_members (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          organization_id TEXT NOT NULL,
          role TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW(),
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
        )
      `);
      
      console.log('Database tables initialized successfully');
    } catch (error) {
      console.error('Error initializing database tables:', error);
      throw error;
    }
  }
};

export default db;