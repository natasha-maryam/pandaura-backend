import express from 'express';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authMiddleware';
import { TagsTable, CreateTagData, UpdateTagData } from '../db/tables/tags';
import { ProjectsTable } from '../db/tables/projects';
import { logAuditEvent } from '../middleware/auditLogger';

const router = express.Router();

// Validation helpers
function validateTagName(name: any): string {
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Tag name is required and cannot be empty');
  }
  if (name.length > 100) {
    throw new Error('Tag name cannot exceed 100 characters');
  }
  return name.trim();
}

function validateTagType(type: any): 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'STRING' | 'TIMER' | 'COUNTER' {
  const validTypes = ['BOOL', 'INT', 'DINT', 'REAL', 'STRING', 'TIMER', 'COUNTER'];
  if (!type || !validTypes.includes(type)) {
    throw new Error(`Invalid tag type. Must be one of: ${validTypes.join(', ')}`);
  }
  return type;
}

function validateVendor(vendor: any): 'rockwell' | 'siemens' | 'beckhoff' {
  const validVendors = ['rockwell', 'siemens', 'beckhoff'];
  if (!vendor || !validVendors.includes(vendor.toLowerCase())) {
    throw new Error(`Invalid vendor. Must be one of: ${validVendors.join(', ')}`);
  }
  return vendor.toLowerCase();
}

function validateScope(scope: any): 'global' | 'local' | 'input' | 'output' {
  const validScopes = ['global', 'local', 'input', 'output'];
  if (!scope || !validScopes.includes(scope.toLowerCase())) {
    throw new Error(`Invalid scope. Must be one of: ${validScopes.join(', ')}`);
  }
  return scope.toLowerCase();
}

function validateTagTypeCategory(tagType: any): 'input' | 'output' | 'memory' | 'temp' | 'constant' {
  const validTagTypes = ['input', 'output', 'memory', 'temp', 'constant'];
  if (!tagType || !validTagTypes.includes(tagType.toLowerCase())) {
    throw new Error(`Invalid tag type. Must be one of: ${validTagTypes.join(', ')}`);
  }
  return tagType.toLowerCase();
}

function validateAddress(address: any): string {
  if (!address || typeof address !== 'string' || address.trim().length === 0) {
    throw new Error('Address is required and cannot be empty');
  }
  return address.trim();
}

// --- GET /api/v1/tags - Get filtered list of tags
router.get('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const {
      projectId,
      vendor,
      type,
      dataType,
      scope,
      tagType,
      isAIGenerated,
      search,
      page = '1',
      pageSize = '50'
    } = req.query;

    // Parse and validate query parameters
    const filters: any = {
      user_id: userId,
      page: parseInt(page as string) || 1,
      page_size: Math.min(parseInt(pageSize as string) || 50, 100) // Max 100 per page
    };

    if (projectId) {
      const projectIdNum = parseInt(projectId as string);
      if (isNaN(projectIdNum)) {
        return res.status(400).json({ error: 'Invalid project ID' });
      }
      
      // Verify user has access to this project
      const project = ProjectsTable.getProjectById(projectIdNum, userId);
      if (!project) {
        return res.status(403).json({ error: 'Access denied to this project' });
      }
      
      filters.project_id = projectIdNum;
    }

    if (vendor) filters.vendor = vendor;
    if (type) filters.type = type;
    if (dataType) filters.data_type = dataType;
    if (scope) filters.scope = scope;
    if (tagType) filters.tag_type = tagType;
    if (isAIGenerated !== undefined) {
      filters.is_ai_generated = isAIGenerated === 'true';
    }
    if (search) filters.search = search as string;

    const result = TagsTable.getTags(filters);

    // Log audit event
    logAuditEvent({
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
  } catch (error) {
    console.error('Error fetching tags:', error);
    
    const userId = req.user?.userId;
    if (userId) {
      logAuditEvent({
        userId,
        action: 'tags.list.error',
        metadata: { error: error instanceof Error ? error.message : 'Unknown error' }
      });
    }

    res.status(500).json({ error: 'Internal server error' });
  }
});

// --- POST /api/v1/tags - Create new tag
router.post('/', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId;
    
  
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

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
  console.log("sdsa", {project_id})
    if (!project_id) {
      return res.status(400).json({ error: 'Project ID is required' });
    }

    // Verify project access
    const project = ProjectsTable.getProjectById(parseInt(project_id), userId);
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

    const tagData: CreateTagData = {
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

    const newTag = TagsTable.createTag(tagData);

    logAuditEvent({
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
  } catch (error) {
    console.error('Error creating tag:', error);
    
    const userId = req.user?.userId;
    if (userId) {
      logAuditEvent({
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
    } else if (errorMessage.includes('Invalid') || errorMessage.includes('required')) {
      res.status(400).json({ error: errorMessage });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// --- GET /api/v1/tags/:id - Get tag by ID
router.get('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const tagId = req.params.id;
    const tag = TagsTable.getTagById(tagId, userId);

    if (!tag) {
      return res.status(404).json({ error: 'Tag not found or access denied' });
    }

    logAuditEvent({
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
  } catch (error) {
    console.error('Error fetching tag:', error);
    
    const userId = req.user?.userId;
    if (userId) {
      logAuditEvent({
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
router.put('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const tagId = req.params.id;
    const updateData: UpdateTagData = {};

    // Validate and set update fields
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

    if (name !== undefined) updateData.name = validateTagName(name);
    if (description !== undefined) updateData.description = description;
    if (type !== undefined) updateData.type = validateTagType(type);
    if (data_type !== undefined) updateData.data_type = data_type;
    if (address !== undefined) updateData.address = validateAddress(address);
    if (default_value !== undefined) updateData.default_value = default_value;
    if (vendor !== undefined) updateData.vendor = validateVendor(vendor);
    if (scope !== undefined) updateData.scope = validateScope(scope);
    if (tag_type !== undefined) updateData.tag_type = validateTagTypeCategory(tag_type);
    if (is_ai_generated !== undefined) updateData.is_ai_generated = Boolean(is_ai_generated);

    const updatedTag = TagsTable.updateTag(tagId, updateData, userId);

    if (!updatedTag) {
      return res.status(404).json({ error: 'Tag not found or access denied' });
    }

    logAuditEvent({
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
  } catch (error) {
    console.error('Error updating tag:', error);
    
    const userId = req.user?.userId;
    if (userId) {
      logAuditEvent({
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
    } else if (errorMessage.includes('Invalid') || errorMessage.includes('required')) {
      res.status(400).json({ error: errorMessage });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// --- DELETE /api/v1/tags/:id - Delete tag by ID
router.delete('/:id', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const tagId = req.params.id;
    
    // Get tag info before deletion for audit logging
    const tag = TagsTable.getTagById(tagId, userId);
    
    const deleted = TagsTable.deleteTag(tagId, userId);

    if (!deleted) {
      return res.status(404).json({ error: 'Tag not found or access denied' });
    }

    logAuditEvent({
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
  } catch (error) {
    console.error('Error deleting tag:', error);
    
    const userId = req.user?.userId;
    if (userId) {
      logAuditEvent({
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
router.post('/autogenerate', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const {
      project_id,
      logic_data,
      vendor,
      tag_prefix = '',
      overwrite_existing = false
    } = req.body;

    if (!project_id || !logic_data || !vendor) {
      return res.status(400).json({ 
        error: 'Project ID, logic data, and vendor selection are required' 
      });
    }

    // Verify project access
    const project = ProjectsTable.getProjectById(parseInt(project_id), userId);
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
        type: 'BOOL' as const,
        address: validatedVendor === 'rockwell' ? 'I:1/0' : validatedVendor === 'siemens' ? 'I0.0' : '%IX0.0',
        tag_type: 'input' as const,
        scope: 'global' as const
      },
      {
        name: `${tag_prefix}Stop_Button`,
        description: 'Auto-generated stop button input',
        type: 'BOOL' as const,
        address: validatedVendor === 'rockwell' ? 'I:1/1' : validatedVendor === 'siemens' ? 'I0.1' : '%IX0.1',
        tag_type: 'input' as const,
        scope: 'global' as const
      },
      {
        name: `${tag_prefix}Motor_Output`,
        description: 'Auto-generated motor output',
        type: 'BOOL' as const,
        address: validatedVendor === 'rockwell' ? 'O:2/0' : validatedVendor === 'siemens' ? 'Q0.0' : '%QX0.0',
        tag_type: 'output' as const,
        scope: 'global' as const
      }
    ];

    for (const tagTemplate of sampleTags) {
      try {
        const tagData: CreateTagData = {
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

        const newTag = TagsTable.createTag(tagData);
        generatedTags.push(newTag);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (!overwrite_existing && errorMessage.includes('UNIQUE constraint')) {
          console.log(`Skipping duplicate tag: ${tagTemplate.name}`);
          continue;
        }
        throw error;
      }
    }

    logAuditEvent({
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
  } catch (error) {
    console.error('Error auto-generating tags:', error);
    
    const userId = req.user?.userId;
    if (userId) {
      logAuditEvent({
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
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// --- POST /api/v1/tags/export - Export tags for a project
router.post('/export', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
    const project = ProjectsTable.getProjectById(projectIdNum, userId);
    if (!project) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    // Get tags for the project
    const result = TagsTable.getTags({
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

    logAuditEvent({
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
  } catch (error) {
    console.error('Error exporting tags:', error);
    
    const userId = req.user?.userId;
    if (userId) {
      logAuditEvent({
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

export default router;
