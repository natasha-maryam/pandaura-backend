"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const multer_1 = __importDefault(require("multer"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const tags_1 = require("../db/tables/tags");
const projects_1 = require("../db/tables/projects");
const auditLogger_1 = require("../middleware/auditLogger");
const beckhoffTagIO_1 = require("../utils/beckhoffTagIO");
const rockwellTagIO_1 = require("../utils/rockwellTagIO");
const vendorFormatters_1 = require("../utils/vendorFormatters");
const router = express_1.default.Router();
// Configure multer for file uploads
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});
// Validation helpers
function validateTagName(name) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        throw new Error('Tag name is required and cannot be empty');
    }
    if (name.length > 100) {
        throw new Error('Tag name cannot exceed 100 characters');
    }
    return name.trim();
}
function validateTagType(type) {
    const validTypes = ['BOOL', 'INT', 'DINT', 'REAL', 'STRING', 'TIMER', 'COUNTER'];
    if (!type || !validTypes.includes(type)) {
        throw new Error(`Invalid tag type. Must be one of: ${validTypes.join(', ')}`);
    }
    return type;
}
function validateVendor(vendor) {
    const validVendors = ['rockwell', 'siemens', 'beckhoff'];
    if (!vendor || !validVendors.includes(vendor.toLowerCase())) {
        throw new Error(`Invalid vendor. Must be one of: ${validVendors.join(', ')}`);
    }
    return vendor.toLowerCase();
}
function validateScope(scope) {
    const validScopes = ['global', 'local', 'input', 'output'];
    if (!scope || !validScopes.includes(scope.toLowerCase())) {
        throw new Error(`Invalid scope. Must be one of: ${validScopes.join(', ')}`);
    }
    return scope.toLowerCase();
}
function validateTagTypeCategory(tagType) {
    const validTagTypes = ['input', 'output', 'memory', 'temp', 'constant'];
    if (!tagType || !validTagTypes.includes(tagType.toLowerCase())) {
        throw new Error(`Invalid tag type. Must be one of: ${validTagTypes.join(', ')}`);
    }
    return tagType.toLowerCase();
}
function validateAddress(address) {
    if (!address || typeof address !== 'string' || address.trim().length === 0) {
        throw new Error('Address is required and cannot be empty');
    }
    return address.trim();
}
// --- GET /api/v1/tags - Get filtered list of tags
router.get('/', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { projectId, vendor, type, dataType, scope, tagType, isAIGenerated, search, page = '1', pageSize = '50' } = req.query;
        // Parse and validate query parameters
        const filters = {
            user_id: userId,
            page: parseInt(page) || 1,
            page_size: Math.min(parseInt(pageSize) || 50, 100) // Max 100 per page
        };
        if (projectId) {
            const projectIdNum = parseInt(projectId);
            if (isNaN(projectIdNum)) {
                return res.status(400).json({ error: 'Invalid project ID' });
            }
            // Verify user has access to this project
            const project = projects_1.ProjectsTable.getProjectById(projectIdNum, userId);
            if (!project) {
                return res.status(403).json({ error: 'Access denied to this project' });
            }
            filters.project_id = projectIdNum;
        }
        if (vendor)
            filters.vendor = vendor;
        if (type)
            filters.type = type;
        if (dataType)
            filters.data_type = dataType;
        if (scope)
            filters.scope = scope;
        if (tagType)
            filters.tag_type = tagType;
        if (isAIGenerated !== undefined) {
            filters.is_ai_generated = isAIGenerated === 'true';
        }
        if (search)
            filters.search = search;
        const result = tags_1.TagsTable.getTags(filters);
        // Log audit event
        (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'tags.list',
            metadata: {
                filters,
                count: result.tags.length,
                total: result.total
            }
        });
        res.json({
            success: true,
            data: {
                tags: result.tags,
                pagination: {
                    page: filters.page,
                    pageSize: filters.page_size,
                    total: result.total,
                    totalPages: Math.ceil(result.total / filters.page_size)
                }
            }
        });
    }
    catch (error) {
        console.error('Error fetching tags:', error);
        const userId = req.user?.userId;
        if (userId) {
            (0, auditLogger_1.logAuditEvent)({
                userId,
                action: 'tags.list.error',
                metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// --- POST /api/v1/tags - Create new tag
router.post('/', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { project_id, name, description, type, data_type, address, default_value, vendor, scope, tag_type, is_ai_generated } = req.body;
        console.log("sdsa", { project_id });
        if (!project_id) {
            return res.status(400).json({ error: 'Project ID is required' });
        }
        // Verify project access
        const project = projects_1.ProjectsTable.getProjectById(parseInt(project_id), userId);
        if (!project) {
            return res.status(403).json({ error: 'Access denied to this project' });
        }
        // Validate required fields
        const validatedName = validateTagName(name);
        const validatedType = validateTagType(type);
        const validatedVendor = validateVendor(vendor);
        const validatedScope = validateScope(scope);
        const validatedTagType = validateTagTypeCategory(tag_type);
        const validatedAddress = validateAddress(address);
        const tagData = {
            project_id: parseInt(project_id),
            user_id: userId,
            name: validatedName,
            description: description || '',
            type: validatedType,
            data_type: data_type || validatedType,
            address: validatedAddress,
            default_value: default_value || '',
            vendor: validatedVendor,
            scope: validatedScope,
            tag_type: validatedTagType,
            is_ai_generated: Boolean(is_ai_generated)
        };
        const newTag = tags_1.TagsTable.createTag(tagData);
        (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'tags.create',
            metadata: {
                tag_id: newTag.id,
                project_id: tagData.project_id,
                tag_name: newTag.name
            }
        });
        res.status(201).json({
            success: true,
            data: newTag
        });
    }
    catch (error) {
        console.error('Error creating tag:', error);
        const userId = req.user?.userId;
        if (userId) {
            (0, auditLogger_1.logAuditEvent)({
                userId,
                action: 'tags.create.error',
                metadata: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    request_body: req.body
                }
            });
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('UNIQUE constraint failed')) {
            res.status(400).json({ error: 'A tag with this name already exists in the project' });
        }
        else if (errorMessage.includes('Invalid') || errorMessage.includes('required')) {
            res.status(400).json({ error: errorMessage });
        }
        else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});
// --- GET /api/v1/tags/:id - Get tag by ID
router.get('/:id', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const tagId = req.params.id;
        const tag = tags_1.TagsTable.getTagById(tagId, userId);
        if (!tag) {
            return res.status(404).json({ error: 'Tag not found or access denied' });
        }
        (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'tags.get',
            metadata: {
                tag_id: tagId,
                project_id: tag.project_id
            }
        });
        res.json({
            success: true,
            data: tag
        });
    }
    catch (error) {
        console.error('Error fetching tag:', error);
        const userId = req.user?.userId;
        if (userId) {
            (0, auditLogger_1.logAuditEvent)({
                userId,
                action: 'tags.get.error',
                metadata: {
                    tag_id: req.params.id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// --- PUT /api/v1/tags/:id - Update tag by ID
router.put('/:id', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const tagId = req.params.id;
        const updateData = {};
        // Validate and set update fields
        const { name, description, type, data_type, address, default_value, vendor, scope, tag_type, is_ai_generated } = req.body;
        if (name !== undefined)
            updateData.name = validateTagName(name);
        if (description !== undefined)
            updateData.description = description;
        if (type !== undefined)
            updateData.type = validateTagType(type);
        if (data_type !== undefined)
            updateData.data_type = data_type;
        if (address !== undefined)
            updateData.address = validateAddress(address);
        if (default_value !== undefined)
            updateData.default_value = default_value;
        if (vendor !== undefined)
            updateData.vendor = validateVendor(vendor);
        if (scope !== undefined)
            updateData.scope = validateScope(scope);
        if (tag_type !== undefined)
            updateData.tag_type = validateTagTypeCategory(tag_type);
        if (is_ai_generated !== undefined)
            updateData.is_ai_generated = Boolean(is_ai_generated);
        const updatedTag = tags_1.TagsTable.updateTag(tagId, updateData, userId);
        if (!updatedTag) {
            return res.status(404).json({ error: 'Tag not found or access denied' });
        }
        (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'tags.update',
            metadata: {
                tag_id: tagId,
                project_id: updatedTag.project_id,
                changes: updateData
            }
        });
        res.json({
            success: true,
            data: updatedTag
        });
    }
    catch (error) {
        console.error('Error updating tag:', error);
        const userId = req.user?.userId;
        if (userId) {
            (0, auditLogger_1.logAuditEvent)({
                userId,
                action: 'tags.update.error',
                metadata: {
                    tag_id: req.params.id,
                    error: error instanceof Error ? error.message : 'Unknown error',
                    request_body: req.body
                }
            });
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('UNIQUE constraint failed')) {
            res.status(400).json({ error: 'A tag with this name already exists in the project' });
        }
        else if (errorMessage.includes('Invalid') || errorMessage.includes('required')) {
            res.status(400).json({ error: errorMessage });
        }
        else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});
// --- DELETE /api/v1/tags/:id - Delete tag by ID
router.delete('/:id', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const tagId = req.params.id;
        // Get tag info before deletion for audit logging
        const tag = tags_1.TagsTable.getTagById(tagId, userId);
        const deleted = tags_1.TagsTable.deleteTag(tagId, userId);
        if (!deleted) {
            return res.status(404).json({ error: 'Tag not found or access denied' });
        }
        (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'tags.delete',
            metadata: {
                tag_id: tagId,
                project_id: tag?.project_id,
                tag_name: tag?.name
            }
        });
        res.json({
            success: true,
            message: 'Tag deleted successfully'
        });
    }
    catch (error) {
        console.error('Error deleting tag:', error);
        const userId = req.user?.userId;
        if (userId) {
            (0, auditLogger_1.logAuditEvent)({
                userId,
                action: 'tags.delete.error',
                metadata: {
                    tag_id: req.params.id,
                    error: error instanceof Error ? error.message : 'Unknown error'
                }
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// --- POST /api/v1/tags/autogenerate - Auto-generate tags from Logic Studio input
router.post('/autogenerate', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { project_id, logic_data, vendor, tag_prefix = '', overwrite_existing = false } = req.body;
        if (!project_id || !logic_data || !vendor) {
            return res.status(400).json({
                error: 'Project ID, logic data, and vendor selection are required'
            });
        }
        // Verify project access
        const project = projects_1.ProjectsTable.getProjectById(parseInt(project_id), userId);
        if (!project) {
            return res.status(403).json({ error: 'Access denied to this project' });
        }
        const validatedVendor = validateVendor(vendor);
        // Mock auto-generation logic - in a real implementation, this would parse the logic_data
        // and generate appropriate tags based on the vendor and logic requirements
        const generatedTags = [];
        const sampleTags = [
            {
                name: `${tag_prefix}Start_Button`,
                description: 'Auto-generated start button input',
                type: 'BOOL',
                address: validatedVendor === 'rockwell' ? 'I:1/0' : validatedVendor === 'siemens' ? 'I0.0' : '%IX0.0',
                tag_type: 'input',
                scope: 'global'
            },
            {
                name: `${tag_prefix}Stop_Button`,
                description: 'Auto-generated stop button input',
                type: 'BOOL',
                address: validatedVendor === 'rockwell' ? 'I:1/1' : validatedVendor === 'siemens' ? 'I0.1' : '%IX0.1',
                tag_type: 'input',
                scope: 'global'
            },
            {
                name: `${tag_prefix}Motor_Output`,
                description: 'Auto-generated motor output',
                type: 'BOOL',
                address: validatedVendor === 'rockwell' ? 'O:2/0' : validatedVendor === 'siemens' ? 'Q0.0' : '%QX0.0',
                tag_type: 'output',
                scope: 'global'
            }
        ];
        for (const tagTemplate of sampleTags) {
            try {
                const tagData = {
                    project_id: parseInt(project_id),
                    user_id: userId,
                    name: tagTemplate.name,
                    description: tagTemplate.description,
                    type: tagTemplate.type,
                    data_type: tagTemplate.type,
                    address: tagTemplate.address,
                    default_value: tagTemplate.type === 'BOOL' ? 'FALSE' : '0',
                    vendor: validatedVendor,
                    scope: tagTemplate.scope,
                    tag_type: tagTemplate.tag_type,
                    is_ai_generated: true
                };
                const newTag = tags_1.TagsTable.createTag(tagData);
                generatedTags.push(newTag);
            }
            catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'Unknown error';
                if (!overwrite_existing && errorMessage.includes('UNIQUE constraint')) {
                    console.log(`Skipping duplicate tag: ${tagTemplate.name}`);
                    continue;
                }
                throw error;
            }
        }
        (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'tags.autogenerate',
            metadata: {
                project_id: parseInt(project_id),
                vendor: validatedVendor,
                generated_count: generatedTags.length,
                logic_data_size: logic_data.length
            }
        });
        res.json({
            success: true,
            data: {
                generated_tags: generatedTags,
                count: generatedTags.length
            },
            message: `Successfully generated ${generatedTags.length} tags`
        });
    }
    catch (error) {
        console.error('Error auto-generating tags:', error);
        const userId = req.user?.userId;
        if (userId) {
            (0, auditLogger_1.logAuditEvent)({
                userId,
                action: 'tags.autogenerate.error',
                metadata: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    request_body: req.body
                }
            });
        }
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errorMessage.includes('Invalid') || errorMessage.includes('required')) {
            res.status(400).json({ error: errorMessage });
        }
        else {
            res.status(500).json({ error: 'Internal server error' });
        }
    }
});
// --- POST /api/v1/tags/export - Export tags for a project
router.post('/export', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const { project_id, vendor, format = 'excel' } = req.body;
        if (!project_id) {
            return res.status(400).json({ error: 'Project ID is required' });
        }
        const projectIdNum = parseInt(project_id);
        // Verify project access
        const project = projects_1.ProjectsTable.getProjectById(projectIdNum, userId);
        if (!project) {
            return res.status(403).json({ error: 'Access denied to this project' });
        }
        // Get tags for the project
        const result = tags_1.TagsTable.getTags({
            project_id: projectIdNum,
            user_id: userId,
            vendor: vendor || undefined
        });
        // Mock export functionality - in a real implementation, this would generate actual files
        const exportData = {
            project_name: project.project_name,
            export_date: new Date().toISOString(),
            format,
            vendor: vendor || 'all',
            tags: result.tags,
            total_count: result.total
        };
        (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'tags.export',
            metadata: {
                project_id: projectIdNum,
                format,
                vendor: vendor || 'all',
                tag_count: result.total
            }
        });
        res.json({
            success: true,
            data: exportData,
            message: `Export prepared for ${result.total} tags`
        });
    }
    catch (error) {
        console.error('Error exporting tags:', error);
        const userId = req.user?.userId;
        if (userId) {
            (0, auditLogger_1.logAuditEvent)({
                userId,
                action: 'tags.export.error',
                metadata: {
                    error: error instanceof Error ? error.message : 'Unknown error',
                    request_body: req.body
                }
            });
        }
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ===== BECKHOFF IMPORT/EXPORT ROUTES =====
// Import Beckhoff CSV
router.post('/projects/:projectId/import/beckhoff/csv', authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const { projectId } = req.params;
        const authReq = req;
        const userId = authReq.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Verify project exists and user has access
        const project = projects_1.ProjectsTable.getProjectById(parseInt(projectId), userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const result = await (0, beckhoffTagIO_1.importBeckhoffCsv)(req.file.buffer, parseInt(projectId), userId);
        if (!result.success) {
            return res.status(400).json(result);
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: userId,
            action: 'IMPORT_BECKHOFF_CSV',
            metadata: {
                resource_type: 'tags',
                resource_id: projectId,
                imported_count: result.inserted,
                filename: req.file.originalname
            }
        });
        res.json(result);
    }
    catch (err) {
        console.error('Beckhoff CSV import error:', err);
        res.status(500).json({
            error: err instanceof Error ? err.message : 'Internal server error'
        });
    }
});
// Export Beckhoff CSV
router.get('/projects/:projectId/export/beckhoff/csv', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const authReq = req;
        const userId = authReq.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        // Verify project exists and user has access
        const project = projects_1.ProjectsTable.getProjectById(parseInt(projectId), userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.setHeader('Content-Disposition', `attachment; filename="${project.project_name}-beckhoff-tags.csv"`);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        await (0, beckhoffTagIO_1.exportBeckhoffCsv)(parseInt(projectId), res, { delimiter: ',' });
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: userId,
            action: 'EXPORT_BECKHOFF_CSV',
            metadata: {
                resource_type: 'tags',
                resource_id: projectId,
                filename: `${project.project_name}-beckhoff-tags.csv`
            }
        });
    }
    catch (err) {
        console.error('Beckhoff CSV export error:', err);
        if (!res.headersSent) {
            res.status(500).json({
                error: err instanceof Error ? err.message : 'Internal server error'
            });
        }
    }
});
// Import Beckhoff XML
router.post('/projects/:projectId/import/beckhoff/xml', authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const { projectId } = req.params;
        const authReq = req;
        const userId = authReq.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        // Verify project exists and user has access
        const project = projects_1.ProjectsTable.getProjectById(parseInt(projectId), userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        const result = await (0, beckhoffTagIO_1.importBeckhoffXml)(req.file.buffer, parseInt(projectId), userId);
        if (!result.success) {
            return res.status(400).json(result);
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: userId,
            action: 'IMPORT_BECKHOFF_XML',
            metadata: {
                resource_type: 'tags',
                resource_id: projectId,
                imported_count: result.inserted,
                filename: req.file.originalname
            }
        });
        res.json(result);
    }
    catch (err) {
        console.error('Beckhoff XML import error:', err);
        res.status(500).json({
            error: err instanceof Error ? err.message : 'Internal server error'
        });
    }
});
// Export Beckhoff XML
router.get('/projects/:projectId/export/beckhoff/xml', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const { projectId } = req.params;
        const authReq = req;
        const userId = authReq.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        // Verify project exists and user has access
        const project = projects_1.ProjectsTable.getProjectById(parseInt(projectId), userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        res.setHeader('Content-Disposition', `attachment; filename="${project.project_name}-beckhoff-tags.xml"`);
        res.setHeader('Content-Type', 'application/xml; charset=utf-8');
        await (0, beckhoffTagIO_1.exportBeckhoffXml)(parseInt(projectId), res);
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: userId,
            action: 'EXPORT_BECKHOFF_XML',
            metadata: {
                resource_type: 'tags',
                resource_id: projectId,
                filename: `${project.project_name}-beckhoff-tags.xml`
            }
        });
    }
    catch (err) {
        console.error('Beckhoff XML export error:', err);
        if (!res.headersSent) {
            res.status(500).json({
                error: err instanceof Error ? err.message : 'Internal server error'
            });
        }
    }
});
// === ROCKWELL IMPORT/EXPORT ROUTES ===
// Export Rockwell CSV tags
router.get('/projects/:projectId/export/rockwell/csv', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projectId = parseInt(req.params.projectId);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        // Verify project exists and user has access
        const project = projects_1.ProjectsTable.getProjectById(projectId, userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        // Set response headers for file download
        const filename = `${project.project_name.replace(/[^a-zA-Z0-9]/g, '_')}_rockwell_tags.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        // Export directly to response stream
        await (0, rockwellTagIO_1.exportRockwellCsv)(projectId, res);
        await (0, auditLogger_1.logAuditEvent)({
            userId: userId,
            action: 'EXPORT_ROCKWELL_CSV',
            metadata: {
                resource_type: 'tags',
                resource_id: projectId,
                filename: filename
            }
        });
    }
    catch (error) {
        console.error('Error exporting Rockwell CSV:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to export Rockwell CSV'
        });
    }
});
// Export Rockwell L5X XML tags
router.get('/projects/:projectId/export/rockwell/l5x', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projectId = parseInt(req.params.projectId);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        // Verify project exists and user has access
        const project = projects_1.ProjectsTable.getProjectById(projectId, userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        // Set response headers for file download
        const filename = `${project.project_name.replace(/[^a-zA-Z0-9]/g, '_')}_rockwell_tags.l5x`;
        res.setHeader('Content-Type', 'application/xml');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        // Export directly to response stream
        await (0, rockwellTagIO_1.exportRockwellL5X)(projectId, res);
        await (0, auditLogger_1.logAuditEvent)({
            userId: userId,
            action: 'EXPORT_ROCKWELL_L5X',
            metadata: {
                resource_type: 'tags',
                resource_id: projectId,
                filename: filename
            }
        });
    }
    catch (error) {
        console.error('Error exporting Rockwell L5X:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to export Rockwell L5X'
        });
    }
});
// Import Rockwell CSV tags
router.post('/projects/:projectId/import/rockwell/csv', authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projectId = parseInt(req.params.projectId);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        // Verify project exists and user has access
        const project = projects_1.ProjectsTable.getProjectById(projectId, userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        if (!req.file.mimetype.includes('csv') && !req.file.originalname?.toLowerCase().endsWith('.csv')) {
            return res.status(400).json({ error: 'File must be a CSV file' });
        }
        const result = await (0, rockwellTagIO_1.importRockwellCsv)(req.file.buffer, projectId, userId);
        if (!result.success) {
            return res.status(400).json(result);
        }
        await (0, auditLogger_1.logAuditEvent)({
            userId: userId,
            action: 'IMPORT_ROCKWELL_CSV',
            metadata: {
                resource_type: 'tags',
                resource_id: projectId,
                imported_count: result.inserted,
                filename: req.file.originalname
            }
        });
        res.json(result);
    }
    catch (error) {
        console.error('Error importing Rockwell CSV:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to import Rockwell CSV'
        });
    }
});
// Import Rockwell L5X XML tags
router.post('/projects/:projectId/import/rockwell/l5x', authMiddleware_1.authenticateToken, upload.single('file'), async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projectId = parseInt(req.params.projectId);
        if (isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        // Verify project exists and user has access
        const project = projects_1.ProjectsTable.getProjectById(projectId, userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }
        if (!req.file.mimetype.includes('xml') && !req.file.originalname?.toLowerCase().endsWith('.l5x')) {
            return res.status(400).json({ error: 'File must be an L5X file' });
        }
        const result = await (0, rockwellTagIO_1.importRockwellL5X)(req.file.buffer, projectId, userId);
        if (!result.success) {
            return res.status(400).json(result);
        }
        await (0, auditLogger_1.logAuditEvent)({
            userId: userId,
            action: 'IMPORT_ROCKWELL_L5X',
            metadata: {
                resource_type: 'tags',
                resource_id: projectId,
                imported_count: result.inserted,
                filename: req.file.originalname
            }
        });
        res.json(result);
    }
    catch (error) {
        console.error('Error importing Rockwell L5X:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to import Rockwell L5X'
        });
    }
});
// --- GET /api/v1/tags/stats/:projectId - Get tag statistics
router.get('/stats/:projectId', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projectId = parseInt(req.params.projectId);
        if (!projectId || isNaN(projectId)) {
            return res.status(400).json({ error: 'Invalid project ID' });
        }
        // Verify user has access to the project
        const project = await projects_1.ProjectsTable.getProjectById(projectId, userId);
        if (!project) {
            return res.status(404).json({ error: 'Project not found or access denied' });
        }
        // Get tag statistics
        const stats = await tags_1.TagsTable.getTagStats(projectId, userId);
        await (0, auditLogger_1.logAuditEvent)({
            userId: userId,
            action: 'TAG_STATS_VIEWED',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: {
                project_id: projectId,
                stats_requested: true
            }
        });
        res.json({
            success: true,
            data: stats
        });
    }
    catch (error) {
        console.error('Error getting tag statistics:', error);
        res.status(500).json({ error: 'Failed to get tag statistics' });
    }
});
// --- POST /api/v1/tags/format/:vendor - Format tags for specific vendor
router.post('/format/:vendor', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const vendor = validateVendor(req.params.vendor);
        const { tags, projectId } = req.body;
        if (!Array.isArray(tags) || tags.length === 0) {
            return res.status(400).json({ error: 'Tags array is required and cannot be empty' });
        }
        if (!projectId) {
            return res.status(400).json({ error: 'Project ID is required' });
        }
        // Verify project access
        const project = projects_1.ProjectsTable.getProjectById(parseInt(projectId), userId);
        if (!project) {
            return res.status(403).json({ error: 'Access denied to this project' });
        }
        // Format tags for the specified vendor
        const formattedTags = tags.map((tag) => {
            const vendorTag = {
                name: tag.name || 'Unnamed',
                dataType: tag.dataType || tag.type || 'DINT',
                address: tag.address,
                description: tag.description,
                scope: tag.scope || 'global',
                defaultValue: tag.defaultValue || tag.default_value,
                vendor: vendor
            };
            try {
                return (0, vendorFormatters_1.formatTagForVendor)(vendorTag, vendor);
            }
            catch (error) {
                console.error(`Error formatting tag ${tag.name}:`, error);
                return {
                    ...vendorTag,
                    error: `Failed to format: ${error instanceof Error ? error.message : 'Unknown error'}`
                };
            }
        });
        // Log the formatting action
        await (0, auditLogger_1.logAuditEvent)({
            userId: userId,
            action: 'TAGS_FORMATTED',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: {
                project_id: parseInt(projectId),
                vendor,
                tag_count: tags.length,
                formatted_count: formattedTags.filter(t => !('error' in t)).length
            }
        });
        res.json({
            success: true,
            data: {
                vendor,
                originalCount: tags.length,
                formattedCount: formattedTags.filter(t => !('error' in t)).length,
                tags: formattedTags
            }
        });
    }
    catch (error) {
        console.error('Error formatting tags:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to format tags'
        });
    }
});
// --- POST /api/v1/tags/validate-addresses/:vendor - Validate addresses for specific vendor
router.post('/validate-addresses/:vendor', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const vendor = validateVendor(req.params.vendor);
        const { addresses } = req.body;
        if (!Array.isArray(addresses) || addresses.length === 0) {
            return res.status(400).json({ error: 'Addresses array is required and cannot be empty' });
        }
        // Validate each address
        const validationResults = addresses.map((address) => ({
            address,
            isValid: (0, vendorFormatters_1.validateAddressForVendor)(address, vendor),
            vendor
        }));
        const validCount = validationResults.filter(r => r.isValid).length;
        const invalidCount = validationResults.length - validCount;
        // Log the validation action
        await (0, auditLogger_1.logAuditEvent)({
            userId: userId,
            action: 'ADDRESSES_VALIDATED',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: {
                vendor,
                total_addresses: addresses.length,
                valid_addresses: validCount,
                invalid_addresses: invalidCount
            }
        });
        res.json({
            success: true,
            data: {
                vendor,
                totalAddresses: addresses.length,
                validAddresses: validCount,
                invalidAddresses: invalidCount,
                results: validationResults
            }
        });
    }
    catch (error) {
        console.error('Error validating addresses:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to validate addresses'
        });
    }
});
// --- GET /api/v1/tags/projects/:projectId/export/:vendor/formatted - Export tags in vendor-specific format
router.get('/projects/:projectId/export/:vendor/formatted', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        const projectId = parseInt(req.params.projectId);
        const vendor = validateVendor(req.params.vendor);
        // Verify project access
        const project = projects_1.ProjectsTable.getProjectById(projectId, userId);
        if (!project) {
            return res.status(403).json({ error: 'Access denied to this project' });
        }
        // Get tags from the project filtered by vendor
        const tagsResult = tags_1.TagsTable.getTags({
            project_id: projectId,
            vendor: vendor
        });
        const tags = tagsResult.tags;
        if (tags.length === 0) {
            return res.status(404).json({ error: `No ${vendor} tags found for this project` });
        }
        // Format tags for the specified vendor
        const formattedTags = tags.map(tag => {
            const vendorTag = {
                name: tag.name,
                dataType: tag.data_type,
                address: tag.address,
                description: tag.description,
                scope: tag.scope,
                defaultValue: tag.default_value,
                vendor: vendor
            };
            return (0, vendorFormatters_1.formatTagForVendor)(vendorTag, vendor);
        });
        // Set appropriate headers for download
        const filename = `${project.project_name}_${vendor}_tags_${new Date().toISOString().split('T')[0]}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        // Log the export action
        await (0, auditLogger_1.logAuditEvent)({
            userId: userId,
            action: 'TAGS_EXPORTED_FORMATTED',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: {
                project_id: projectId,
                vendor,
                tag_count: tags.length,
                export_format: 'json'
            }
        });
        res.json({
            project: {
                id: project.id,
                name: project.project_name,
                vendor: vendor
            },
            exportDate: new Date().toISOString(),
            tagCount: formattedTags.length,
            tags: formattedTags
        });
    }
    catch (error) {
        console.error('Error exporting formatted tags:', error);
        res.status(500).json({
            error: error instanceof Error ? error.message : 'Failed to export formatted tags'
        });
    }
});
exports.default = router;
