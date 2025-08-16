"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const project_versions_1 = require("../db/tables/project_versions");
const project_autosave_1 = require("../db/tables/project_autosave");
const auditLogger_1 = require("../middleware/auditLogger");
const router = express_1.default.Router();
// Get version history
router.get('/projects/:projectId/versions', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        const versions = await project_versions_1.ProjectVersionsTable.getVersionHistory(projectId);
        res.json(versions);
    }
    catch (error) {
        console.error('Error fetching version history:', error);
        res.status(500).json({ error: 'Failed to fetch version history' });
    }
});
// Create new version (manual save)
router.post('/projects/:projectId/versions', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const userId = req.user?.userId;
        const { state, message } = req.body;
        if (!userId || !projectId || !state) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const versionId = await project_versions_1.ProjectVersionsTable.createVersion({
            project_id: projectId,
            user_id: userId,
            state,
            message,
            timestamp: Math.floor(Date.now() / 1000)
        });
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'create_version',
            metadata: { projectId, versionId, message }
        });
        res.json({ success: true, versionId });
    }
    catch (error) {
        console.error('Error creating version:', error);
        res.status(500).json({ error: 'Failed to create version' });
    }
});
// Restore to version
router.post('/projects/:projectId/versions/:versionNumber/restore', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const versionNumber = parseInt(req.params.versionNumber, 10);
        const userId = req.user?.userId;
        if (!userId || isNaN(projectId) || isNaN(versionNumber)) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }
        await project_versions_1.ProjectVersionsTable.restoreVersion(projectId, versionNumber, userId);
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'restore_version',
            metadata: { projectId, versionNumber }
        });
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error restoring version:', error);
        res.status(500).json({ error: 'Failed to restore version' });
    }
});
// Auto-save project state
router.post('/projects/:projectId/auto-save', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const userId = req.user?.userId;
        const { state } = req.body;
        if (!userId || !projectId || !state) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        await project_autosave_1.ProjectAutoSaveTable.saveState({
            project_id: projectId,
            user_id: userId,
            state,
            timestamp: Math.floor(Date.now() / 1000)
        });
        // Clean up old auto-saves
        await project_autosave_1.ProjectAutoSaveTable.cleanOldStates(projectId);
        res.json({ success: true });
    }
    catch (error) {
        console.error('Error auto-saving project:', error);
        res.status(500).json({ error: 'Failed to auto-save project' });
    }
});
// Get latest auto-save
router.get('/projects/:projectId/auto-save', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const userId = req.user?.userId;
        if (!userId || isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid parameters' });
        }
        const state = await project_autosave_1.ProjectAutoSaveTable.getLatestState(projectId, userId);
        res.json(state);
    }
    catch (error) {
        console.error('Error fetching auto-save:', error);
        res.status(500).json({ error: 'Failed to fetch auto-save' });
    }
});
exports.default = router;
