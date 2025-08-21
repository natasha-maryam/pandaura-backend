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
// Validation helpers
function validateProjectName(projectName) {
    if (!projectName || typeof projectName !== 'string' || projectName.trim().length === 0) {
        throw new Error('Project name is required and cannot be empty');
    }
    return projectName.trim();
}
function validatePLCVendor(vendor) {
    if (!vendor)
        return undefined;
    const normalizedVendor = vendor.toLowerCase();
    if (!['siemens', 'rockwell', 'beckhoff'].includes(normalizedVendor)) {
        throw new Error('Invalid PLC vendor. Must be one of: siemens, rockwell, beckhoff');
    }
    return normalizedVendor;
}
// Create New Project
router.post('/', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { projectName, clientName, projectType, description, targetPLCVendor } = req.body;
        // Validate required fields
        const validatedProjectName = validateProjectName(projectName);
        const validatedVendor = validatePLCVendor(targetPLCVendor);
        // Create project
        const [project] = await (0, knex_1.default)('projects')
            .insert({
            user_id: req.user.userId,
            project_name: validatedProjectName,
            client_name: clientName?.trim() || null,
            project_type: projectType?.trim() || null,
            description: description?.trim() || null,
            target_plc_vendor: validatedVendor,
            autosave_state: null,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .returning('*');
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: `Created project: ${validatedProjectName}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId: project.id, projectName: validatedProjectName }
        });
        res.status(201).json({
            success: true,
            message: 'Project created successfully',
            project: {
                id: project.id,
                projectName: project.project_name,
                clientName: project.client_name,
                projectType: project.project_type,
                description: project.description,
                targetPLCVendor: project.target_plc_vendor,
                createdAt: project.created_at,
                updatedAt: project.updated_at
            }
        });
    }
    catch (error) {
        console.error('Error creating project:', error);
        res.status(400).json({ error: error.message || 'Failed to create project' });
    }
});
// Get All Projects for User
router.get('/', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projects = await (0, knex_1.default)('projects')
            .where({ user_id: req.user.userId })
            .orderBy('created_at', 'desc');
        const formattedProjects = projects.map((project) => ({
            id: project.id,
            projectName: project.project_name,
            clientName: project.client_name,
            projectType: project.project_type,
            description: project.description,
            targetPLCVendor: project.target_plc_vendor,
            createdAt: project.created_at,
            updatedAt: project.updated_at,
            autosaveState: project.autosave_state ? JSON.parse(project.autosave_state) : null
        }));
        res.json({
            success: true,
            projects: formattedProjects,
            totalCount: formattedProjects.length
        });
    }
    catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});
// Get Single Project
router.get('/:projectId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        // No need to verify user ownership since getProjectById already filters by userId
        res.json({
            success: true,
            project: {
                id: project.id,
                projectName: project.project_name,
                clientName: project.client_name,
                projectType: project.project_type,
                description: project.description,
                targetPLCVendor: project.target_plc_vendor,
                createdAt: project.created_at,
                updatedAt: project.updated_at,
                autosaveState: project.autosave_state ? JSON.parse(project.autosave_state) : null
            }
        });
    }
    catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});
// Update Project
router.put('/:projectId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        const { projectName, clientName, projectType, description, targetPLCVendor } = req.body;
        // Verify project exists and user owns it
        const existingProject = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!existingProject) {
            return res.status(404).json({ error: 'Project not found' });
        }
        // Validate and prepare updates
        const updates = {};
        if (projectName !== undefined) {
            updates.project_name = validateProjectName(projectName);
        }
        if (clientName !== undefined) {
            updates.client_name = clientName?.trim() || null;
        }
        if (projectType !== undefined) {
            updates.project_type = projectType?.trim() || null;
        }
        if (description !== undefined) {
            updates.description = description?.trim() || null;
        }
        if (targetPLCVendor !== undefined) {
            updates.target_plc_vendor = validatePLCVendor(targetPLCVendor);
        }
        const [updatedProject] = await (0, knex_1.default)('projects')
            .where({ id: projectId })
            .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
            .returning('*');
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: `Updated project: ${updatedProject.project_name}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId, updates }
        });
        res.json({
            message: 'Project updated successfully',
            project: {
                id: updatedProject.id,
                projectName: updatedProject.project_name,
                clientName: updatedProject.client_name,
                projectType: updatedProject.project_type,
                description: updatedProject.description,
                targetPLCVendor: updatedProject.target_plc_vendor,
                createdAt: updatedProject.created_at,
                updatedAt: updatedProject.updated_at
            }
        });
    }
    catch (error) {
        console.error('Error updating project:', error);
        res.status(400).json({ error: error.message || 'Failed to update project' });
    }
});
// Delete Project
router.delete('/:projectId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        await (0, knex_1.default)('projects')
            .where({ id: projectId })
            .del();
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: `Deleted project: ${project.project_name}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId, projectName: project.project_name }
        });
        res.json({ message: 'Project deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});
// Save Autosave State
router.post('/:projectId/autosave', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        const { state } = req.body;
        if (!state) {
            return res.status(400).json({ error: 'State is required' });
        }
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        // Save or update autosave
        const existingAutosave = await (0, knex_1.default)('project_autosave')
            .where({ project_id: projectId, user_id: req.user.userId })
            .first();
        if (existingAutosave) {
            await (0, knex_1.default)('project_autosave')
                .where({ project_id: projectId, user_id: req.user.userId })
                .update({
                data: JSON.stringify(state),
                updated_at: new Date().toISOString()
            });
        }
        else {
            await (0, knex_1.default)('project_autosave')
                .insert({
                project_id: projectId,
                user_id: req.user.userId,
                data: JSON.stringify(state),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }
        res.json({ message: 'Autosave state saved successfully' });
    }
    catch (error) {
        console.error('Error saving autosave state:', error);
        res.status(500).json({ error: 'Failed to save autosave state' });
    }
});
// Get Autosave State
router.get('/:projectId/autosave', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const autosave = await (0, knex_1.default)('project_autosave')
            .where({ project_id: projectId, user_id: req.user.userId })
            .first();
        if (!autosave) {
            return res.status(404).json({ error: 'No autosave state found' });
        }
        res.json({
            state: JSON.parse(autosave.state),
            updatedAt: autosave.updated_at
        });
    }
    catch (error) {
        console.error('Error fetching autosave state:', error);
        res.status(500).json({ error: 'Failed to fetch autosave state' });
    }
});
exports.default = router;
