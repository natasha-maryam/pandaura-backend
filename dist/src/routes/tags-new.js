"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const knex_1 = __importDefault(require("../db/knex"));
const auditLogger_1 = require("../middleware/auditLogger");
const vendorFormatters_1 = require("../utils/vendorFormatters");
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
        const { project_id, name, description, type, data_type, address, default_value, vendor, scope, tag_type, is_ai_generated } = req.body;
        if (!project_id || !name) {
            return res.status(400).json({ error: 'Project ID and tag name are required' });
        }
        if (!vendor) {
            return res.status(400).json({ error: 'Vendor is required' });
        }
        if (!address) {
            return res.status(400).json({ error: 'Address is required' });
        }
        if (!scope) {
            return res.status(400).json({ error: 'Scope is required' });
        }
        if (!tag_type) {
            return res.status(400).json({ error: 'Tag type is required' });
        }
        // Validate tag data against vendor specifications
        const tagData = {
            name: name.trim(),
            type: type || 'BOOL', // Default to BOOL if not provided
            data_type,
            address: address.trim(),
            vendor: vendor.toLowerCase(),
            scope: scope.toLowerCase(),
            tag_type: tag_type.toLowerCase()
        };
        const validation = (0, vendorFormatters_1.validateTagForVendor)(tagData, vendor.toLowerCase());
        if (!validation.isValid) {
            return res.status(400).json({
                error: 'Tag validation failed',
                details: validation.errors
            });
        }
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: parseInt(project_id), user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const [tag] = await (0, knex_1.default)('tags')
            .insert({
            project_id: project_id,
            user_id: req.user.userId,
            name: name.trim(),
            description: description?.trim(),
            type: type?.trim(),
            data_type: data_type?.trim(),
            address: address?.trim(),
            default_value: default_value?.trim(),
            vendor: vendor?.trim(),
            scope: scope?.trim(),
            tag_type: tag_type?.trim(),
            is_ai_generated: is_ai_generated || false,
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
            metadata: { projectId: project_id, tagId: tag.id, tagName: name }
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
        const { name, description, type, data_type, address, default_value, vendor, scope, tag_type, is_ai_generated } = req.body;
        // Prepare updates
        const updates = {};
        if (name !== undefined)
            updates.name = name.trim();
        if (description !== undefined)
            updates.description = description?.trim();
        if (type !== undefined)
            updates.type = type?.trim();
        if (data_type !== undefined)
            updates.data_type = data_type?.trim();
        if (address !== undefined)
            updates.address = address?.trim();
        if (default_value !== undefined)
            updates.default_value = default_value?.trim();
        if (vendor !== undefined)
            updates.vendor = vendor?.trim();
        if (scope !== undefined)
            updates.scope = scope?.trim();
        if (tag_type !== undefined)
            updates.tag_type = tag_type?.trim();
        if (is_ai_generated !== undefined)
            updates.is_ai_generated = is_ai_generated;
        // Update tag with validation
        if (Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No valid fields to update' });
        }
        // Get current tag to validate against vendor requirements
        const currentTag = await (0, knex_1.default)('tags').where('id', tagId).first();
        if (!currentTag) {
            return res.status(404).json({ error: 'Tag not found' });
        }
        // Create merged tag data for validation (current + updates)
        const tagForValidation = {
            name: updates.name || currentTag.name,
            type: updates.type || currentTag.type,
            data_type: updates.data_type || currentTag.data_type,
            address: updates.address || currentTag.address,
            vendor: updates.vendor || currentTag.vendor,
            scope: updates.scope || currentTag.scope,
            tag_type: updates.tag_type || currentTag.tag_type
        };
        // Validate the merged tag data
        if (tagForValidation.vendor) {
            const validation = (0, vendorFormatters_1.validateTagForVendor)(tagForValidation, tagForValidation.vendor.toLowerCase());
            if (!validation.isValid) {
                return res.status(400).json({
                    error: 'Tag validation failed',
                    details: validation.errors
                });
            }
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
