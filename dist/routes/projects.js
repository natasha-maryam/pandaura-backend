"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const projects_1 = require("../db/tables/projects");
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
// --- Create New Project (only allowed from home screen)
// POST /api/v1/projects
// Body: { projectName (required), clientName, projectType, description, targetPLCVendor }
router.post('/', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { projectName, clientName, projectType, description, targetPLCVendor } = req.body;
        // Validate required fields
        const validatedProjectName = validateProjectName(projectName);
        const validatedVendor = validatePLCVendor(targetPLCVendor);
        const projectData = {
            user_id: userId,
            project_name: validatedProjectName,
            client_name: clientName,
            project_type: projectType,
            description: description,
            target_plc_vendor: validatedVendor
        };
        const newProject = projects_1.ProjectsTable.createProject(projectData);
        // Audit log
        await (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'CREATE_PROJECT',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId: newProject.id, projectName: newProject.project_name }
        });
        res.status(201).json({
            success: true,
            project: newProject
        });
    }
    catch (error) {
        console.error('Error creating project:', error);
        if (error instanceof Error && error.message.includes('required') || error instanceof Error && error.message.includes('Invalid')) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to create project' });
    }
});
// --- List all projects for logged-in user
// GET /api/v1/projects
router.get('/', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projects = projects_1.ProjectsTable.getProjectsByUserId(userId);
        // Parse autosave_state JSON for each project
        const projectsWithParsedState = projects.map(project => ({
            ...project,
            autosave_state: project.autosave_state ? JSON.parse(project.autosave_state) : null
        }));
        res.json({
            success: true,
            projects: projectsWithParsedState
        });
    }
    catch (error) {
        console.error('Error fetching projects:', error);
        res.status(500).json({ error: 'Failed to fetch projects' });
    }
});
// --- Get single project details (view/edit)
// GET /api/v1/projects/:projectId
router.get('/:projectId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projectId = parseInt(req.params.projectId, 10);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        const project = projects_1.ProjectsTable.getProjectById(projectId, userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found or unauthorized' });
        }
        // Parse autosave_state JSON
        const projectWithParsedState = {
            ...project,
            autosave_state: project.autosave_state ? JSON.parse(project.autosave_state) : null
        };
        res.json({
            success: true,
            project: projectWithParsedState
        });
    }
    catch (error) {
        console.error('Error fetching project:', error);
        res.status(500).json({ error: 'Failed to fetch project' });
    }
});
// --- Update project metadata (name, client, type, description, vendor)
// PATCH /api/v1/projects/:projectId
// Body: any subset of editable fields
router.patch('/:projectId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projectId = parseInt(req.params.projectId, 10);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        // Check ownership before attempting update
        if (!projects_1.ProjectsTable.checkProjectOwnership(projectId, userId)) {
            return res.status(403).json({ error: 'Unauthorized: You do not own this project' });
        }
        const { projectName, clientName, projectType, description, targetPLCVendor } = req.body;
        const updates = {};
        if (projectName !== undefined) {
            updates.project_name = validateProjectName(projectName);
        }
        if (clientName !== undefined) {
            updates.client_name = clientName;
        }
        if (projectType !== undefined) {
            updates.project_type = projectType;
        }
        if (description !== undefined) {
            updates.description = description;
        }
        if (targetPLCVendor !== undefined) {
            updates.target_plc_vendor = validatePLCVendor(targetPLCVendor);
        }
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields provided to update' });
        }
        const updatedProject = projects_1.ProjectsTable.updateProject(projectId, userId, updates);
        if (!updatedProject) {
            return res.status(404).json({ error: 'Project not found or unauthorized' });
        }
        // Audit log
        await (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'UPDATE_PROJECT',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId, updates }
        });
        // Parse autosave_state JSON
        const projectWithParsedState = {
            ...updatedProject,
            autosave_state: updatedProject.autosave_state ? JSON.parse(updatedProject.autosave_state) : null
        };
        res.json({
            success: true,
            project: projectWithParsedState
        });
    }
    catch (error) {
        console.error('Error updating project:', error);
        if (error instanceof Error && (error.message.includes('required') || error.message.includes('Invalid'))) {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to update project' });
    }
});
// --- Auto-save project progress (JSON state)
// PUT /api/v1/projects/:projectId/autosave
// Body: { autosaveState: {...} }
// No user prompt here, autosave silently stores user progress data.
router.put('/:projectId/autosave', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projectId = parseInt(req.params.projectId, 10);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        // Check ownership
        if (!projects_1.ProjectsTable.checkProjectOwnership(projectId, userId)) {
            return res.status(403).json({ error: 'Unauthorized: You do not own this project' });
        }
        const { autosaveState } = req.body;
        if (!autosaveState) {
            return res.status(400).json({ error: 'autosaveState is required' });
        }
        const success = projects_1.ProjectsTable.updateAutosaveState(projectId, userId, autosaveState);
        if (!success) {
            return res.status(404).json({ error: 'Project not found or unauthorized' });
        }
        res.json({
            success: true,
            message: 'Project progress autosaved successfully'
        });
    }
    catch (error) {
        console.error('Error autosaving project:', error);
        res.status(500).json({ error: 'Failed to autosave project progress' });
    }
});
// --- Save project state explicitly (with user confirmation)
// PUT /api/v1/projects/:projectId/save
// Body: { state: {...} }
// This endpoint is for explicit saves when user confirms they want to save
router.put('/:projectId/save', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projectId = parseInt(req.params.projectId, 10);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        // Check ownership
        if (!projects_1.ProjectsTable.checkProjectOwnership(projectId, userId)) {
            return res.status(403).json({ error: 'Unauthorized: You do not own this project' });
        }
        const { state } = req.body;
        if (!state) {
            return res.status(400).json({ error: 'state is required' });
        }
        // For explicit saves, we update the autosave_state with a "saved" flag
        const saveState = {
            ...state,
            explicitly_saved: true,
            last_saved_at: new Date().toISOString()
        };
        const success = projects_1.ProjectsTable.updateAutosaveState(projectId, userId, saveState);
        if (!success) {
            return res.status(404).json({ error: 'Project not found or unauthorized' });
        }
        // Audit log
        await (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'SAVE_PROJECT',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId }
        });
        res.json({
            success: true,
            message: 'Project saved successfully'
        });
    }
    catch (error) {
        console.error('Error saving project:', error);
        res.status(500).json({ error: 'Failed to save project' });
    }
});
// --- Delete project (user can delete their own projects)
// DELETE /api/v1/projects/:projectId
router.delete('/:projectId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projectId = parseInt(req.params.projectId, 10);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        // Check ownership before deletion
        if (!projects_1.ProjectsTable.checkProjectOwnership(projectId, userId)) {
            return res.status(403).json({ error: 'Unauthorized: You do not own this project' });
        }
        const success = projects_1.ProjectsTable.deleteProject(projectId, userId);
        if (!success) {
            return res.status(404).json({ error: 'Project not found' });
        }
        // Audit log
        await (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'DELETE_PROJECT',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId }
        });
        res.json({
            success: true,
            message: 'Project deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});
// --- Check project ownership utility endpoint
// GET /api/v1/projects/:projectId/ownership
router.get('/:projectId/ownership', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projectId = parseInt(req.params.projectId, 10);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        const isOwner = projects_1.ProjectsTable.checkProjectOwnership(projectId, userId);
        res.json({
            success: true,
            isOwner: isOwner
        });
    }
    catch (error) {
        console.error('Error checking project ownership:', error);
        res.status(500).json({ error: 'Failed to check project ownership' });
    }
});
exports.default = router;
