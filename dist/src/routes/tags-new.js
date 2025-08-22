"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const knex_1 = __importDefault(require("../db/knex"));
const auditLogger_1 = require("../middleware/auditLogger");
const vendorFormatters_1 = require("../utils/vendorFormatters");
const beckhoffTagIO_1 = require("../utils/beckhoffTagIO");
const siemensTagIO_1 = require("../utils/siemensTagIO");
const rockwellTagIO_1 = require("../utils/rockwellTagIO");
const tagSyncSingleton_1 = require("../services/tagSyncSingleton");
const router = express_1.default.Router();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    },
    storage: multer_1.default.memoryStorage()
});
// Get all tags for a project (supports both query param and path param)
router.get('/', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = req.query.projectId;
        console.log(`🔍 Tags API: GET request for projectId: ${projectId}`);
        console.log(`🔍 Tags API: Request query:`, req.query);
        console.log(`🔍 Tags API: User ID: ${req.user.userId}`);
        if (!projectId) {
            console.error(`🔍 Tags API: No projectId provided in query`);
            return res.status(400).json({ error: 'Project ID is required as query parameter' });
        }
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: parseInt(projectId), user_id: req.user.userId })
            .first();
        console.log(`🔍 Tags API: Project lookup result:`, project ? `Found: ${project.project_name}` : 'Not found');
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const tags = await (0, knex_1.default)('tags')
            .where('project_id', projectId)
            .orderBy('name');
        console.log(`🔍 Tags API: Found ${tags.length} tags for project ${projectId}`);
        console.log(`🔍 Tags API: Tags:`, tags.map(t => ({
            id: t.id,
            name: t.name,
            scope: t.scope,
            data_type: t.data_type,
            address: t.address,
            project_id: t.project_id
        })));
        res.json(tags);
    }
    catch (error) {
        console.error('🔍 Tags API: Error fetching tags:', error);
        res.status(500).json({ error: 'Failed to fetch tags' });
    }
});
// Get all tags for a project (path parameter version)
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
        // Notify real-time subscribers about the new tag
        const tagSyncService = (0, tagSyncSingleton_1.getTagSyncService)();
        if (tagSyncService) {
            tagSyncService.notifyProjectTagsUpdated(parseInt(project_id));
        }
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
        // Notify real-time subscribers about the updated tag
        const tagSyncService = (0, tagSyncSingleton_1.getTagSyncService)();
        if (tagSyncService) {
            tagSyncService.notifyProjectTagsUpdated(updatedTag.project_id);
        }
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
        // Get tag info before deletion for audit and notification
        const tagToDelete = await (0, knex_1.default)('tags')
            .where('id', tagId)
            .first();
        if (!tagToDelete) {
            return res.status(404).json({ error: 'Tag not found' });
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
            action: `Deleted tag: ${tagToDelete.name}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { tagId, tagName: tagToDelete.name, projectId: tagToDelete.project_id }
        });
        // Notify real-time subscribers about the deleted tag
        const tagSyncService = (0, tagSyncSingleton_1.getTagSyncService)();
        if (tagSyncService) {
            tagSyncService.notifyProjectTagsUpdated(tagToDelete.project_id);
        }
        res.json({ success: true, message: 'Tag deleted successfully' });
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
        res.json({ success: true, message: 'All tags deleted successfully' });
    }
    catch (error) {
        console.error('Error deleting tags:', error);
        res.status(500).json({ error: 'Failed to delete tags' });
    }
});
// === Import Endpoints ===
// Import Beckhoff CSV
router.post('/projects/:projectId/import/beckhoff/csv', authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const result = await (0, beckhoffTagIO_1.importBeckhoffCsv)(file.buffer, projectId, req.user.userId);
        if (!result.success) {
            return res.status(400).json(result);
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: `Imported ${result.inserted} Beckhoff tags from CSV to project: ${project.project_name}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId, imported: result.inserted }
        });
        res.json(result);
    }
    catch (error) {
        console.error('Error importing Beckhoff CSV:', error);
        res.status(500).json({ error: 'Failed to import Beckhoff CSV' });
    }
});
// Import Beckhoff XML
router.post('/projects/:projectId/import/beckhoff/xml', authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const result = await (0, beckhoffTagIO_1.importBeckhoffXml)(file.buffer, projectId, req.user.userId);
        if (!result.success) {
            return res.status(400).json(result);
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: `Imported ${result.inserted} Beckhoff tags from XML to project: ${project.project_name}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId, imported: result.inserted }
        });
        res.json(result);
    }
    catch (error) {
        console.error('Error importing Beckhoff XML:', error);
        res.status(500).json({ error: 'Failed to import Beckhoff XML' });
    }
});
// Import Siemens CSV
router.post('/projects/:projectId/import/siemens/csv', authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const result = await (0, siemensTagIO_1.importSiemensCsv)(file.buffer, projectId, req.user.userId);
        if (!result.success) {
            return res.status(400).json(result);
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: `Imported ${result.inserted} Siemens tags from CSV to project: ${project.project_name}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId, imported: result.inserted }
        });
        res.json(result);
    }
    catch (error) {
        console.error('Error importing Siemens CSV:', error);
        res.status(500).json({ error: 'Failed to import Siemens CSV' });
    }
});
// Import Rockwell CSV
router.post('/projects/:projectId/import/rockwell/csv', authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const result = await (0, rockwellTagIO_1.importRockwellCsv)(file.buffer, projectId, req.user.userId);
        if (!result.success) {
            return res.status(400).json(result);
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: `Imported ${result.inserted} Rockwell tags from CSV to project: ${project.project_name}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId, imported: result.inserted }
        });
        res.json(result);
    }
    catch (error) {
        console.error('Error importing Rockwell CSV:', error);
        res.status(500).json({ error: 'Failed to import Rockwell CSV' });
    }
});
// Import Rockwell L5X
router.post('/projects/:projectId/import/rockwell/l5x', authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const result = await (0, rockwellTagIO_1.importRockwellL5X)(file.buffer, projectId, req.user.userId);
        if (!result.success) {
            return res.status(400).json(result);
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: `Imported ${result.inserted} Rockwell tags from L5X to project: ${project.project_name}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { projectId, imported: result.inserted }
        });
        res.json(result);
    }
    catch (error) {
        console.error('Error importing Rockwell L5X:', error);
        res.status(500).json({ error: 'Failed to import Rockwell L5X' });
    }
});
// === Export Endpoints ===
// Export Beckhoff CSV
router.get('/projects/:projectId/export/beckhoff/csv', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .select('id', 'project_name', 'user_id')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const fileName = `${project.project_name || project.id || 'project'}-beckhoff-tags.csv`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        await (0, beckhoffTagIO_1.exportBeckhoffCsv)(projectId, res, { delimiter: ',' });
    }
    catch (error) {
        console.error('Error exporting Beckhoff CSV:', error);
        res.status(500).json({ error: 'Failed to export Beckhoff CSV' });
    }
});
// Export Beckhoff XML
router.get('/projects/:projectId/export/beckhoff/xml', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .select('id', 'project_name', 'user_id')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const fileName = `${project.project_name || project.id || 'project'}-beckhoff-tags.xml`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        await (0, beckhoffTagIO_1.exportBeckhoffXml)(projectId, res);
    }
    catch (error) {
        console.error('Error exporting Beckhoff XML:', error);
        res.status(500).json({ error: 'Failed to export Beckhoff XML' });
    }
});
// Export Siemens CSV
router.get('/projects/:projectId/export/siemens/csv', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .select('id', 'project_name', 'user_id')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const fileName = `${project.project_name || project.id || 'project'}-siemens-tags.csv`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        await (0, siemensTagIO_1.exportSiemensCsv)(projectId, res, { delimiter: ';' });
    }
    catch (error) {
        console.error('Error exporting Siemens CSV:', error);
        res.status(500).json({ error: 'Failed to export Siemens CSV' });
    }
});
// Export Siemens XML
router.get('/projects/:projectId/export/siemens/xml', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .select('id', 'project_name', 'user_id')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const fileName = `${project.project_name || project.id || 'project'}-siemens-tags.xml`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        await (0, siemensTagIO_1.exportSiemensXml)(projectId, res);
    }
    catch (error) {
        console.error('Error exporting Siemens XML:', error);
        res.status(500).json({ error: 'Failed to export Siemens XML' });
    }
});
// Export Rockwell CSV
router.get('/projects/:projectId/export/rockwell/csv', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .select('id', 'project_name', 'user_id')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const fileName = `${project.project_name || project.id || 'project'}-rockwell-tags.csv`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        await (0, rockwellTagIO_1.exportRockwellCsv)(projectId, res, { delimiter: ',' });
    }
    catch (error) {
        console.error('Error exporting Rockwell CSV:', error);
        res.status(500).json({ error: 'Failed to export Rockwell CSV' });
    }
});
// Export Rockwell L5X
router.get('/projects/:projectId/export/rockwell/l5x', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .select('id', 'project_name', 'user_id')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const fileName = `${project.project_name || project.id || 'project'}-rockwell-tags.L5X`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        await (0, rockwellTagIO_1.exportRockwellL5X)(projectId, res);
    }
    catch (error) {
        console.error('Error exporting Rockwell L5X:', error);
        res.status(500).json({ error: 'Failed to export Rockwell L5X' });
    }
});
// Export Beckhoff XLSX
router.get('/projects/:projectId/export/beckhoff/xlsx', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .select('id', 'project_name', 'user_id')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const fileName = `${project.project_name || project.id || 'project'}-beckhoff-tags.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await (0, beckhoffTagIO_1.exportBeckhoffXlsx)(projectId, res);
    }
    catch (error) {
        console.error('Error exporting Beckhoff XLSX:', error);
        res.status(500).json({ error: 'Failed to export Beckhoff XLSX' });
    }
});
// Export Siemens XLSX
router.get('/projects/:projectId/export/siemens/xlsx', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .select('id', 'project_name', 'user_id')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const fileName = `${project.project_name || project.id || 'project'}-siemens-tags.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await (0, siemensTagIO_1.exportSiemensXlsx)(projectId, res);
    }
    catch (error) {
        console.error('Error exporting Siemens XLSX:', error);
        res.status(500).json({ error: 'Failed to export Siemens XLSX' });
    }
});
// Export Rockwell XLSX
router.get('/projects/:projectId/export/rockwell/xlsx', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const projectId = parseInt(req.params.projectId);
        // Verify project exists and user owns it
        const project = await (0, knex_1.default)('projects')
            .select('id', 'project_name', 'user_id')
            .where({ id: projectId, user_id: req.user.userId })
            .first();
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const fileName = `${project.project_name || project.id || 'project'}-rockwell-tags.xlsx`;
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        await (0, rockwellTagIO_1.exportRockwellXlsx)(projectId, res);
    }
    catch (error) {
        console.error('Error exporting Rockwell XLSX:', error);
        res.status(500).json({ error: 'Failed to export Rockwell XLSX' });
    }
});
exports.default = router;
