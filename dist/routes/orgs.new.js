"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const database_service_clean_1 = __importDefault(require("../db/database-service-clean"));
const auditLogger_1 = require("../middleware/auditLogger");
const router = express_1.default.Router();
// Get all organizations (admin only)
router.get('/', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        // Check if user is admin (you may want to add proper RBAC middleware)
        const user = await database_service_clean_1.default.getUserById(req.user.userId);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }
        const organizations = await database_service_clean_1.default.getAllOrganizations();
        res.json({
            organizations,
            totalCount: organizations.length
        });
    }
    catch (error) {
        console.error('Error fetching organizations:', error);
        res.status(500).json({ error: 'Failed to fetch organizations' });
    }
});
// Get organization by ID
router.get('/:orgId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { orgId } = req.params;
        // Verify user has access to this organization
        const teamMember = await database_service_clean_1.default.getTeamMemberByUserAndOrg(req.user.userId, orgId);
        if (!teamMember) {
            return res.status(403).json({ error: 'Access denied. You are not a member of this organization.' });
        }
        const organization = await database_service_clean_1.default.getOrganizationById(orgId);
        if (!organization) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        res.json({
            organization,
            userRole: teamMember.role
        });
    }
    catch (error) {
        console.error('Error fetching organization:', error);
        res.status(500).json({ error: 'Failed to fetch organization' });
    }
});
// Get organization members
router.get('/:orgId/members', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { orgId } = req.params;
        // Verify user has access to this organization
        const teamMember = await database_service_clean_1.default.getTeamMemberByUserAndOrg(req.user.userId, orgId);
        if (!teamMember) {
            return res.status(403).json({ error: 'Access denied. You are not a member of this organization.' });
        }
        const members = await database_service_clean_1.default.getUsersByOrganization(orgId);
        res.json({
            members,
            totalCount: members.length
        });
    }
    catch (error) {
        console.error('Error fetching organization members:', error);
        res.status(500).json({ error: 'Failed to fetch organization members' });
    }
});
// Update organization
router.put('/:orgId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { orgId } = req.params;
        const { name } = req.body;
        if (!name || typeof name !== 'string' || name.trim().length === 0) {
            return res.status(400).json({ error: 'Organization name is required' });
        }
        // Verify user is admin of this organization
        const teamMember = await database_service_clean_1.default.getTeamMemberByUserAndOrg(req.user.userId, orgId);
        if (!teamMember || teamMember.role !== 'Admin') {
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }
        const updatedOrg = await database_service_clean_1.default.updateOrganization(orgId, {
            name: name.trim()
        });
        if (!updatedOrg) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            orgId,
            action: `Updated organization name to: ${name.trim()}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { orgId, newName: name.trim() }
        });
        res.json({
            message: 'Organization updated successfully',
            organization: updatedOrg
        });
    }
    catch (error) {
        console.error('Error updating organization:', error);
        res.status(500).json({ error: 'Failed to update organization' });
    }
});
// Get organization invites
router.get('/:orgId/invites', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { orgId } = req.params;
        // Verify user is admin of this organization
        const teamMember = await database_service_clean_1.default.getTeamMemberByUserAndOrg(req.user.userId, orgId);
        if (!teamMember || teamMember.role !== 'Admin') {
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }
        const invites = await database_service_clean_1.default.getInvitesByOrganization(orgId);
        res.json({
            invites,
            totalCount: invites.length
        });
    }
    catch (error) {
        console.error('Error fetching organization invites:', error);
        res.status(500).json({ error: 'Failed to fetch organization invites' });
    }
});
// Delete/revoke an invite
router.delete('/:orgId/invites/:inviteId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { orgId, inviteId } = req.params;
        // Verify user is admin of this organization
        const teamMember = await database_service_clean_1.default.getTeamMemberByUserAndOrg(req.user.userId, orgId);
        if (!teamMember || teamMember.role !== 'Admin') {
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }
        // Verify invite belongs to this organization
        const invite = await database_service_clean_1.default.getInviteById(inviteId);
        if (!invite || invite.organization_id !== orgId) {
            return res.status(404).json({ error: 'Invite not found' });
        }
        await database_service_clean_1.default.deleteInvite(inviteId);
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            orgId,
            action: `Revoked invite for: ${invite.email}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { orgId, inviteId, email: invite.email }
        });
        res.json({ message: 'Invite revoked successfully' });
    }
    catch (error) {
        console.error('Error revoking invite:', error);
        res.status(500).json({ error: 'Failed to revoke invite' });
    }
});
// Remove member from organization
router.delete('/:orgId/members/:userId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { orgId, userId } = req.params;
        // Verify user is admin of this organization
        const teamMember = await database_service_clean_1.default.getTeamMemberByUserAndOrg(req.user.userId, orgId);
        if (!teamMember || teamMember.role !== 'Admin') {
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }
        // Cannot remove yourself if you're the only admin
        if (userId === req.user.userId) {
            const adminCount = await database_service_clean_1.default.getAdminCountByOrganization(orgId);
            if (adminCount <= 1) {
                return res.status(400).json({ error: 'Cannot remove the last admin from the organization' });
            }
        }
        // Get user info before removal for logging
        const userToRemove = await database_service_clean_1.default.getUserById(userId);
        if (!userToRemove) {
            return res.status(404).json({ error: 'User not found' });
        }
        await database_service_clean_1.default.removeTeamMember(userId, orgId);
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            orgId,
            action: `Removed user ${userToRemove.email} from organization`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { orgId, removedUserId: userId, removedUserEmail: userToRemove.email }
        });
        res.json({ message: 'Member removed successfully' });
    }
    catch (error) {
        console.error('Error removing member:', error);
        res.status(500).json({ error: 'Failed to remove member' });
    }
});
// Update member role
router.put('/:orgId/members/:userId/role', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { orgId, userId } = req.params;
        const { role } = req.body;
        if (!role || !['Admin', 'user'].includes(role)) {
            return res.status(400).json({ error: 'Valid role is required (Admin or user)' });
        }
        // Verify user is admin of this organization
        const teamMember = await database_service_clean_1.default.getTeamMemberByUserAndOrg(req.user.userId, orgId);
        if (!teamMember || teamMember.role !== 'Admin') {
            return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
        }
        // Cannot demote yourself if you're the only admin
        if (userId === req.user.userId && role !== 'Admin') {
            const adminCount = await database_service_clean_1.default.getAdminCountByOrganization(orgId);
            if (adminCount <= 1) {
                return res.status(400).json({ error: 'Cannot demote the last admin of the organization' });
            }
        }
        // Get user info for logging
        const userToUpdate = await database_service_clean_1.default.getUserById(userId);
        if (!userToUpdate) {
            return res.status(404).json({ error: 'User not found' });
        }
        await database_service_clean_1.default.updateTeamMemberRole(userId, orgId, role);
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            orgId,
            action: `Updated role for ${userToUpdate.email} to: ${role}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { orgId, targetUserId: userId, targetUserEmail: userToUpdate.email, newRole: role }
        });
        res.json({ message: 'Member role updated successfully' });
    }
    catch (error) {
        console.error('Error updating member role:', error);
        res.status(500).json({ error: 'Failed to update member role' });
    }
});
// Get organization activity log
router.get('/:orgId/activity', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { orgId } = req.params;
        const { limit = '50', offset = '0' } = req.query;
        // Verify user has access to this organization
        const teamMember = await database_service_clean_1.default.getTeamMemberByUserAndOrg(req.user.userId, orgId);
        if (!teamMember) {
            return res.status(403).json({ error: 'Access denied. You are not a member of this organization.' });
        }
        const activities = await database_service_clean_1.default.getActivityLogByOrganization(orgId, parseInt(limit), parseInt(offset));
        res.json({
            activities,
            totalCount: activities.length
        });
    }
    catch (error) {
        console.error('Error fetching organization activity:', error);
        res.status(500).json({ error: 'Failed to fetch organization activity' });
    }
});
exports.default = router;
