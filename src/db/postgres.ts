import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join } from 'path';

const pool = new Pool({
  connectionString: process.env.POSTGRES_URL, // Use Railway Postgres connection string
  ssl: { rejectUnauthorized: false } // Needed for Railway's SSL requirement
});

// Initialize PostgreSQL database with proper schema
async function initializeTables() {
  try {
    console.log('🐘 Initializing PostgreSQL database schema...');
    console.log('📍 Current directory:', __dirname);
    
    // Read and execute the PostgreSQL setup SQL
    const schemaPath = join(__dirname, '../../migrations/postgresql-setup.sql');
    console.log('📄 Schema path:', schemaPath);
    
    const schemaSql = readFileSync(schemaPath, 'utf-8');
    console.log('📝 Schema SQL length:', schemaSql.length, 'characters');
    
    // Execute the schema as a single transaction
    await pool.query('BEGIN');
    await pool.query(schemaSql);
    await pool.query('COMMIT');
    
    console.log('✅ PostgreSQL database schema initialized successfully');
    
    // Verify tables were created
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('📊 Tables created:', tablesResult.rows.map(r => r.table_name).join(', '));
    
  } catch (error) {
    console.error('❌ Error initializing PostgreSQL schema:', error);
    await pool.query('ROLLBACK');
    throw error;
  }
}

// Database connection using pg Pool
export const db = {
  // Add initialization function
  initializeTables,
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

  async getAllUsers() {
    const result = await pool.query(`SELECT * FROM users`);
    return result.rows;
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

};

export default db;