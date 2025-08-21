import express from 'express';
import multer from 'multer';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authMiddleware';
import db from '../db/knex';
import { logAuditEvent } from '../middleware/auditLogger';
import { validateTagForVendor } from '../utils/vendorFormatters';
import { exportBeckhoffCsv, exportBeckhoffXml, exportBeckhoffXlsx, importBeckhoffCsv, importBeckhoffXml } from '../utils/beckhoffTagIO';
import { exportSiemensCsv, exportSiemensXml, exportSiemensXlsx, importSiemensCsv } from '../utils/siemensTagIO';
import { exportRockwellCsv, exportRockwellL5X, exportRockwellXlsx, importRockwellCsv, importRockwellL5X } from '../utils/rockwellTagIO';
import { getTagSyncService } from '../services/tagSyncSingleton';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  storage: multer.memoryStorage()
});

// Get all tags for a project (supports both query param and path param)
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = req.query.projectId as string;
    
    console.log(`🔍 Tags API: GET request for projectId: ${projectId}`);
    console.log(`🔍 Tags API: Request query:`, req.query);
    console.log(`🔍 Tags API: User ID: ${req.user!.userId}`);
    
    if (!projectId) {
      console.error(`🔍 Tags API: No projectId provided in query`);
      return res.status(400).json({ error: 'Project ID is required as query parameter' });
    }
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .where({ id: parseInt(projectId), user_id: req.user!.userId })
      .first();
    
    console.log(`🔍 Tags API: Project lookup result:`, project ? `Found: ${project.project_name}` : 'Not found');
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const tags = await db('tags')
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
  } catch (error) {
    console.error('🔍 Tags API: Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Get all tags for a project (path parameter version)
router.get('/project/:projectId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = req.params.projectId;
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .where({ id: parseInt(projectId), user_id: req.user!.userId })
      .first();
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const tags = await db('tags')
      .where('project_id', projectId)
      .orderBy('created_at', 'desc');
    
    res.json({
      tags,
      totalCount: tags.length
    });
  } catch (error: any) {
    console.error('Error fetching tags:', error);
    res.status(500).json({ error: 'Failed to fetch tags' });
  }
});

// Create a new tag
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const { 
      project_id, 
      name, 
      description,
      type, 
      data_type, 
      address, 
      default_value, 
      vendor, 
      scope, 
      tag_type, 
      is_ai_generated 
    } = req.body;
    
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

    const validation = validateTagForVendor(tagData, vendor.toLowerCase() as 'rockwell' | 'siemens' | 'beckhoff');
    if (!validation.isValid) {
      return res.status(400).json({ 
        error: 'Tag validation failed', 
        details: validation.errors 
      });
    }

    // Verify project exists and user owns it
    const project = await db('projects')
      .where({ id: parseInt(project_id), user_id: req.user!.userId })
      .first();
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const [tag] = await db('tags')
      .insert({
        project_id: project_id,
        user_id: req.user!.userId,
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
    await logAuditEvent({
      userId: req.user!.userId,
      action: `Created tag: ${name} in project ${project.project_name}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { projectId: project_id, tagId: tag.id, tagName: name }
    });

    // Notify real-time subscribers about the new tag
    const tagSyncService = getTagSyncService();
    if (tagSyncService) {
      tagSyncService.notifyProjectTagsUpdated(parseInt(project_id));
    }

    res.status(201).json({
      message: 'Tag created successfully',
      tag
    });
  } catch (error: any) {
    console.error('Error creating tag:', error);
    if (error.code === '23505') { // PostgreSQL unique constraint violation
      res.status(409).json({ error: 'Tag name already exists in this project' });
    } else {
      res.status(400).json({ error: error.message || 'Failed to create tag' });
    }
  }
});

// Update a tag
router.put('/:tagId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const tagId = parseInt(req.params.tagId);
    
    if (isNaN(tagId)) {
      return res.status(400).json({ error: 'Invalid tag ID' });
    }

    const { 
      name, 
      description,
      type, 
      data_type, 
      address, 
      default_value, 
      vendor, 
      scope, 
      tag_type, 
      is_ai_generated 
    } = req.body;
    
    // Prepare updates
    const updates: any = {};
    if (name !== undefined) updates.name = name.trim();
    if (description !== undefined) updates.description = description?.trim();
    if (type !== undefined) updates.type = type?.trim();
    if (data_type !== undefined) updates.data_type = data_type?.trim();
    if (address !== undefined) updates.address = address?.trim();
    if (default_value !== undefined) updates.default_value = default_value?.trim();
    if (vendor !== undefined) updates.vendor = vendor?.trim();
    if (scope !== undefined) updates.scope = scope?.trim();
    if (tag_type !== undefined) updates.tag_type = tag_type?.trim();
    if (is_ai_generated !== undefined) updates.is_ai_generated = is_ai_generated;

    // Update tag with validation
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }

    // Get current tag to validate against vendor requirements
    const currentTag = await db('tags').where('id', tagId).first();
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
      const validation = validateTagForVendor(
        tagForValidation, 
        tagForValidation.vendor.toLowerCase() as 'rockwell' | 'siemens' | 'beckhoff'
      );
      if (!validation.isValid) {
        return res.status(400).json({ 
          error: 'Tag validation failed', 
          details: validation.errors 
        });
      }
    }

    updates.updated_at = new Date().toISOString();

    const [updatedTag] = await db('tags')
      .where('id', tagId)
      .update(updates)
      .returning('*');
    
    if (!updatedTag) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      action: `Updated tag: ${updatedTag.name}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { tagId, updates }
    });

    // Notify real-time subscribers about the updated tag
    const tagSyncService = getTagSyncService();
    if (tagSyncService) {
      tagSyncService.notifyProjectTagsUpdated(updatedTag.project_id);
    }

    res.json({
      message: 'Tag updated successfully',
      tag: updatedTag
    });
  } catch (error: any) {
    console.error('Error updating tag:', error);
    if (error.code === '23505') { // PostgreSQL unique constraint violation
      res.status(409).json({ error: 'Tag name already exists in this project' });
    } else {
      res.status(400).json({ error: error.message || 'Failed to update tag' });
    }
  }
});

// Delete a tag
router.delete('/:tagId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const tagId = parseInt(req.params.tagId);
    
    if (isNaN(tagId)) {
      return res.status(400).json({ error: 'Invalid tag ID' });
    }

    // Get tag info before deletion for audit and notification
    const tagToDelete = await db('tags')
      .where('id', tagId)
      .first();

    if (!tagToDelete) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    const deletedRows = await db('tags')
      .where('id', tagId)
      .del();

    if (deletedRows === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      action: `Deleted tag: ${tagToDelete.name}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { tagId, tagName: tagToDelete.name, projectId: tagToDelete.project_id }
    });

    // Notify real-time subscribers about the deleted tag
    const tagSyncService = getTagSyncService();
    if (tagSyncService) {
      tagSyncService.notifyProjectTagsUpdated(tagToDelete.project_id);
    }

    res.json({ success: true, message: 'Tag deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting tag:', error);
    res.status(500).json({ error: 'Failed to delete tag' });
  }
});

// Delete all tags for a project
router.delete('/project/:projectId', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = req.params.projectId;
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .where({ id: parseInt(projectId), user_id: req.user!.userId })
      .first();
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const deletedRows = await db('tags')
      .where('project_id', projectId)
      .del();

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      action: `Deleted all tags for project: ${project.project_name}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { projectId }
    });

    res.json({ success: true, message: 'All tags deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting tags:', error);
    res.status(500).json({ error: 'Failed to delete tags' });
  }
});

// === Import Endpoints ===

// Import Beckhoff CSV
router.post('/projects/:projectId/import/beckhoff/csv', authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify project exists and user owns it
    const project = await db('projects')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await importBeckhoffCsv(file.buffer, projectId, req.user!.userId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      action: `Imported ${result.inserted} Beckhoff tags from CSV to project: ${project.project_name}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { projectId, imported: result.inserted }
    });

    res.json(result);
  } catch (error) {
    console.error('Error importing Beckhoff CSV:', error);
    res.status(500).json({ error: 'Failed to import Beckhoff CSV' });
  }
});

// Import Beckhoff XML
router.post('/projects/:projectId/import/beckhoff/xml', authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify project exists and user owns it
    const project = await db('projects')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await importBeckhoffXml(file.buffer, projectId, req.user!.userId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      action: `Imported ${result.inserted} Beckhoff tags from XML to project: ${project.project_name}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { projectId, imported: result.inserted }
    });

    res.json(result);
  } catch (error) {
    console.error('Error importing Beckhoff XML:', error);
    res.status(500).json({ error: 'Failed to import Beckhoff XML' });
  }
});

// Import Siemens CSV
router.post('/projects/:projectId/import/siemens/csv', authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify project exists and user owns it
    const project = await db('projects')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await importSiemensCsv(file.buffer, projectId, req.user!.userId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      action: `Imported ${result.inserted} Siemens tags from CSV to project: ${project.project_name}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { projectId, imported: result.inserted }
    });

    res.json(result);
  } catch (error) {
    console.error('Error importing Siemens CSV:', error);
    res.status(500).json({ error: 'Failed to import Siemens CSV' });
  }
});

// Import Rockwell CSV
router.post('/projects/:projectId/import/rockwell/csv', authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify project exists and user owns it
    const project = await db('projects')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await importRockwellCsv(file.buffer, projectId, req.user!.userId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      action: `Imported ${result.inserted} Rockwell tags from CSV to project: ${project.project_name}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { projectId, imported: result.inserted }
    });

    res.json(result);
  } catch (error) {
    console.error('Error importing Rockwell CSV:', error);
    res.status(500).json({ error: 'Failed to import Rockwell CSV' });
  }
});

// Import Rockwell L5X
router.post('/projects/:projectId/import/rockwell/l5x', authenticateToken, upload.single('file'), async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    const file = req.file;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify project exists and user owns it
    const project = await db('projects')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await importRockwellL5X(file.buffer, projectId, req.user!.userId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      action: `Imported ${result.inserted} Rockwell tags from L5X to project: ${project.project_name}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { projectId, imported: result.inserted }
    });

    res.json(result);
  } catch (error) {
    console.error('Error importing Rockwell L5X:', error);
    res.status(500).json({ error: 'Failed to import Rockwell L5X' });
  }
});

// === Export Endpoints ===

// Export Beckhoff CSV
router.get('/projects/:projectId/export/beckhoff/csv', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .select('id', 'project_name', 'user_id')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const fileName = `${project.project_name || project.id || 'project'}-beckhoff-tags.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    
    await exportBeckhoffCsv(projectId, res, { delimiter: ',' });
  } catch (error) {
    console.error('Error exporting Beckhoff CSV:', error);
    res.status(500).json({ error: 'Failed to export Beckhoff CSV' });
  }
});

// Export Beckhoff XML
router.get('/projects/:projectId/export/beckhoff/xml', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .select('id', 'project_name', 'user_id')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const fileName = `${project.project_name || project.id || 'project'}-beckhoff-tags.xml`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    
    await exportBeckhoffXml(projectId, res);
  } catch (error) {
    console.error('Error exporting Beckhoff XML:', error);
    res.status(500).json({ error: 'Failed to export Beckhoff XML' });
  }
});

// Export Siemens CSV
router.get('/projects/:projectId/export/siemens/csv', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .select('id', 'project_name', 'user_id')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const fileName = `${project.project_name || project.id || 'project'}-siemens-tags.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    
    await exportSiemensCsv(projectId, res, { delimiter: ';' });
  } catch (error) {
    console.error('Error exporting Siemens CSV:', error);
    res.status(500).json({ error: 'Failed to export Siemens CSV' });
  }
});

// Export Siemens XML
router.get('/projects/:projectId/export/siemens/xml', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .select('id', 'project_name', 'user_id')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const fileName = `${project.project_name || project.id || 'project'}-siemens-tags.xml`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    
    await exportSiemensXml(projectId, res);
  } catch (error) {
    console.error('Error exporting Siemens XML:', error);
    res.status(500).json({ error: 'Failed to export Siemens XML' });
  }
});

// Export Rockwell CSV
router.get('/projects/:projectId/export/rockwell/csv', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .select('id', 'project_name', 'user_id')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const fileName = `${project.project_name || project.id || 'project'}-rockwell-tags.csv`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    
    await exportRockwellCsv(projectId, res, { delimiter: ',' });
  } catch (error) {
    console.error('Error exporting Rockwell CSV:', error);
    res.status(500).json({ error: 'Failed to export Rockwell CSV' });
  }
});

// Export Rockwell L5X
router.get('/projects/:projectId/export/rockwell/l5x', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .select('id', 'project_name', 'user_id')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const fileName = `${project.project_name || project.id || 'project'}-rockwell-tags.L5X`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    
    await exportRockwellL5X(projectId, res);
  } catch (error) {
    console.error('Error exporting Rockwell L5X:', error);
    res.status(500).json({ error: 'Failed to export Rockwell L5X' });
  }
});

// Export Beckhoff XLSX
router.get('/projects/:projectId/export/beckhoff/xlsx', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .select('id', 'project_name', 'user_id')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const fileName = `${project.project_name || project.id || 'project'}-beckhoff-tags.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    await exportBeckhoffXlsx(projectId, res);
  } catch (error) {
    console.error('Error exporting Beckhoff XLSX:', error);
    res.status(500).json({ error: 'Failed to export Beckhoff XLSX' });
  }
});

// Export Siemens XLSX
router.get('/projects/:projectId/export/siemens/xlsx', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .select('id', 'project_name', 'user_id')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const fileName = `${project.project_name || project.id || 'project'}-siemens-tags.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    await exportSiemensXlsx(projectId, res);
  } catch (error) {
    console.error('Error exporting Siemens XLSX:', error);
    res.status(500).json({ error: 'Failed to export Siemens XLSX' });
  }
});

// Export Rockwell XLSX
router.get('/projects/:projectId/export/rockwell/xlsx', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = parseInt(req.params.projectId);
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .select('id', 'project_name', 'user_id')
      .where({ id: projectId, user_id: req.user!.userId })
      .first();
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const fileName = `${project.project_name || project.id || 'project'}-rockwell-tags.xlsx`;
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    
    await exportRockwellXlsx(projectId, res);
  } catch (error) {
    console.error('Error exporting Rockwell XLSX:', error);
    res.status(500).json({ error: 'Failed to export Rockwell XLSX' });
  }
});

export default router;
