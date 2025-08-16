import express from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authMiddleware';
import { ProjectVersionsTable } from '../db/tables/project_versions';
import { ProjectAutoSaveTable } from '../db/tables/project_autosave';
import { ProjectsTable } from '../db/tables/projects';
import { logAuditEvent } from '../middleware/auditLogger';

// Extend AuthenticatedRequest to include project
interface ProjectAuthRequest extends AuthenticatedRequest {
  project?: any;
}

const router = express.Router();

// Middleware to authorize project access (zero-trust principle)
const authorizeProjectAccess = async (req: ProjectAuthRequest, res: express.Response, next: express.NextFunction) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const userId = req.user?.userId;

    if (!userId || isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID or user not authenticated' });
    }

    // Verify user has access to this project
    const project = ProjectsTable.getProjectById(projectId, userId);
    if (!project) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    // Store project info for later use
    req.project = project;
    next();
  } catch (error) {
    console.error('Error in project authorization:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
};

// GET /versions/projects/:id/versions - List all versions metadata
router.get('/projects/:projectId/versions', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const versions = await ProjectVersionsTable.getVersionHistory(projectId);
    
    // Return metadata only (not full snapshots)
    const versionMetadata = versions.map(version => ({
      id: version.id,
      version_number: version.version_number,
      user_id: version.user_id,
      created_at: version.created_at,
      message: version.message,
      is_auto: version.is_auto,
      // Include basic snapshot info without full data
      snapshot_info: {
        has_autosave: !!version.data?.autosaveState,
        project_name: version.data?.projectMetadata?.project_name,
        timestamp: version.data?.timestamp
      }
    }));

    res.json({ success: true, versions: versionMetadata });
  } catch (error) {
    console.error('Error fetching version history:', error);
    res.status(500).json({ error: 'Failed to fetch version history' });
  }
});

// GET /versions/projects/:id/version/:version - Get full snapshot for a specific version
router.get('/projects/:projectId/version/:versionNumber', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const versionNumber = parseInt(req.params.versionNumber, 10);

    if (isNaN(versionNumber) || versionNumber < 1) {
      return res.status(400).json({ error: 'Invalid version number' });
    }

    const version = await ProjectVersionsTable.getVersion(projectId, versionNumber);
    if (!version) {
      return res.status(404).json({ error: 'Version not found' });
    }

    res.json({ success: true, data: version.data });
  } catch (error) {
    console.error('Error fetching project version data:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /versions/projects/:id/version - Save new project version (autosave or manual)
router.post('/projects/:projectId/version', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const userId = req.user?.userId!;
    const { message, isAuto = false } = req.body;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const versionNumber = await ProjectVersionsTable.createProjectSnapshot(
      projectId,
      userId,
      message,
      isAuto
    );

    // Log audit event
    await logAuditEvent({
      userId,
      action: isAuto ? 'auto_save_version' : 'manual_save_version',
      metadata: { 
        projectId, 
        versionNumber, 
        message: message || 'No message provided'
      },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ success: true, version: versionNumber });
  } catch (error) {
    console.error('Error saving project version:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /versions/projects/:id/version/:version/rollback - Rollback project to a previous version
router.post('/projects/:projectId/version/:versionNumber/rollback', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const versionNumber = parseInt(req.params.versionNumber, 10);
    const userId = req.user?.userId!;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (isNaN(versionNumber) || versionNumber < 1) {
      return res.status(400).json({ error: 'Invalid version number' });
    }

    const result = await ProjectVersionsTable.rollbackToVersion(projectId, versionNumber, userId);

    // Log audit event
    await logAuditEvent({
      userId,
      action: 'rollback_version',
      metadata: { 
        projectId, 
        targetVersion: versionNumber, 
        newVersion: result.newVersion 
      },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ 
      success: true, 
      rolledBackTo: result.rolledBackTo, 
      newVersion: result.newVersion,
      message: `Successfully rolled back to version ${result.rolledBackTo}. New version ${result.newVersion} created.`
    });
  } catch (error) {
    console.error('Error during rollback:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Auto-save project state
router.post('/projects/:projectId/auto-save', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const userId = req.user?.userId!;
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
router.get('/projects/:projectId/auto-save', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const userId = req.user?.userId!;

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

// Get version audit history for a project
router.get('/projects/:projectId/audit', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const auditHistory = await ProjectVersionsTable.getAuditHistory(projectId);
    
    res.json({ success: true, audit: auditHistory });
  } catch (error) {
    console.error('Error fetching audit history:', error);
    res.status(500).json({ error: 'Failed to fetch audit history' });
  }
});

// Cleanup old versions for a project
router.post('/projects/:projectId/cleanup', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    const { keepCount = 50 } = req.body;
    const userId = req.user?.userId!;

    const deletedCount = await ProjectVersionsTable.cleanupOldVersions(projectId, keepCount);

    // Log audit event
    await logAuditEvent({
      userId,
      action: 'cleanup_versions',
      metadata: { projectId, deletedCount, keepCount }
    });

    res.json({ 
      success: true, 
      message: `Cleaned up ${deletedCount} old versions`,
      deletedCount 
    });
  } catch (error) {
    console.error('Error cleaning up versions:', error);
    res.status(500).json({ error: 'Failed to cleanup versions' });
  }
});

export default router;