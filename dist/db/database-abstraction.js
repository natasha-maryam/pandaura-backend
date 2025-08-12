"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dbAdapter = void 0;
// Determine which database to use
const isProduction = process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
class SQLiteAdapter {
    constructor() {
        this.db = require('./index').default;
    }
    async createOrganization(orgData) {
        const stmt = this.db.prepare(`
      INSERT INTO organizations (id, name, industry, size, created_at, updated_at) 
      VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
    `);
        stmt.run(orgData.id, orgData.name, orgData.industry, orgData.size);
    }
    async getOrganizationById(id) {
        const stmt = this.db.prepare('SELECT * FROM organizations WHERE id = ?');
        return stmt.get(id);
    }
    async createUser(userData) {
        const stmt = this.db.prepare(`
      INSERT INTO users (id, full_name, email, password_hash, totp_secret, is_active, created_at, updated_at) 
      VALUES (?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
    `);
        stmt.run(userData.id, userData.fullName, userData.email, userData.passwordHash, userData.totpSecret);
    }
    async getUserByEmail(email) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1');
        return stmt.get(email);
    }
    async getUserById(id) {
        const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
        return stmt.get(id);
    }
    async getAllUsers() {
        const stmt = this.db.prepare('SELECT * FROM users');
        return stmt.all();
    }
    async updateUserTotpSecret(userId, totpSecret) {
        const stmt = this.db.prepare('UPDATE users SET totp_secret = ?, updated_at = datetime("now") WHERE id = ?');
        stmt.run(totpSecret, userId);
    }
    async createTeamMember(data) {
        const stmt = this.db.prepare(`
      INSERT INTO team_members (id, user_id, org_id, role, joined_at) 
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
        stmt.run(data.id, data.userId, data.orgId, data.role);
    }
    async getTeamMembersByOrgId(orgId) {
        const stmt = this.db.prepare(`
      SELECT u.id as user_id, u.full_name, u.email, tm.role 
      FROM users u
      JOIN team_members tm ON u.id = tm.user_id 
      WHERE tm.org_id = ?
    `);
        return stmt.all(orgId);
    }
    async getTeamMemberByUserAndOrg(userId, orgId) {
        const stmt = this.db.prepare('SELECT * FROM team_members WHERE user_id = ? AND org_id = ?');
        return stmt.get(userId, orgId);
    }
    async getTeamMemberByEmailAndOrg(email, orgId) {
        const stmt = this.db.prepare(`
      SELECT tm.id FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE u.email = ? AND tm.org_id = ?
    `);
        return stmt.get(email, orgId);
    }
    async getUserOrganizations(userId) {
        const stmt = this.db.prepare(`
      SELECT tm.org_id, tm.role, o.name as org_name, o.industry, o.size
      FROM team_members tm 
      JOIN organizations o ON tm.org_id = o.id
      WHERE tm.user_id = ?
    `);
        return stmt.all(userId);
    }
    async updateTeamMemberRole(userId, orgId, role) {
        const stmt = this.db.prepare('UPDATE team_members SET role = ? WHERE user_id = ? AND org_id = ?');
        stmt.run(role, userId, orgId);
    }
    async removeTeamMember(userId, orgId) {
        const stmt = this.db.prepare('DELETE FROM team_members WHERE user_id = ? AND org_id = ?');
        stmt.run(userId, orgId);
    }
    async createInvite(inviteData) {
        const stmt = this.db.prepare(`
      INSERT INTO invites (id, org_id, email, code, role, expires_at, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `);
        stmt.run(inviteData.id, inviteData.orgId, inviteData.email, inviteData.code, inviteData.role, inviteData.expiresAt.toISOString());
    }
    async getValidInviteByCode(code) {
        const stmt = this.db.prepare('SELECT * FROM invites WHERE code = ? AND expires_at > datetime("now") AND used_at IS NULL');
        return stmt.get(code);
    }
    async getInvitesByOrgId(orgId) {
        const stmt = this.db.prepare(`
      SELECT id, email, role, code, expires_at, created_at, used_at
      FROM invites 
      WHERE org_id = ?
      ORDER BY created_at DESC
    `);
        return stmt.all(orgId);
    }
    async deleteInviteById(inviteId, orgId) {
        const stmt = this.db.prepare('DELETE FROM invites WHERE id = ? AND org_id = ?');
        const result = stmt.run(inviteId, orgId);
        return result.changes;
    }
    async markInviteAsUsed(inviteId) {
        const stmt = this.db.prepare('UPDATE invites SET used_at = datetime("now") WHERE id = ?');
        stmt.run(inviteId);
    }
    async createDeviceBinding(data) {
        const stmt = this.db.prepare(`
      INSERT INTO device_bindings (id, user_id, instance_id, device_fingerprint_hash, created_at) 
      VALUES (?, ?, ?, ?, datetime('now'))
    `);
        stmt.run(data.id, data.userId, data.instanceId, data.deviceFingerprintHash);
    }
    async getDeviceBindingsByUser(userId) {
        const stmt = this.db.prepare('SELECT * FROM device_bindings WHERE user_id = ?');
        return stmt.all(userId);
    }
    async createTempDeviceBinding(data) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO temp_device_bindings (id, email, instance_id, device_fingerprint_hash, is_org_creator, created_at, expires_at) 
      VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now', '+1 hour'))
    `);
        stmt.run(data.id, data.email, data.instanceId, data.deviceFingerprintHash, data.isOrgCreator ? 1 : 0);
    }
    async getTempDeviceBindingsByEmail(email) {
        const stmt = this.db.prepare(`
      SELECT * FROM temp_device_bindings 
      WHERE email = ? AND expires_at > datetime('now')
    `);
        return stmt.all(email);
    }
    async deleteTempDeviceBindingsByEmail(email) {
        const stmt = this.db.prepare('DELETE FROM temp_device_bindings WHERE email = ?');
        stmt.run(email);
    }
    async createAuditLog(data) {
        const stmt = this.db.prepare(`
      INSERT INTO audit_logs (id, user_id, org_id, action, ip_address, user_agent, metadata, created_at) 
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
    `);
        stmt.run(data.id, data.userId, data.orgId, data.action, data.ipAddress, data.userAgent, JSON.stringify(data.metadata));
    }
    async getAuditLogsByOrg(orgId, options) {
        const offset = (options.page - 1) * options.limit;
        // Build WHERE clauses
        let whereClauses = ['org_id = ?'];
        let params = [orgId];
        if (options.filters?.userId) {
            whereClauses.push('user_id = ?');
            params.push(options.filters.userId);
        }
        if (options.filters?.action) {
            whereClauses.push('action LIKE ?');
            params.push(`%${options.filters.action}%`);
        }
        const whereSQL = whereClauses.join(' AND ');
        // Get total count
        const countStmt = this.db.prepare(`SELECT COUNT(*) as count FROM audit_logs WHERE ${whereSQL}`);
        const totalCount = countStmt.get(params).count;
        // Get paginated data
        const logsStmt = this.db.prepare(`
      SELECT * FROM audit_logs 
      WHERE ${whereSQL} 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `);
        const logs = logsStmt.all([...params, options.limit, offset]);
        return { logs, totalCount };
    }
}
class PostgreSQLAdapter {
    constructor() {
        const { Pool } = require('pg');
        this.pool = new Pool({
            connectionString: process.env.POSTGRES_URL,
            ssl: { rejectUnauthorized: false }
        });
    }
    async createOrganization(orgData) {
        await this.pool.query(`INSERT INTO organizations (id, name, industry, size, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, NOW(), NOW())`, [orgData.id, orgData.name, orgData.industry, orgData.size]);
    }
    async getOrganizationById(id) {
        const result = await this.pool.query('SELECT * FROM organizations WHERE id = $1', [id]);
        return result.rows[0];
    }
    async createUser(userData) {
        await this.pool.query(`INSERT INTO users (id, full_name, email, password_hash, totp_secret, is_active, created_at, updated_at) 
       VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())`, [userData.id, userData.fullName, userData.email, userData.passwordHash, userData.totpSecret]);
    }
    async getUserByEmail(email) {
        const result = await this.pool.query('SELECT * FROM users WHERE email = $1 AND is_active = true', [email]);
        return result.rows[0];
    }
    async getUserById(id) {
        const result = await this.pool.query('SELECT * FROM users WHERE id = $1', [id]);
        return result.rows[0];
    }
    async getAllUsers() {
        const result = await this.pool.query('SELECT * FROM users');
        return result.rows;
    }
    async updateUserTotpSecret(userId, totpSecret) {
        await this.pool.query('UPDATE users SET totp_secret = $1, updated_at = NOW() WHERE id = $2', [totpSecret, userId]);
    }
    async createTeamMember(data) {
        await this.pool.query(`INSERT INTO team_members (id, user_id, org_id, role, joined_at) 
       VALUES ($1, $2, $3, $4, NOW())`, [data.id, data.userId, data.orgId, data.role]);
    }
    async getTeamMembersByOrgId(orgId) {
        const result = await this.pool.query(`
      SELECT u.id as user_id, u.full_name, u.email, tm.role 
      FROM users u
      JOIN team_members tm ON u.id = tm.user_id 
      WHERE tm.org_id = $1
    `, [orgId]);
        return result.rows;
    }
    async getTeamMemberByUserAndOrg(userId, orgId) {
        const result = await this.pool.query('SELECT * FROM team_members WHERE user_id = $1 AND org_id = $2', [userId, orgId]);
        return result.rows[0];
    }
    async getTeamMemberByEmailAndOrg(email, orgId) {
        const result = await this.pool.query(`
      SELECT tm.id FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE u.email = $1 AND tm.org_id = $2
    `, [email, orgId]);
        return result.rows[0];
    }
    async getUserOrganizations(userId) {
        const result = await this.pool.query(`
      SELECT tm.org_id, tm.role, o.name as org_name, o.industry, o.size
      FROM team_members tm 
      JOIN organizations o ON tm.org_id = o.id
      WHERE tm.user_id = $1
    `, [userId]);
        return result.rows;
    }
    async updateTeamMemberRole(userId, orgId, role) {
        await this.pool.query('UPDATE team_members SET role = $1 WHERE user_id = $2 AND org_id = $3', [role, userId, orgId]);
    }
    async removeTeamMember(userId, orgId) {
        await this.pool.query('DELETE FROM team_members WHERE user_id = $1 AND org_id = $2', [userId, orgId]);
    }
    async createInvite(inviteData) {
        await this.pool.query(`INSERT INTO invites (id, org_id, email, code, role, expires_at, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`, [inviteData.id, inviteData.orgId, inviteData.email, inviteData.code, inviteData.role, inviteData.expiresAt]);
    }
    async getValidInviteByCode(code) {
        const result = await this.pool.query('SELECT * FROM invites WHERE code = $1 AND expires_at > NOW() AND used_at IS NULL', [code]);
        return result.rows[0];
    }
    async getInvitesByOrgId(orgId) {
        const result = await this.pool.query(`
      SELECT id, email, role, code, expires_at, created_at, used_at
      FROM invites 
      WHERE org_id = $1
      ORDER BY created_at DESC
    `, [orgId]);
        return result.rows;
    }
    async deleteInviteById(inviteId, orgId) {
        const result = await this.pool.query('DELETE FROM invites WHERE id = $1 AND org_id = $2', [inviteId, orgId]);
        return result.rowCount || 0;
    }
    async markInviteAsUsed(inviteId) {
        await this.pool.query('UPDATE invites SET used_at = NOW() WHERE id = $1', [inviteId]);
    }
    async createDeviceBinding(data) {
        await this.pool.query(`INSERT INTO device_bindings (id, user_id, instance_id, device_fingerprint_hash, created_at) 
       VALUES ($1, $2, $3, $4, NOW())`, [data.id, data.userId, data.instanceId, data.deviceFingerprintHash]);
    }
    async getDeviceBindingsByUser(userId) {
        const result = await this.pool.query('SELECT * FROM device_bindings WHERE user_id = $1', [userId]);
        return result.rows;
    }
    async createTempDeviceBinding(data) {
        await this.pool.query(`INSERT INTO temp_device_bindings (id, email, instance_id, device_fingerprint_hash, is_org_creator, created_at, expires_at) 
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW() + INTERVAL '1 hour')
       ON CONFLICT (email) DO UPDATE SET 
       instance_id = $3, device_fingerprint_hash = $4, is_org_creator = $5, created_at = NOW(), expires_at = NOW() + INTERVAL '1 hour'`, [data.id, data.email, data.instanceId, data.deviceFingerprintHash, data.isOrgCreator]);
    }
    async getTempDeviceBindingsByEmail(email) {
        const result = await this.pool.query(`
      SELECT * FROM temp_device_bindings 
      WHERE email = $1 AND expires_at > NOW()
    `, [email]);
        return result.rows;
    }
    async deleteTempDeviceBindingsByEmail(email) {
        await this.pool.query('DELETE FROM temp_device_bindings WHERE email = $1', [email]);
    }
    async createAuditLog(data) {
        await this.pool.query(`INSERT INTO audit_logs (id, user_id, org_id, action, ip_address, user_agent, metadata, created_at) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`, [data.id, data.userId, data.orgId, data.action, data.ipAddress, data.userAgent, JSON.stringify(data.metadata)]);
    }
    async getAuditLogsByOrg(orgId, options) {
        const offset = (options.page - 1) * options.limit;
        // Build WHERE clauses
        let whereClauses = ['org_id = $1'];
        let params = [orgId];
        let paramIndex = 2;
        if (options.filters?.userId) {
            whereClauses.push(`user_id = $${paramIndex++}`);
            params.push(options.filters.userId);
        }
        if (options.filters?.action) {
            whereClauses.push(`action ILIKE $${paramIndex++}`);
            params.push(`%${options.filters.action}%`);
        }
        const whereSQL = whereClauses.join(' AND ');
        // Get total count
        const countResult = await this.pool.query(`SELECT COUNT(*) FROM audit_logs WHERE ${whereSQL}`, params);
        const totalCount = parseInt(countResult.rows[0].count, 10);
        // Get paginated data
        const logsResult = await this.pool.query(`
      SELECT * FROM audit_logs 
      WHERE ${whereSQL} 
      ORDER BY created_at DESC 
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `, [...params, options.limit, offset]);
        return { logs: logsResult.rows, totalCount };
    }
}
// Export the appropriate adapter based on environment
exports.dbAdapter = isProduction ? new PostgreSQLAdapter() : new SQLiteAdapter();
console.log(`🔌 Database adapter initialized: ${isProduction ? 'PostgreSQL' : 'SQLite'}`);
