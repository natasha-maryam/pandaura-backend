import express from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authMiddleware';
import { ProjectVersionsTable } from '../db/tables/project_versions';
import { ProjectAutoSaveTable } from '../db/tables/project_autosave';
import { logAuditEvent } from '../middleware/auditLogger';

const router = express.Router();

// Get version history
router.get('/projects/:projectId/versions', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const versions = await ProjectVersionsTable.getVersionHistory(projectId);
    res.json(versions);
  } catch (error) {
    console.error('Error fetching version history:', error);
    res.status(500).json({ error: 'Failed to fetch version history' });
  }
});

// Create new version (manual save)
router.post('/projects/:projectId/versions', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const userId = req.user?.userId;
    const { state, message } = req.body;

    if (!userId || !projectId || !state) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const versionId = await ProjectVersionsTable.createVersion({
      project_id: projectId,
      user_id: userId,
      state,
      message,
      timestamp: Math.floor(Date.now() / 1000)
    });

    // Log audit event
    await logAuditEvent({
      userId,
      action: 'create_version',
      metadata: { projectId, versionId, message }
    });

    res.json({ success: true, versionId });
  } catch (error) {
    console.error('Error creating version:', error);
    res.status(500).json({ error: 'Failed to create version' });
  }
});

// Restore to version
router.post('/projects/:projectId/versions/:versionNumber/restore', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const versionNumber = parseInt(req.params.versionNumber, 10);
    const userId = req.user?.userId;

    if (!userId || isNaN(projectId) || isNaN(versionNumber)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    await ProjectVersionsTable.restoreVersion(projectId, versionNumber, userId);

    // Log audit event
    await logAuditEvent({
      userId,
      action: 'restore_version',
      metadata: { projectId, versionNumber }
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error restoring version:', error);
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

// Auto-save project state
router.post('/projects/:projectId/auto-save', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const userId = req.user?.userId;
    const { state } = req.body;

    if (!userId || !projectId || !state) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await ProjectAutoSaveTable.saveState({
      project_id: projectId,
      user_id: userId,
      state,
      timestamp: Math.floor(Date.now() / 1000)
    });

    // Clean up old auto-saves
    await ProjectAutoSaveTable.cleanOldStates(projectId);

    res.json({ success: true });
  } catch (error) {
    console.error('Error auto-saving project:', error);
    res.status(500).json({ error: 'Failed to auto-save project' });
  }
});

// Get latest auto-save
router.get('/projects/:projectId/auto-save', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const userId = req.user?.userId;

    if (!userId || isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid parameters' });
    }

    const state = await ProjectAutoSaveTable.getLatestState(projectId, userId);
    res.json(state);
  } catch (error) {
    console.error('Error fetching auto-save:', error);
    res.status(500).json({ error: 'Failed to fetch auto-save' });
  }
});

export default router;
