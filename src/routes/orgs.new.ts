import express from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authMiddleware';
import DatabaseService from '../db/database-service-clean';
import { logAuditEvent } from '../middleware/auditLogger';

const router = express.Router();

// Get all organizations (admin only)
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    // Check if user is admin (you may want to add proper RBAC middleware)
    const user = await DatabaseService.getUserById(req.user!.userId);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const organizations = await DatabaseService.getAllOrganizations();
    
    res.json({
      organizations,
      totalCount: organizations.length
    });
  } catch (error: any) {
    console.error('Error fetching organizations:', error);
    res.status(500).json({ error: 'Failed to fetch organizations' });
  }
});

// Get organization by ID
router.get('/:orgId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    
    // Verify user has access to this organization
    const teamMember = await DatabaseService.getTeamMemberByUserAndOrg(req.user!.userId, orgId);
    if (!teamMember) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this organization.' });
    }

    const organization = await DatabaseService.getOrganizationById(orgId);
    if (!organization) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    res.json({
      organization,
      userRole: teamMember.role
    });
  } catch (error: any) {
    console.error('Error fetching organization:', error);
    res.status(500).json({ error: 'Failed to fetch organization' });
  }
});

// Get organization members
router.get('/:orgId/members', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    
    // Verify user has access to this organization
    const teamMember = await DatabaseService.getTeamMemberByUserAndOrg(req.user!.userId, orgId);
    if (!teamMember) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this organization.' });
    }

    const members = await DatabaseService.getUsersByOrganization(orgId);
    
    res.json({
      members,
      totalCount: members.length
    });
  } catch (error: any) {
    console.error('Error fetching organization members:', error);
    res.status(500).json({ error: 'Failed to fetch organization members' });
  }
});

// Update organization
router.put('/:orgId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const { name } = req.body;
    
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Organization name is required' });
    }

    // Verify user is admin of this organization
    const teamMember = await DatabaseService.getTeamMemberByUserAndOrg(req.user!.userId, orgId);
    if (!teamMember || teamMember.role !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const updatedOrg = await DatabaseService.updateOrganization(orgId, {
      name: name.trim()
    });

    if (!updatedOrg) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
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
  } catch (error: any) {
    console.error('Error updating organization:', error);
    res.status(500).json({ error: 'Failed to update organization' });
  }
});

// Get organization invites
router.get('/:orgId/invites', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    
    // Verify user is admin of this organization
    const teamMember = await DatabaseService.getTeamMemberByUserAndOrg(req.user!.userId, orgId);
    if (!teamMember || teamMember.role !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    const invites = await DatabaseService.getInvitesByOrganization(orgId);
    
    res.json({
      invites,
      totalCount: invites.length
    });
  } catch (error: any) {
    console.error('Error fetching organization invites:', error);
    res.status(500).json({ error: 'Failed to fetch organization invites' });
  }
});

// Delete/revoke an invite
router.delete('/:orgId/invites/:inviteId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId, inviteId } = req.params;
    
    // Verify user is admin of this organization
    const teamMember = await DatabaseService.getTeamMemberByUserAndOrg(req.user!.userId, orgId);
    if (!teamMember || teamMember.role !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    // Verify invite belongs to this organization
    const invite = await DatabaseService.getInviteById(inviteId);
    if (!invite || invite.organization_id !== orgId) {
      return res.status(404).json({ error: 'Invite not found' });
    }

    await DatabaseService.deleteInvite(inviteId);

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      orgId,
      action: `Revoked invite for: ${invite.email}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { orgId, inviteId, email: invite.email }
    });

    res.json({ message: 'Invite revoked successfully' });
  } catch (error: any) {
    console.error('Error revoking invite:', error);
    res.status(500).json({ error: 'Failed to revoke invite' });
  }
});

// Remove member from organization
router.delete('/:orgId/members/:userId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId, userId } = req.params;
    
    // Verify user is admin of this organization
    const teamMember = await DatabaseService.getTeamMemberByUserAndOrg(req.user!.userId, orgId);
    if (!teamMember || teamMember.role !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    // Cannot remove yourself if you're the only admin
    if (userId === req.user!.userId) {
      const adminCount = await DatabaseService.getAdminCountByOrganization(orgId);
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot remove the last admin from the organization' });
      }
    }

    // Get user info before removal for logging
    const userToRemove = await DatabaseService.getUserById(userId);
    if (!userToRemove) {
      return res.status(404).json({ error: 'User not found' });
    }

    await DatabaseService.removeTeamMember(userId, orgId);

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      orgId,
      action: `Removed user ${userToRemove.email} from organization`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { orgId, removedUserId: userId, removedUserEmail: userToRemove.email }
    });

    res.json({ message: 'Member removed successfully' });
  } catch (error: any) {
    console.error('Error removing member:', error);
    res.status(500).json({ error: 'Failed to remove member' });
  }
});

// Update member role
router.put('/:orgId/members/:userId/role', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId, userId } = req.params;
    const { role } = req.body;
    
    if (!role || !['Admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'Valid role is required (Admin or user)' });
    }

    // Verify user is admin of this organization
    const teamMember = await DatabaseService.getTeamMemberByUserAndOrg(req.user!.userId, orgId);
    if (!teamMember || teamMember.role !== 'Admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }

    // Cannot demote yourself if you're the only admin
    if (userId === req.user!.userId && role !== 'Admin') {
      const adminCount = await DatabaseService.getAdminCountByOrganization(orgId);
      if (adminCount <= 1) {
        return res.status(400).json({ error: 'Cannot demote the last admin of the organization' });
      }
    }

    // Get user info for logging
    const userToUpdate = await DatabaseService.getUserById(userId);
    if (!userToUpdate) {
      return res.status(404).json({ error: 'User not found' });
    }

    await DatabaseService.updateTeamMemberRole(userId, orgId, role);

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      orgId,
      action: `Updated role for ${userToUpdate.email} to: ${role}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { orgId, targetUserId: userId, targetUserEmail: userToUpdate.email, newRole: role }
    });

    res.json({ message: 'Member role updated successfully' });
  } catch (error: any) {
    console.error('Error updating member role:', error);
    res.status(500).json({ error: 'Failed to update member role' });
  }
});

// Get organization activity log
router.get('/:orgId/activity', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { orgId } = req.params;
    const { limit = '50', offset = '0' } = req.query;
    
    // Verify user has access to this organization
    const teamMember = await DatabaseService.getTeamMemberByUserAndOrg(req.user!.userId, orgId);
    if (!teamMember) {
      return res.status(403).json({ error: 'Access denied. You are not a member of this organization.' });
    }

    const activities = await DatabaseService.getActivityLogByOrganization(
      orgId, 
      parseInt(limit as string), 
      parseInt(offset as string)
    );
    
    res.json({
      activities,
      totalCount: activities.length
    });
  } catch (error: any) {
    console.error('Error fetching organization activity:', error);
    res.status(500).json({ error: 'Failed to fetch organization activity' });
  }
});

export default router;
