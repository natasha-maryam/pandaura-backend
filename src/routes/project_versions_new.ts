import express from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authMiddleware';
import { ProjectVersionsTable } from '../db/tables/project_versions';
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

// GET /:projectId/versions - List all versions
router.get('/:projectId/versions', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
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

// POST /:projectId/create-version - Create new version
router.post('/:projectId/create-version', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
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

// GET /:projectId/version/:versionNumber - Get specific version
router.get('/:projectId/version/:versionNumber', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
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

// POST /:projectId/version/:versionNumber/rollback - Rollback to version
router.post('/:projectId/version/:versionNumber/rollback', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
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

// DELETE /:projectId/version/:versionNumber - Delete version
router.delete('/:projectId/version/:versionNumber', authenticateToken, authorizeProjectAccess, async (req: ProjectAuthRequest, res) => {
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

    await ProjectVersionsTable.deleteVersion(projectId, versionNumber, userId);

    // Log audit event
    await logAuditEvent({
      userId,
      action: 'delete_version',
      metadata: { 
        projectId, 
        deletedVersion: versionNumber
      },
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ 
      success: true, 
      message: `Successfully deleted version ${versionNumber}`
    });
  } catch (error: any) {
    console.error('Error deleting version:', error);
    const errorMessage = error.message || 'Internal server error';
    res.status(error.message?.includes('Cannot delete') ? 400 : 500)
      .json({ error: errorMessage });
  }
});

export default router;
