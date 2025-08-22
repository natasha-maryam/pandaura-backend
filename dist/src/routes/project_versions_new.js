"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const knex_1 = __importDefault(require("../db/knex"));
const auditLogger_1 = require("../middleware/auditLogger");
const router = express_1.default.Router();
// Middleware to authorize project access (zero-trust principle)
const authorizeProjectAccess = async (req, res, next) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const userId = req.user?.userId;
        if (!userId || isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID or user not authenticated' });
        }
        // Verify user has access to this project
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: userId })
            .first();
        if (!project) {
            return res.status(403).json({ error: 'Access denied to this project' });
        }
        // Store project info for later use
        req.project = project;
        next();
    }
    catch (error) {
        console.error('Error in project authorization:', error);
        res.status(500).json({ error: 'Authorization check failed' });
    }
};
// GET /:projectId/versions - List all versions
router.get('/:projectId/versions', authMiddleware_1.authenticateToken, authorizeProjectAccess, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        // Get versions from database
        const versions = await (0, knex_1.default)('project_versions')
            .where('project_id', projectId)
            .orderBy('version_number', 'desc');
        // Return metadata only (not full snapshots)
        const versionMetadata = versions.map((version) => ({
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
    }
    catch (error) {
        console.error('Error fetching version history:', error);
        res.status(500).json({ error: 'Failed to fetch version history' });
    }
});
// POST /:projectId/create-version - Create new version
router.post('/:projectId/create-version', authMiddleware_1.authenticateToken, authorizeProjectAccess, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const userId = req.user?.userId;
        const { state, message, isAuto = false } = req.body;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        // For now, implement basic version creation
        const latestVersion = await (0, knex_1.default)('project_versions')
            .where('project_id', projectId)
            .max('version_number as max_version')
            .first();
        const nextVersionNumber = (latestVersion?.max_version || 0) + 1;
        // Get current project data
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        // Get all tags for this project
        const tags = await (0, knex_1.default)('tags')
            .where({ project_id: projectId })
            .select('*');
        // Create comprehensive version data including Logic Studio state and tags
        const versionData = {
            projectMetadata: project,
            timestamp: Date.now(),
            logicStudioCode: state?.code || state?.content || '', // Store Logic Studio code
            tags: tags, // Store all project tags at the time of version save
            moduleStates: {
                LogicStudio: state || {}
            },
            state: state || {}, // Store the complete Logic Studio state
            autosaveState: state && state.module === 'LogicStudio' ? state : null, // Also store as autosave state for compatibility
        };
        // Create version record
        const [version] = await (0, knex_1.default)('project_versions')
            .insert({
            project_id: projectId,
            user_id: userId,
            version_number: nextVersionNumber,
            data: JSON.stringify(versionData),
            message: message || `Version ${nextVersionNumber}`,
            is_auto: isAuto,
            created_at: new Date().toISOString()
        })
            .returning('*');
        const versionNumber = nextVersionNumber;
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
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
        res.json({ success: true, versionId: versionNumber });
    }
    catch (error) {
        console.error('Error saving project version:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// GET /:projectId/version/:versionNumber - Get specific version
router.get('/:projectId/version/:versionNumber', authMiddleware_1.authenticateToken, authorizeProjectAccess, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const versionNumber = parseInt(req.params.versionNumber, 10);
        if (isNaN(versionNumber) || versionNumber < 1) {
            return res.status(400).json({ error: 'Invalid version number' });
        }
        const version = await (0, knex_1.default)('project_versions')
            .where({ project_id: projectId, version_number: versionNumber })
            .first();
        if (!version) {
            return res.status(404).json({ error: 'Version not found' });
        }
        res.json({ success: true, data: version.data });
    }
    catch (error) {
        console.error('Error fetching project version data:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// POST /:projectId/version/:versionNumber/rollback - Rollback to version
router.post('/:projectId/version/:versionNumber/rollback', authMiddleware_1.authenticateToken, authorizeProjectAccess, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const versionNumber = parseInt(req.params.versionNumber, 10);
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        if (isNaN(versionNumber) || versionNumber < 1) {
            return res.status(400).json({ error: 'Invalid version number' });
        }
        // Get the target version to rollback to
        const targetVersion = await (0, knex_1.default)('project_versions')
            .where({ project_id: projectId, version_number: versionNumber })
            .first();
        if (!targetVersion) {
            return res.status(404).json({ error: 'Version not found' });
        }
        // Create a new version containing the rollback state
        const latestVersion = await (0, knex_1.default)('project_versions')
            .where('project_id', projectId)
            .max('version_number as max_version')
            .first();
        const nextVersionNumber = (latestVersion?.max_version || 0) + 1;
        // Get the target version data to rollback to (data is already a JS object from JSONB column)
        const rollbackData = targetVersion.data;
        // Create a new version record with rollback data
        const [newVersion] = await (0, knex_1.default)('project_versions')
            .insert({
            project_id: projectId,
            user_id: userId,
            version_number: nextVersionNumber,
            data: {
                ...rollbackData,
                rollbackInfo: {
                    sourceVersion: versionNumber,
                    rollbackTimestamp: Date.now(),
                    originalTimestamp: rollbackData.timestamp
                }
            },
            message: `Rollback to version ${versionNumber}`,
            is_auto: false,
            created_at: new Date().toISOString()
        })
            .returning('*');
        // Restore the tags from the rollback version
        if (rollbackData.tags && Array.isArray(rollbackData.tags)) {
            // First, delete existing tags for this project
            await (0, knex_1.default)('tags').where({ project_id: projectId }).del();
            // Then insert the tags from the rollback version
            if (rollbackData.tags.length > 0) {
                const tagsToInsert = rollbackData.tags.map((tag) => ({
                    project_id: projectId,
                    name: tag.name,
                    type: tag.type,
                    data_type: tag.data_type,
                    address: tag.address,
                    default_value: tag.default_value,
                    vendor: tag.vendor,
                    scope: tag.scope
                }));
                await (0, knex_1.default)('tags').insert(tagsToInsert);
            }
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'rollback_version',
            metadata: {
                projectId,
                targetVersion: versionNumber,
                newVersion: nextVersionNumber,
                tagsRestored: rollbackData.tags?.length || 0
            },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        res.json({
            success: true,
            rolledBackTo: versionNumber,
            newVersion: nextVersionNumber,
            logicStudioCode: rollbackData.logicStudioCode || '',
            tags: rollbackData.tags || [],
            state: rollbackData.state || {},
            message: `Successfully rolled back to version ${versionNumber}`
        });
    }
    catch (error) {
        console.error('Error during rollback:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// DELETE /:projectId/version/:versionNumber - Delete version
router.delete('/:projectId/version/:versionNumber', authMiddleware_1.authenticateToken, authorizeProjectAccess, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const versionNumber = parseInt(req.params.versionNumber, 10);
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        if (isNaN(versionNumber) || versionNumber < 1) {
            return res.status(400).json({ error: 'Invalid version number' });
        }
        // Delete the version
        const deletedRows = await (0, knex_1.default)('project_versions')
            .where({
            project_id: projectId,
            version_number: versionNumber,
            user_id: userId
        })
            .del();
        if (deletedRows === 0) {
            return res.status(404).json({ error: 'Version not found or you do not have permission to delete it' });
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
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
    }
    catch (error) {
        console.error('Error deleting version:', error);
        const errorMessage = error.message || 'Internal server error';
        res.status(error.message?.includes('Cannot delete') ? 400 : 500)
            .json({ error: errorMessage });
    }
});
exports.default = router;
