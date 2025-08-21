import express from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authMiddleware';
import db from '../db/knex';
import { logAuditEvent } from '../middleware/auditLogger';
import { validateTagForVendor } from '../utils/vendorFormatters';

const router = express.Router();

// Get all tags for a project (supports both query param and path param)
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const projectId = req.query.projectId as string;
    
    if (!projectId) {
      return res.status(400).json({ error: 'Project ID is required as query parameter' });
    }
    
    // Verify project exists and user owns it
    const project = await db('projects')
      .where({ id: parseInt(projectId), user_id: req.user!.userId })
      .first();
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const tags = await db('tags')
      .where('project_id', projectId)
      .orderBy('name');

    res.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
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

    const deletedRows = await db('tags')
      .where('id', tagId)
      .del();

    if (deletedRows === 0) {
      return res.status(404).json({ error: 'Tag not found' });
    }

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      action: `Deleted tag with ID: ${tagId}`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { tagId }
    });

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

export default router;
