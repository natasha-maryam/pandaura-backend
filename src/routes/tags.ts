import express from 'express';
import multer from 'multer';
import { authenticateToken, AuthenticatedRequest } from '../middleware/authMiddleware';
import { TagsTable, CreateTagData, UpdateTagData, Tag } from '../db/tables/tags';
import { ProjectsTable } from '../db/tables/projects';
import { logAuditEvent } from '../middleware/auditLogger';
import { 
  importBeckhoffCsv, 
  exportBeckhoffCsv, 
  importBeckhoffXml, 
  exportBeckhoffXml 
} from '../utils/beckhoffTagIO';
import {
  importRockwellCsv,
  exportRockwellCsv,
  importRockwellL5X,
  exportRockwellL5X
} from '../utils/rockwellTagIO';
import {
  importSiemensCsv,
  exportSiemensCsv,
  exportSiemensXml
} from '../utils/siemensTagIO';
import { importSiemensTags } from '../services/tagImportService';
import {
  formatTagForVendor,
  validateAddressForVendor,
  type VendorTag,
} from '../utils/vendorFormatters';

const router = express.Router();

// Configure multer for file uploads
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

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

function validateTagType(type: any): 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'STRING' {
  const validTypes = ['BOOL', 'INT', 'DINT', 'REAL', 'STRING',];
  if (!type || !validTypes.includes(type)) {
    throw new Error(`Invalid tag type. Must be one of: ${validTypes.join(', ')}`);
  }
  return type;
}

  function validateTagTypeForVendor(type: any, vendor: 'rockwell' | 'siemens' | 'beckhoff'): string {
    // For Beckhoff allow any non-empty string (custom types allowed)
    if (vendor === 'beckhoff') {
      if (!type || typeof type !== 'string' || type.trim().length === 0) {
        throw new Error('Invalid tag type for Beckhoff. Type must be a non-empty string');
      }
      return type.trim();
    }

    // For other vendors, enforce known set
    const validatedType = validateTagType(type);
    // Vendor-specific data type restrictions
    const vendorDataTypes: Record<string, string[]> = {
      rockwell: ['BOOL', 'INT', 'DINT', 'REAL', 'STRING'],
      siemens: ['BOOL', 'INT', 'DINT', 'REAL', 'STRING']
    };

    if (!vendorDataTypes[vendor].includes(validatedType)) {
      throw new Error(`Data type '${type}' is not supported by ${vendor.charAt(0).toUpperCase() + vendor.slice(1)}. Supported types: ${vendorDataTypes[vendor].join(', ')}`);
    }

    return validatedType;
  }

function validateVendor(vendor: any): 'rockwell' | 'siemens' | 'beckhoff' {
  const validVendors = ['rockwell', 'siemens', 'beckhoff'];
  if (!vendor || !validVendors.includes(vendor.toLowerCase())) {
    throw new Error(`Invalid vendor. Must be one of: ${validVendors.join(', ')}`);
  }
  return vendor.toLowerCase();
}

function validateScope(scope: any): 'global' | 'local' | 'input' | 'output' {
  const validScopes = ['global', 'local', 'input', 'output', 'internal'];
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
    const validatedVendor = validateVendor(vendor);
    const validatedType = validateTagTypeForVendor(type, validatedVendor);
    // If Beckhoff and a custom type (not one of base types), store it in data_type and use a safe base type for `type`
    const baseTypes = ['BOOL', 'INT', 'DINT', 'REAL', 'STRING'];
    let dbTypeForCreate: CreateTagData['type'] = (validatedType as any) as CreateTagData['type'];
    let dataTypeToStore = data_type || validatedType;
    if (validatedVendor === 'beckhoff' && !baseTypes.includes(validatedType.toUpperCase())) {
      dataTypeToStore = validatedType;
      dbTypeForCreate = 'DINT'; // fallback base type to satisfy DB CHECK
    }
    const validatedScope = validateScope(scope);
    const validatedTagType = validateTagTypeCategory(tag_type);
    const validatedAddress = validateAddress(address);

    const tagData: CreateTagData = {
      project_id: parseInt(project_id),
      user_id: userId,
      name: validatedName,
      description: description || '',
      type: dbTypeForCreate,
      data_type: dataTypeToStore,
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
  const tag = TagsTable.getById(tagId);

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
    
    // For type and vendor validation, we need to consider both fields together
    // Also needed for address validation
    let existingTag: Tag | null = null;
    if (type !== undefined || vendor !== undefined || address !== undefined) {
      // Get the current tag to check existing vendor/type values
  existingTag = TagsTable.getById(tagId);
      if (!existingTag) {
        return res.status(404).json({ error: 'Tag not found or access denied' });
      }
    }
    
    if (type !== undefined || vendor !== undefined) {
      const finalVendor = vendor !== undefined ? validateVendor(vendor) : existingTag!.vendor;
      const finalType = type !== undefined ? type : existingTag!.type;

      // Validate the type is supported by the vendor (may return custom string for Beckhoff)
      const validatedType = validateTagTypeForVendor(finalType, finalVendor);

    const baseTypes = ['BOOL', 'INT', 'DINT', 'REAL', 'STRING'];

      if (type !== undefined) {
        if (finalVendor === 'beckhoff' && !baseTypes.includes(validatedType.toUpperCase())) {
          // store custom type in data_type and use a safe base type for `type`
          updateData.data_type = validatedType;
          updateData.type = 'DINT';
        } else {
          // regular base type
          updateData.type = validatedType as any;
        }
      }

      if (vendor !== undefined) updateData.vendor = finalVendor;
    }
    
    if (data_type !== undefined) updateData.data_type = data_type;
    if (address !== undefined) {
      // Validate address format based on vendor
      const finalVendor = (vendor !== undefined ? updateData.vendor : existingTag!.vendor) as 'rockwell' | 'siemens' | 'beckhoff';
      const addressValidated = validateAddress(address);
      const isValidForVendor = validateAddressForVendor(address, finalVendor);
      
      if (!isValidForVendor) {
        throw new Error(`Invalid address format '${address}' for ${finalVendor.charAt(0).toUpperCase() + finalVendor.slice(1)} vendor`);
      }
      
      updateData.address = addressValidated;
    }
    if (default_value !== undefined) updateData.default_value = default_value;
    if (scope !== undefined) updateData.scope = validateScope(scope);
    if (tag_type !== undefined) updateData.tag_type = validateTagTypeCategory(tag_type);
    if (is_ai_generated !== undefined) updateData.is_ai_generated = Boolean(is_ai_generated);

  const updatedTag = TagsTable.update(tagId, updateData);

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
  const tag = TagsTable.getById(tagId);
    
    const deleted = ((): boolean => {
      try {
        TagsTable.delete(tagId);
        return true;
      } catch (err) {
        return false;
      }
    })();

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

// ===== BECKHOFF IMPORT/EXPORT ROUTES =====

// Import Beckhoff CSV
router.post('/projects/:projectId/import/beckhoff/csv', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify project exists and user has access
    const project = ProjectsTable.getProjectById(parseInt(projectId), userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await importBeckhoffCsv(req.file.buffer, parseInt(projectId), userId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log audit event
    await logAuditEvent({
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
  } catch (err) {
    console.error('Beckhoff CSV import error:', err);
    res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Internal server error' 
    });
  }
});

// Export Beckhoff CSV
router.get('/projects/:projectId/export/beckhoff/csv', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Verify project exists and user has access
    const project = ProjectsTable.getProjectById(parseInt(projectId), userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${project.project_name}-beckhoff-tags.csv"`);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');

    await exportBeckhoffCsv(parseInt(projectId), res, { delimiter: ',' });

    // Log audit event
    await logAuditEvent({
      userId: userId,
      action: 'EXPORT_BECKHOFF_CSV',
      metadata: {
        resource_type: 'tags',
        resource_id: projectId,
        filename: `${project.project_name}-beckhoff-tags.csv`
      }
    });

  } catch (err) {
    console.error('Beckhoff CSV export error:', err);
    if (!res.headersSent) {
      res.status(500).json({ 
        error: err instanceof Error ? err.message : 'Internal server error' 
      });
    }
  }
});

// Import Beckhoff XML
router.post('/projects/:projectId/import/beckhoff/xml', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const { projectId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    // Verify project exists and user has access
    const project = ProjectsTable.getProjectById(parseInt(projectId), userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const result = await importBeckhoffXml(req.file.buffer, parseInt(projectId), userId);
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Log audit event
    await logAuditEvent({
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
  } catch (err) {
    console.error('Beckhoff XML import error:', err);
    res.status(500).json({ 
      error: err instanceof Error ? err.message : 'Internal server error' 
    });
  }
});

// Export Beckhoff XML
router.get('/projects/:projectId/export/beckhoff/xml', authenticateToken, async (req, res) => {
  try {
    const { projectId } = req.params;
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user?.userId;

    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Verify project exists and user has access
    const project = ProjectsTable.getProjectById(parseInt(projectId), userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${project.project_name}-beckhoff-tags.xml"`);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');

    await exportBeckhoffXml(parseInt(projectId), res);

    // Log audit event
    await logAuditEvent({
      userId: userId,
      action: 'EXPORT_BECKHOFF_XML',
      metadata: {
        resource_type: 'tags',
        resource_id: projectId,
        filename: `${project.project_name}-beckhoff-tags.xml`
      }
    });

  } catch (err) {
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
router.get('/projects/:projectId/export/rockwell/csv', authenticateToken, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify project exists and user has access
    const project = ProjectsTable.getProjectById(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Set response headers for file download
    const filename = `${project.project_name.replace(/[^a-zA-Z0-9]/g, '_')}_rockwell_tags.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Export directly to response stream
    await exportRockwellCsv(projectId, res);

    await logAuditEvent({
      userId: userId,
      action: 'EXPORT_ROCKWELL_CSV',
      metadata: {
        resource_type: 'tags',
        resource_id: projectId,
        filename: filename
      }
    });

  } catch (error) {
    console.error('Error exporting Rockwell CSV:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to export Rockwell CSV' 
    });
  }
});

// Export Rockwell L5X XML tags
router.get('/projects/:projectId/export/rockwell/l5x', authenticateToken, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify project exists and user has access
    const project = ProjectsTable.getProjectById(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Set response headers for file download
    const filename = `${project.project_name.replace(/[^a-zA-Z0-9]/g, '_')}_rockwell_tags.l5x`;
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Export directly to response stream
    await exportRockwellL5X(projectId, res);

    await logAuditEvent({
      userId: userId,
      action: 'EXPORT_ROCKWELL_L5X',
      metadata: {
        resource_type: 'tags',
        resource_id: projectId,
        filename: filename
      }
    });

  } catch (error) {
    console.error('Error exporting Rockwell L5X:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to export Rockwell L5X' 
    });
  }
});

// Export Siemens CSV tags
router.get('/projects/:projectId/export/siemens/csv', authenticateToken, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify project exists and user has access
    const project = ProjectsTable.getProjectById(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Set response headers for file download
    const filename = `${project.project_name.replace(/[^a-zA-Z0-9]/g, '_')}_siemens_tags.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Export directly to response stream
    await exportSiemensCsv(projectId, res);

    await logAuditEvent({
      userId: userId,
      action: 'EXPORT_SIEMENS_CSV',
      metadata: {
        resource_type: 'tags',
        resource_id: projectId,
        filename: filename
      }
    });

  } catch (error) {
    console.error('Error exporting Siemens CSV:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to export Siemens CSV' 
    });
  }
});

// Export Siemens XML tags
router.get('/projects/:projectId/export/siemens/xml', authenticateToken, async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify project exists and user has access
    const project = ProjectsTable.getProjectById(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Set response headers for file download
    const filename = `${project.project_name.replace(/[^a-zA-Z0-9]/g, '_')}_siemens_tags.xml`;
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Export directly to response stream
    await exportSiemensXml(projectId, res);

    await logAuditEvent({
      userId: userId,
      action: 'EXPORT_SIEMENS_XML',
      metadata: {
        resource_type: 'tags',
        resource_id: projectId,
        filename: filename
      }
    });

  } catch (error) {
    console.error('Error exporting Siemens XML:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to export Siemens XML' 
    });
  }
});

// Import Rockwell CSV tags
router.post('/projects/:projectId/import/rockwell/csv', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify project exists and user has access
    const project = ProjectsTable.getProjectById(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.file.mimetype.includes('csv') && !req.file.originalname?.toLowerCase().endsWith('.csv')) {
      return res.status(400).json({ error: 'File must be a CSV file' });
    }

    const result = await importRockwellCsv(req.file.buffer, projectId, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    await logAuditEvent({
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

  } catch (error) {
    console.error('Error importing Rockwell CSV:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to import Rockwell CSV' 
    });
  }
});

// Import Rockwell L5X XML tags
router.post('/projects/:projectId/import/rockwell/l5x', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify project exists and user has access
    const project = ProjectsTable.getProjectById(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.file.mimetype.includes('xml') && !req.file.originalname?.toLowerCase().endsWith('.l5x')) {
      return res.status(400).json({ error: 'File must be an L5X file' });
    }

    const result = await importRockwellL5X(req.file.buffer, projectId, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    await logAuditEvent({
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

  } catch (error) {
    console.error('Error importing Rockwell L5X:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to import Rockwell L5X' 
    });
  }
});

// Import Siemens CSV tags
router.post('/projects/:projectId/import/siemens/csv', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify project exists and user has access
    const project = ProjectsTable.getProjectById(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.file.mimetype.includes('csv') && !req.file.originalname?.toLowerCase().endsWith('.csv')) {
      return res.status(400).json({ error: 'File must be a CSV file' });
    }

    const result = await importSiemensCsv(req.file.buffer, projectId, userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    await logAuditEvent({
      userId: userId,
      action: 'IMPORT_SIEMENS_CSV',
      metadata: {
        resource_type: 'tags',
        resource_id: projectId,
        imported_count: result.inserted,
        filename: req.file.originalname
      }
    });

    res.json(result);

  } catch (error) {
    console.error('Error importing Siemens CSV:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to import Siemens CSV' 
    });
  }
});

// Import Siemens XML
router.post('/projects/:projectId/import/siemens/xml', authenticateToken, upload.single('file'), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const projectId = parseInt(req.params.projectId);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    // Verify project exists and user has access
    const project = ProjectsTable.getProjectById(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!req.file.mimetype.includes('xml') && !req.file.originalname?.toLowerCase().endsWith('.xml')) {
      return res.status(400).json({ error: 'File must be an XML file' });
    }

    const result = await importSiemensTags(projectId, req.file, 'xml', userId);

    if (!result.success) {
      return res.status(400).json(result);
    }

    await logAuditEvent({
      userId: userId,
      action: 'IMPORT_SIEMENS_XML',
      metadata: {
        resource_type: 'tags',
        resource_id: projectId,
        imported_count: result.inserted,
        filename: req.file.originalname
      }
    });

    res.json(result);

  } catch (error) {
    console.error('Error importing Siemens XML:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to import Siemens XML' 
    });
  }
});

// --- GET /api/v1/tags/stats/:projectId - Get tag statistics
router.get('/stats/:projectId', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
    const project = await ProjectsTable.getProjectById(projectId, userId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found or access denied' });
    }

    // Get tag statistics (computed here because TagsTable has no getTagStats helper)
    const tagsResult = TagsTable.getTags({ project_id: projectId, user_id: userId });
    const allTags = tagsResult.tags;
    const total = tagsResult.total;
    const byVendor: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byScope: Record<string, number> = {};

    for (const t of allTags) {
      byVendor[t.vendor] = (byVendor[t.vendor] || 0) + 1;
      byType[t.type] = (byType[t.type] || 0) + 1;
      byScope[t.scope] = (byScope[t.scope] || 0) + 1;
    }

    const stats = {
      total,
      byVendor,
      byType,
      byScope
    };

    await logAuditEvent({
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

  } catch (error) {
    console.error('Error getting tag statistics:', error);
    res.status(500).json({ error: 'Failed to get tag statistics' });
  }
});

// --- POST /api/v1/tags/format/:vendor - Format tags for specific vendor
router.post('/format/:vendor', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
    const project = ProjectsTable.getProjectById(parseInt(projectId), userId);
    if (!project) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    // Format tags for the specified vendor
    const formattedTags = tags.map((tag: any) => {
      const vendorTag: VendorTag = {
        name: tag.name || 'Unnamed',
        dataType: tag.dataType || tag.type || 'DINT',
        address: tag.address,
        description: tag.description,
        scope: tag.scope || 'global',
        defaultValue: tag.defaultValue || tag.default_value,
        vendor: vendor
      };

      try {
        return formatTagForVendor(vendorTag, vendor);
      } catch (error) {
        console.error(`Error formatting tag ${tag.name}:`, error);
        return {
          ...vendorTag,
          error: `Failed to format: ${error instanceof Error ? error.message : 'Unknown error'}`
        };
      }
    });

    // Log the formatting action
    await logAuditEvent({
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

  } catch (error) {
    console.error('Error formatting tags:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to format tags' 
    });
  }
});

// --- POST /api/v1/tags/validate-addresses/:vendor - Validate addresses for specific vendor
router.post('/validate-addresses/:vendor', authenticateToken, async (req: AuthenticatedRequest, res) => {
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
    const validationResults = addresses.map((address: string) => ({
      address,
      isValid: validateAddressForVendor(address, vendor),
      vendor
    }));

    const validCount = validationResults.filter(r => r.isValid).length;
    const invalidCount = validationResults.length - validCount;

    // Log the validation action
    await logAuditEvent({
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

  } catch (error) {
    console.error('Error validating addresses:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to validate addresses' 
    });
  }
});

// --- GET /api/v1/tags/projects/:projectId/export/:vendor/formatted - Export tags in vendor-specific format
router.get('/projects/:projectId/export/:vendor/formatted', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    const projectId = parseInt(req.params.projectId);
    const vendor = validateVendor(req.params.vendor);

    // Verify project access
    const project = ProjectsTable.getProjectById(projectId, userId);
    if (!project) {
      return res.status(403).json({ error: 'Access denied to this project' });
    }

    // Get tags from the project filtered by vendor
    const tagsResult = TagsTable.getTags({ 
      project_id: projectId,
      vendor: vendor 
    });
    const tags = tagsResult.tags;

    if (tags.length === 0) {
      return res.status(404).json({ error: `No ${vendor} tags found for this project` });
    }

    // Format tags for the specified vendor
    const formattedTags = tags.map(tag => {
      const vendorTag: VendorTag = {
        name: tag.name,
        dataType: tag.data_type,
        address: tag.address,
        description: tag.description,
        scope: tag.scope,
        defaultValue: tag.default_value,
        vendor: vendor
      };

      return formatTagForVendor(vendorTag, vendor);
    });

    // Set appropriate headers for download
    const filename = `${project.project_name}_${vendor}_tags_${new Date().toISOString().split('T')[0]}.json`;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Log the export action
    await logAuditEvent({
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

  } catch (error) {
    console.error('Error exporting formatted tags:', error);
    res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Failed to export formatted tags' 
    });
  }
});

export default router;
