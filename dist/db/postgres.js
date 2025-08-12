"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
const pg_1 = require("pg");
const fs_1 = require("fs");
const path_1 = require("path");
const pool = new pg_1.Pool({
    connectionString: process.env.POSTGRES_URL, // Use Railway Postgres connection string
    ssl: { rejectUnauthorized: false } // Needed for Railway's SSL requirement
});
// Initialize PostgreSQL database with proper schema
async function initializeTables() {
    try {
        console.log('🐘 Initializing PostgreSQL database schema...');
        console.log('📍 Current directory:', __dirname);
        // Read and execute the PostgreSQL setup SQL
        const schemaPath = (0, path_1.join)(__dirname, '../../migrations/postgresql-setup.sql');
        console.log('📄 Schema path:', schemaPath);
        const schemaSql = (0, fs_1.readFileSync)(schemaPath, 'utf-8');
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
    }
    catch (error) {
        console.error('❌ Error initializing PostgreSQL schema:', error);
        await pool.query('ROLLBACK');
        throw error;
    }
}
// Database connection using pg Pool
exports.db = {
    // Add initialization function
    initializeTables,
    // User operations
    async createUser(userData) {
        const { id, email, passwordHash, firstName = '', lastName = '', role = 'user' } = userData;
        const result = await pool.query(`INSERT INTO users (id, email, password_hash, first_name, last_name, role, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
       RETURNING *`, [id, email, passwordHash, firstName, lastName, role]);
        return result.rows[0];
    },
    async getUserByEmail(email) {
        const result = await pool.query(`SELECT * FROM users WHERE email = $1 LIMIT 1`, [email]);
        return result.rows[0] || null;
    },
    async getUserById(id) {
        const result = await pool.query(`SELECT * FROM users WHERE id = $1 LIMIT 1`, [id]);
        return result.rows[0] || null;
    },
    async getAllUsers() {
        const result = await pool.query(`SELECT * FROM users`);
        return result.rows;
    },
    async updateUser(id, updates) {
        const setClause = Object.keys(updates)
            .map((key, index) => `${key} = $${index + 2}`)
            .join(', ');
        const result = await pool.query(`UPDATE users SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, ...Object.values(updates)]);
        return result.rows[0];
    },
    // Device Bindings operations
    async createDeviceBinding(bindingData) {
        const { id, userId, deviceFingerprint, ipAddress, userAgent, totpSecret, isVerified = false } = bindingData;
        const result = await pool.query(`INSERT INTO device_bindings (
        id, user_id, device_fingerprint, ip_address, user_agent, 
        totp_secret, is_verified, created_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
      RETURNING *`, [id, userId, deviceFingerprint, ipAddress, userAgent, totpSecret, isVerified]);
        return result.rows[0];
    },
    async getDeviceBinding(userId, deviceFingerprint) {
        const result = await pool.query(`SELECT * FROM device_bindings 
      WHERE user_id = $1 AND device_fingerprint = $2
      LIMIT 1`, [userId, deviceFingerprint]);
        return result.rows[0] || null;
    },
    async updateDeviceBinding(id, updates) {
        const setClause = Object.keys(updates)
            .map((key, index) => `${key} = $${index + 2}`)
            .join(', ');
        const values = Object.values(updates);
        const result = await pool.query(`UPDATE device_bindings SET ${setClause}, updated_at = NOW() WHERE id = $1 RETURNING *`, [id, ...values]);
        return result.rows[0];
    },
    // Activity Log operations
    async createActivityLog(logData) {
        const { id, userId, action, ipAddress, userAgent, success, details = {} } = logData;
        const result = await pool.query(`INSERT INTO activity_log (
        id, user_id, action, ip_address, user_agent, success, details, created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
      RETURNING *`, [id, userId, action, ipAddress, userAgent, success, JSON.stringify(details)]);
        return result.rows[0];
    },
};
exports.default = exports.db;
