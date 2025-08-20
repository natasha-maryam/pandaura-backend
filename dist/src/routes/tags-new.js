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
// Get all tags for a project
router.get('/project/:projectId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = req.params.projectId;
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: parseInt(projectId), user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const tags = await (0, knex_1.default)('tags')
            .where('project_id', projectId)
            .orderBy('created_at', 'desc');
        res.json({
            tags,
            totalCount: tags.length
        });
    }
    catch (error) {
        console.error('Error fetching tags:', error);
        res.status(500).json({ error: 'Failed to fetch tags' });
    }
});
// Create a new tag
router.post('/', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { projectId, name, type, dataType, address, defaultValue, vendor, scope } = req.body;
        if (!projectId || !name) {
            return res.status(400).json({ error: 'Project ID and tag name are required' });
        }
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: parseInt(projectId), user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const [tag] = await (0, knex_1.default)('tags')
            .insert({
            project_id: projectId,
            name: name.trim(),
            type: type?.trim(),
            data_type: dataType?.trim(),
            address: address?.trim(),
            default_value: defaultValue?.trim(),
            vendor: vendor?.trim(),
            scope: scope?.trim(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .returning('*');
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: `Created tag: ${name} in project ${project.project_name}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId, tagId: tag.id, tagName: name }
        });
        res.status(201).json({
            message: 'Tag created successfully',
            tag
        });
    }
    catch (error) {
        console.error('Error creating tag:', error);
        if (error.code === '23505') { // PostgreSQL unique constraint violation
            res.status(409).json({ error: 'Tag name already exists in this project' });
        }
        else {
            res.status(400).json({ error: error.message || 'Failed to create tag' });
        }
    }
});
// Update a tag
router.put('/:tagId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const tagId = parseInt(req.params.tagId);
        if (isNaN(tagId)) {
            return res.status(400).json({ error: 'Invalid tag ID' });
        }
        const { name, type, dataType, address, defaultValue, vendor, scope } = req.body;
        // Prepare updates
        const updates = {};
        if (name !== undefined)
            updates.name = name.trim();
        if (type !== undefined)
            updates.type = type?.trim();
        if (dataType !== undefined)
            updates.data_type = dataType?.trim();
        if (address !== undefined)
            updates.address = address?.trim();
        if (defaultValue !== undefined)
            updates.default_value = defaultValue?.trim();
        if (vendor !== undefined)
            updates.vendor = vendor?.trim();
        if (scope !== undefined)
            updates.scope = scope?.trim();
        // Update tag with validation
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        updates.updated_at = new Date().toISOString();
        const [updatedTag] = await (0, knex_1.default)('tags')
            .where('id', tagId)
            .update(updates)
            .returning('*');
        if (!updatedTag) {
            return res.status(404).json({ error: 'Tag not found' });
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: `Updated tag: ${updatedTag.name}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { tagId, updates }
        });
        res.json({
            message: 'Tag updated successfully',
            tag: updatedTag
        });
    }
    catch (error) {
        console.error('Error updating tag:', error);
        if (error.code === '23505') { // PostgreSQL unique constraint violation
            res.status(409).json({ error: 'Tag name already exists in this project' });
        }
        else {
            res.status(400).json({ error: error.message || 'Failed to update tag' });
        }
    }
});
// Delete a tag
router.delete('/:tagId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const tagId = parseInt(req.params.tagId);
        if (isNaN(tagId)) {
            return res.status(400).json({ error: 'Invalid tag ID' });
        }
        const deletedRows = await (0, knex_1.default)('tags')
            .where('id', tagId)
            .del();
        if (deletedRows === 0) {
            return res.status(404).json({ error: 'Tag not found' });
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: `Deleted tag with ID: ${tagId}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { tagId }
        });
        res.json({ message: 'Tag deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting tag:', error);
        res.status(500).json({ error: 'Failed to delete tag' });
    }
});
// Delete all tags for a project
router.delete('/project/:projectId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = req.params.projectId;
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: parseInt(projectId), user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const deletedRows = await (0, knex_1.default)('tags')
            .where('project_id', projectId)
            .del();
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: `Deleted all tags for project: ${project.project_name}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId }
        });
        res.json({ message: 'All tags deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting tags:', error);
        res.status(500).json({ error: 'Failed to delete tags' });
    }
});
exports.default = router;
