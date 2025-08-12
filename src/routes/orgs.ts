import express from 'express';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database-adapter';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authMiddleware';
import { rbacMiddleware } from '../middleware/rbacMiddleware';
import { logAuditEvent } from '../middleware/auditLogger';

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// Get organization details - Viewer+
router.get('/:orgId', rbacMiddleware('Viewer'), async (req: AuthenticatedRequest, res) => {
  const { orgId } = req.params;

  try {
    const org = await db.getOrganizationById(orgId);

    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      orgId,
      action: 'Viewed organization details',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json(org);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List org members - Viewer+
router.get('/:orgId/members', rbacMiddleware('Viewer'), async (req: AuthenticatedRequest, res) => {
  const { orgId } = req.params;

  try {
    const members = await db.getTeamMembersByOrgId(orgId);

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      orgId,
      action: 'Viewed organization members',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json(members);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create invite - Admin only
router.post('/:orgId/invites', rbacMiddleware('Admin'), async (req: AuthenticatedRequest, res) => {
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
    const existingMember = await db.getTeamMemberByEmailAndOrg(email.toLowerCase(), orgId);

    if (existingMember) {
      return res.status(400).json({ error: 'User is already a member of this organization' });
    }

    // Generate secure invite code
    const inviteCode = crypto.randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + (expiresInDays * 24 * 60 * 60 * 1000));

    await db.createInvite({
      id: uuidv4(),
      orgId,
      email: email.toLowerCase(),
      code: inviteCode,
      role,
      expiresAt
    });

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// List pending invites - Admin only
router.get('/:orgId/invites', rbacMiddleware('Admin'), async (req: AuthenticatedRequest, res) => {
  const { orgId } = req.params;

  try {
    const invites = await db.getInvitesByOrgId(orgId);
    res.json(invites);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Delete/revoke invite - Admin only
router.delete('/:orgId/invites/:inviteId', rbacMiddleware('Admin'), async (req: AuthenticatedRequest, res) => {
  const { orgId, inviteId } = req.params;

  try {
    const result = await db.deleteInviteById(inviteId, orgId);

    if (result === 0) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      orgId,
      action: `Revoked invite ${inviteId}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { inviteId }
    });

    res.json({ message: 'Invite revoked successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Update member role - Admin only
router.put('/:orgId/members/:userId/role', rbacMiddleware('Admin'), async (req: AuthenticatedRequest, res) => {
  const { orgId, userId } = req.params;
  const { role } = req.body;

  if (!role || !['Admin', 'Editor', 'Viewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // Prevent self-role change to non-admin (to avoid lockout)
  if (req.user!.userId === userId && role !== 'Admin') {
    return res.status(400).json({ error: 'Cannot remove admin role from yourself' });
  }

  try {
    // Update team member role
    await db.updateTeamMemberRole(userId, orgId, role);

    // Get user info for audit log
    const user = await db.getUserById(userId);

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      orgId,
      action: `Updated role for ${user?.email || userId} to ${role}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { targetUserId: userId, newRole: role, targetUserEmail: user?.email }
    });

    res.json({ message: 'Member role updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Remove member from organization - Admin only
router.delete('/:orgId/members/:userId', rbacMiddleware('Admin'), async (req: AuthenticatedRequest, res) => {
  const { orgId, userId } = req.params;

  // Prevent self-removal (to avoid lockout)
  if (req.user!.userId === userId) {
    return res.status(400).json({ error: 'Cannot remove yourself from the organization' });
  }

  try {
    // Get user info before deletion for audit log
    const user = await db.getUserById(userId);
    const teamMember = await db.getTeamMemberByUserAndOrg(userId, orgId);

    if (!user || !teamMember) {
      return res.status(404).json({ error: 'Team member not found' });
    }

    // Remove the team member
    await db.removeTeamMember(userId, orgId);

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get audit logs for organization - Admin only
router.get('/:orgId/audit-logs', rbacMiddleware('Admin'), async (req: AuthenticatedRequest, res) => {
  const { orgId } = req.params;
  const { page = 1, limit = 50, filter } = req.query;
  const offset = (Number(page) - 1) * Number(limit);

  try {
    // Parse filter JSON safely
    let filterObj: any = {};
    try {
      filterObj = filter ? JSON.parse(filter as string) : {};
    } catch {
      return res.status(400).json({ error: 'Invalid filter JSON' });
    }

    // Build WHERE clauses dynamically
    let whereClauses = [`org_id = ?`];
    const params: any[] = [orgId];
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

    // Use the database abstraction layer for audit logs
    const result = await db.getAuditLogsByOrg(orgId, {
      page: Number(page),
      limit: Number(limit),
      filters: filterObj
    });

    res.json({
      page: Number(page),
      limit: Number(limit),
      totalCount: result.totalCount,
      totalPages: Math.ceil(result.totalCount / Number(limit)),
      logs: result.logs.map((log: any) => ({
        ...log,
        metadata: typeof log.metadata === 'string' ? JSON.parse(log.metadata) : log.metadata,
        created_at: log.created_at
      }))
    });
  } catch (err) {
    console.error('Audit logs fetch error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
