"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const crypto_1 = __importDefault(require("crypto"));
const uuid_1 = require("uuid");
const db_1 = __importDefault(require("../db"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const rbacMiddleware_1 = require("../middleware/rbacMiddleware");
const auditLogger_1 = require("../middleware/auditLogger");
const router = express_1.default.Router();
// All routes require authentication
router.use(authMiddleware_1.authenticateToken);
// Get organization details - Viewer+
router.get('/:orgId', (0, rbacMiddleware_1.rbacMiddleware)('Viewer'), async (req, res) => {
    const { orgId } = req.params;
    try {
        const stmt = db_1.default.prepare(`
      SELECT id, name, industry, size, created_at, updated_at 
      FROM organizations 
      WHERE id = ?
    `);
        const org = stmt.get(orgId);
        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            orgId,
            action: 'Viewed organization details',
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        res.json(org);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// List org members - Viewer+
router.get('/:orgId/members', (0, rbacMiddleware_1.rbacMiddleware)('Viewer'), async (req, res) => {
    const { orgId } = req.params;
    try {
        const stmt = db_1.default.prepare(`
      SELECT u.id as userId, u.full_name, u.email, tm.role, tm.joined_at
      FROM users u
      JOIN team_members tm ON u.id = tm.user_id 
      WHERE tm.org_id = ?
      ORDER BY tm.joined_at ASC
    `);
        const members = stmt.all(orgId);
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            orgId,
            action: 'Viewed organization members',
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        res.json(members);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Create invite - Admin only
router.post('/:orgId/invites', (0, rbacMiddleware_1.rbacMiddleware)('Admin'), async (req, res) => {
    const { orgId } = req.params;
    const { email, role, expiresInDays = 7 } = req.body;
    if (!email || !role) {
        return res.status(400).json({ error: 'Email and role are required' });
    }
    if (!['Admin', 'Editor', 'Viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }
    try {
        // Check if user already exists and is member of org
        const existingStmt = db_1.default.prepare(`
      SELECT tm.id FROM team_members tm
      JOIN users u ON tm.user_id = u.id
      WHERE u.email = ? AND tm.org_id = ?
    `);
        const existingMember = existingStmt.get(email.toLowerCase(), orgId);
        if (existingMember) {
            return res.status(400).json({ error: 'User is already a member of this organization' });
        }
        // Generate secure invite code
        const inviteCode = crypto_1.default.randomBytes(16).toString('hex');
        const expiresAt = Math.floor(Date.now() / 1000) + (expiresInDays * 24 * 60 * 60);
        const stmt = db_1.default.prepare(`
      INSERT INTO invites (id, org_id, email, code, role, expires_at) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
        stmt.run((0, uuid_1.v4)(), orgId, email.toLowerCase(), inviteCode, role, expiresAt);
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            orgId,
            action: `Created invite for ${email} with role ${role}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { email, role, inviteCode, expiresInDays }
        });
        res.json({
            inviteCode,
            email,
            role,
            expiresAt,
            message: 'Invite created successfully'
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// List pending invites - Admin only
router.get('/:orgId/invites', (0, rbacMiddleware_1.rbacMiddleware)('Admin'), async (req, res) => {
    const { orgId } = req.params;
    try {
        const stmt = db_1.default.prepare(`
      SELECT id, email, role, code, expires_at, created_at, used_at
      FROM invites 
      WHERE org_id = ?
      ORDER BY created_at DESC
    `);
        const invites = stmt.all(orgId);
        res.json(invites);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Delete/revoke invite - Admin only
router.delete('/:orgId/invites/:inviteId', (0, rbacMiddleware_1.rbacMiddleware)('Admin'), async (req, res) => {
    const { orgId, inviteId } = req.params;
    try {
        const stmt = db_1.default.prepare(`
      DELETE FROM invites 
      WHERE id = ? AND org_id = ?
    `);
        const result = stmt.run(inviteId, orgId);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Invite not found' });
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            orgId,
            action: `Revoked invite ${inviteId}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { inviteId }
        });
        res.json({ message: 'Invite revoked successfully' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Update member role - Admin only
router.put('/:orgId/members/:userId/role', (0, rbacMiddleware_1.rbacMiddleware)('Admin'), async (req, res) => {
    const { orgId, userId } = req.params;
    const { role } = req.body;
    if (!role || !['Admin', 'Editor', 'Viewer'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role' });
    }
    // Prevent self-role change to non-admin (to avoid lockout)
    if (req.user.userId === userId && role !== 'Admin') {
        return res.status(400).json({ error: 'Cannot remove admin role from yourself' });
    }
    try {
        const stmt = db_1.default.prepare(`
      UPDATE team_members 
      SET role = ? 
      WHERE user_id = ? AND org_id = ?
    `);
        const result = stmt.run(role, userId, orgId);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Team member not found' });
        }
        // Get user info for audit log
        const userStmt = db_1.default.prepare(`SELECT full_name, email FROM users WHERE id = ?`);
        const user = userStmt.get(userId);
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            orgId,
            action: `Updated role for ${user?.email || userId} to ${role}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { targetUserId: userId, newRole: role, targetUserEmail: user?.email }
        });
        res.json({ message: 'Member role updated successfully' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Remove member from organization - Admin only
router.delete('/:orgId/members/:userId', (0, rbacMiddleware_1.rbacMiddleware)('Admin'), async (req, res) => {
    const { orgId, userId } = req.params;
    // Prevent self-removal (to avoid lockout)
    if (req.user.userId === userId) {
        return res.status(400).json({ error: 'Cannot remove yourself from the organization' });
    }
    try {
        // Get user info before deletion for audit log
        const userStmt = db_1.default.prepare(`
      SELECT u.full_name, u.email, tm.role 
      FROM users u
      JOIN team_members tm ON u.id = tm.user_id
      WHERE u.id = ? AND tm.org_id = ?
    `);
        const user = userStmt.get(userId, orgId);
        if (!user) {
            return res.status(404).json({ error: 'Team member not found' });
        }
        const stmt = db_1.default.prepare(`
      DELETE FROM team_members 
      WHERE user_id = ? AND org_id = ?
    `);
        const result = stmt.run(userId, orgId);
        if (result.changes === 0) {
            return res.status(404).json({ error: 'Team member not found' });
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            orgId,
            action: `Removed ${user.email} from organization`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: {
                removedUserId: userId,
                removedUserEmail: user.email,
                removedUserRole: user.role
            }
        });
        res.json({ message: 'Member removed from organization successfully' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Get audit logs for organization - Admin only
router.get('/:orgId/audit-logs', (0, rbacMiddleware_1.rbacMiddleware)('Admin'), async (req, res) => {
    const { orgId } = req.params;
    const { page = 1, limit = 50, filter } = req.query;
    const offset = (Number(page) - 1) * Number(limit);
    try {
        // Parse filter JSON safely
        let filterObj = {};
        try {
            filterObj = filter ? JSON.parse(filter) : {};
        }
        catch {
            return res.status(400).json({ error: 'Invalid filter JSON' });
        }
        // Build WHERE clauses dynamically
        let whereClauses = [`org_id = ?`];
        const params = [orgId];
        let paramIndex = 1;
        if (filterObj.userId) {
            whereClauses.push(`user_id = ?`);
            params.push(filterObj.userId);
            paramIndex++;
        }
        if (filterObj.action) {
            whereClauses.push(`action LIKE ?`);
            params.push(`%${filterObj.action}%`);
            paramIndex++;
        }
        if (filterObj.startDate) {
            whereClauses.push(`created_at >= ?`);
            params.push(Math.floor(new Date(filterObj.startDate).getTime() / 1000));
            paramIndex++;
        }
        if (filterObj.endDate) {
            whereClauses.push(`created_at <= ?`);
            params.push(Math.floor(new Date(filterObj.endDate).getTime() / 1000));
            paramIndex++;
        }
        const whereSQL = `WHERE ${whereClauses.join(' AND ')}`;
        // Get total count
        const countStmt = db_1.default.prepare(`
      SELECT COUNT(*) as count FROM audit_logs ${whereSQL}
    `);
        const totalCount = countStmt.get(...params).count;
        // Fetch page data ordered by most recent
        const logsStmt = db_1.default.prepare(`
      SELECT al.id, al.user_id, al.org_id, al.action, al.ip_address, 
             al.user_agent, al.metadata, al.created_at, u.full_name, u.email
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      ${whereSQL}
      ORDER BY al.created_at DESC
      LIMIT ? OFFSET ?
    `);
        const logs = logsStmt.all(...params, Number(limit), offset);
        res.json({
            page: Number(page),
            limit: Number(limit),
            totalCount,
            totalPages: Math.ceil(totalCount / Number(limit)),
            logs: logs.map((log) => ({
                ...log,
                metadata: log.metadata ? JSON.parse(log.metadata) : null,
                created_at: new Date(log.created_at * 1000).toISOString()
            }))
        });
    }
    catch (err) {
        console.error('Audit logs fetch error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
