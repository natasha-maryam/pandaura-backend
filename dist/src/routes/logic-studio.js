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
// Middleware to authorize project access
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
        next();
    }
    catch (error) {
        console.error('Error in project authorization:', error);
        res.status(500).json({ error: 'Authorization check failed' });
    }
};
// GET /:projectId/logic-studio - Get Logic Studio state
router.get('/:projectId/logic-studio', authMiddleware_1.authenticateToken, authorizeProjectAccess, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const logicStudio = await (0, knex_1.default)('logic_studio')
            .where({ project_id: projectId })
            .first();
        if (!logicStudio) {
            // Return default state if no logic studio record exists yet
            return res.json({
                success: true,
                data: {
                    id: null,
                    project_id: projectId,
                    code: '',
                    ai_prompt: '',
                    vendor: 'siemens',
                    ui_state: {
                        showPendingChanges: false,
                        showAISuggestions: false,
                        vendorContextEnabled: false,
                        isCollapsed: false,
                        collapseLevel: 0
                    }
                }
            });
        }
        res.json({
            success: true,
            data: logicStudio
        });
    }
    catch (error) {
        console.error('Error fetching Logic Studio state:', error);
        res.status(500).json({ error: 'Failed to fetch Logic Studio state' });
    }
});
// POST /:projectId/logic-studio - Create or update Logic Studio state
router.post('/:projectId/logic-studio', authMiddleware_1.authenticateToken, authorizeProjectAccess, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const userId = req.user?.userId;
        const { code, ai_prompt, vendor, ui_state } = req.body;
        // Check if record exists
        const existingLogicStudio = await (0, knex_1.default)('logic_studio')
            .where({ project_id: projectId })
            .first();
        let result;
        if (existingLogicStudio) {
            // Update existing record
            result = await (0, knex_1.default)('logic_studio')
                .where({ project_id: projectId })
                .update({
                code: code || existingLogicStudio.code,
                ai_prompt: ai_prompt !== undefined ? ai_prompt : existingLogicStudio.ai_prompt,
                vendor: vendor || existingLogicStudio.vendor,
                ui_state: ui_state || existingLogicStudio.ui_state,
                updated_at: new Date().toISOString()
            })
                .returning('*');
        }
        else {
            // Create new record
            result = await (0, knex_1.default)('logic_studio')
                .insert({
                project_id: projectId,
                user_id: userId,
                code: code || '',
                ai_prompt: ai_prompt || '',
                vendor: vendor || 'siemens',
                ui_state: ui_state || {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .returning('*');
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId,
            action: existingLogicStudio ? 'update_logic_studio' : 'create_logic_studio',
            metadata: {
                projectId,
                codeLength: code?.length || 0,
                vendor: vendor || 'siemens'
            },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        res.json({
            success: true,
            data: result[0],
            message: `Logic Studio state ${existingLogicStudio ? 'updated' : 'created'} successfully`
        });
    }
    catch (error) {
        console.error('Error saving Logic Studio state:', error);
        res.status(500).json({ error: 'Failed to save Logic Studio state' });
    }
});
// PUT /:projectId/logic-studio/code - Update just the code
router.put('/:projectId/logic-studio/code', authMiddleware_1.authenticateToken, authorizeProjectAccess, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const userId = req.user?.userId;
        const { code } = req.body;
        if (typeof code !== 'string') {
            return res.status(400).json({ error: 'Code must be a string' });
        }
        // Ensure record exists
        const existingLogicStudio = await (0, knex_1.default)('logic_studio')
            .where({ project_id: projectId })
            .first();
        if (!existingLogicStudio) {
            // Create new record with just the code
            await (0, knex_1.default)('logic_studio')
                .insert({
                project_id: projectId,
                user_id: userId,
                code: code,
                ai_prompt: '',
                vendor: 'siemens',
                ui_state: {},
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }
        else {
            // Update existing record
            await (0, knex_1.default)('logic_studio')
                .where({ project_id: projectId })
                .update({
                code: code,
                updated_at: new Date().toISOString()
            });
        }
        res.json({
            success: true,
            message: 'Logic Studio code updated successfully'
        });
    }
    catch (error) {
        console.error('Error updating Logic Studio code:', error);
        res.status(500).json({ error: 'Failed to update Logic Studio code' });
    }
});
// DELETE /:projectId/logic-studio - Delete Logic Studio state
router.delete('/:projectId/logic-studio', authMiddleware_1.authenticateToken, authorizeProjectAccess, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId, 10);
        const userId = req.user?.userId;
        const deletedRows = await (0, knex_1.default)('logic_studio')
            .where({ project_id: projectId })
            .del();
        if (deletedRows === 0) {
            return res.status(404).json({ error: 'Logic Studio state not found' });
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'delete_logic_studio',
            metadata: { projectId },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        res.json({
            success: true,
            message: 'Logic Studio state deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting Logic Studio state:', error);
        res.status(500).json({ error: 'Failed to delete Logic Studio state' });
    }
});
exports.default = router;
