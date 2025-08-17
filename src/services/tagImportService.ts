import { parse as csvParse } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import * as xml2js from 'xml2js';
import { Tag, CreateTagData } from '../types';
import { validateAddressForVendor } from '../utils/vendorFormatters';
import { TagsTable } from '../db/tables/tags';
import { getTagSyncService } from './tagSyncSingleton';

export interface ImportError {
  row: number;
  errors: string[];
  raw: any;
}

export interface ImportResult {
  success: boolean;
  inserted?: number;
  errors?: ImportError[];
  processed?: number;
}

function validateTagRow(tag: Partial<Tag>, vendor: string): string[] {
  const errors: string[] = [];

  if (!tag.name) {
    errors.push('Missing tag name');
  }

  if (!tag.data_type) {
    errors.push('Missing data type');
  }

  // Vendor-specific address format validation — use the central helper so imports match UI validation
  if (tag.address) {
    const ok = validateAddressForVendor(tag.address, vendor as 'rockwell' | 'siemens' | 'beckhoff');
    if (!ok) {
      errors.push(`Invalid ${vendor.charAt(0).toUpperCase() + vendor.slice(1)} address format`);
    }
  } else {
    errors.push('Missing address');
  }

  return errors;
}

// Base class for tag importers
abstract class TagImporter {
  protected projectId: number;
  protected file: Express.Multer.File;

  constructor(projectId: number, file: Express.Multer.File) {
    this.projectId = projectId;
    this.file = file;
  }

  abstract parseFile(): Promise<CreateTagData[]>;
  abstract validateTags(tags: CreateTagData[]): ImportError[];

  protected mapDataTypeToType(dataType: any): Tag['type'] {
    // Coerce to string safely (handles undefined/null/objects)
    const normalizedType = String(dataType ?? '').toUpperCase();
    if (normalizedType.includes('BOOL')) return 'BOOL';
    if (normalizedType.includes('INT')) return 'INT';
    if (normalizedType.includes('DINT')) return 'DINT';
    if (normalizedType.includes('REAL')) return 'REAL';
    if (normalizedType.includes('STRING')) return 'STRING';
    return 'DINT'; // Default to DINT for unknown types
  }
}

// Rockwell tag importer
class RockwellTagImporter extends TagImporter {
  async parseFile(): Promise<CreateTagData[]> {
    const content = this.file.buffer.toString('utf8');
    const records = csvParse(content, {
      columns: true,
      skip_empty_lines: true
    });

    return records.map((record: any) => ({
      project_id: this.projectId,
      user_id: '',  // Will be set from authenticated user
      name: record['Tag Name'],
      type: this.mapDataTypeToType(record['Data Type']),
      data_type: record['Data Type'],
      scope: record['Scope']?.toLowerCase() || 'local',
      description: record['Description'] || '',
      address: record['Address'],
      default_value: record['Default Value'] || '',
      vendor: 'rockwell' as const,
      tag_type: 'memory',
      is_ai_generated: false
    }));
  }

  validateTags(tags: Tag[]): ImportError[] {
    return tags.map((tag, index) => {
      const errors = validateTagRow(tag, 'rockwell');
      return errors.length > 0 ? { row: index + 1, errors, raw: tag } : null;
    }).filter(Boolean) as ImportError[];
  }
}

// Siemens tag importer
class SiemensTagImporter extends TagImporter {
  async parseFile(): Promise<CreateTagData[]> {
    let records: any[];
    if (this.file.mimetype.includes('spreadsheet')) {
      const workbook = XLSX.read(this.file.buffer);
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      records = XLSX.utils.sheet_to_json(firstSheet);
    } else if (this.file.mimetype.includes('xml') || this.file.originalname?.toLowerCase().endsWith('.xml')) {
      // Parse Siemens PLCOpen / TIA Portal XML format
      const parser = new xml2js.Parser();
      const content = this.file.buffer.toString('utf8');
      const parsed = await parser.parseStringPromise(content);
      // Expecting structure: Siemens.TIA.Portal.TagTable -> TagTable -> Tags -> Tag[]
      const tagsNode = parsed?.['Siemens.TIA.Portal.TagTable']?.TagTable?.[0]?.Tags?.[0]?.Tag || parsed?.TagTable?.Tags?.[0]?.Tag || [];
      records = (tagsNode as any[]).map((t: any) => ({
  Name: t.Name?.[0] || (typeof t.Name === 'string' ? t.Name : undefined),
  DataType: (Array.isArray(t.DataType) ? t.DataType[0] : (t.DataType && typeof t.DataType === 'object' ? (t.DataType._ || t.DataType) : t.DataType)),
  Address: t.Address?.[0] || (typeof t.Address === 'string' ? t.Address : undefined),
  Comment: t.Comment?.[0] || (typeof t.Comment === 'string' ? t.Comment : undefined),
  InitialValue: t.InitialValue?.[0] || (typeof t.InitialValue === 'string' ? t.InitialValue : undefined),
  Scope: t.Scope?.[0] || (typeof t.Scope === 'string' ? t.Scope : undefined)
      }));
    } else {
      const content = this.file.buffer.toString('utf8');
      records = csvParse(content, {
        columns: true,
        skip_empty_lines: true
      });
    }

    return records.map((record: any) => ({
      project_id: this.projectId,
      user_id: '',  // Will be set from authenticated user
      name: record['Name'] || record['name'] || record.Name || record.nameText,
      type: this.mapDataTypeToType(record['Data Type'] || record['DataType'] || record.DataType || record.data_type),
      data_type: record['Data Type'] || record['DataType'] || record.DataType || record.data_type || '',
      scope: 'global',
      description: record['Comment'] || '',
      address: record['Address'] || record['Address'] || record.address || '',
      default_value: record['Initial Value'] || record['InitialValue'] || record.InitialValue || '',
      vendor: 'siemens' as const,
      tag_type: 'memory',
      is_ai_generated: false
    }));
  }

  validateTags(tags: Tag[]): ImportError[] {
    return tags.map((tag, index) => {
      const errors = validateTagRow(tag, 'siemens');
      return errors.length > 0 ? { row: index + 1, errors, raw: tag } : null;
    }).filter(Boolean) as ImportError[];
  }
}

// Beckhoff tag importer
class BeckhoffTagImporter extends TagImporter {
  async parseFile(): Promise<CreateTagData[]> {
    if (this.file.mimetype.includes('xml')) {
      const parser = new xml2js.Parser();
      const result = await parser.parseStringPromise(this.file.buffer.toString());
      const variables = result.Variables?.Variable || [];
      
      return variables.map((v: any) => ({
        project_id: this.projectId,
        user_id: '',  // Will be set from authenticated user
        name: v.Name[0],
        type: this.mapDataTypeToType(v.DataType[0]),
        data_type: v.DataType[0],
        scope: v.Scope?.[0]?.toLowerCase() || 'local',
        description: v.Comment?.[0] || '',
        address: v.PhysicalAddress?.[0] || '',
        default_value: v.InitialValue?.[0] || '',
        vendor: 'beckhoff' as const,
        tag_type: 'memory',
        is_ai_generated: false
      }));
    } else {
      const content = this.file.buffer.toString('utf8');
      const records = csvParse(content, {
        columns: true,
        skip_empty_lines: true
      });

      return records.map((record: any) => ({
        project_id: this.projectId,
        user_id: '',  // Will be set from authenticated user
        name: record['Name'],
        type: this.mapDataTypeToType(record['DataType']),
        data_type: record['DataType'],
        scope: record['Scope']?.toLowerCase() || 'local',
        description: record['Comment'] || '',
        address: record['Address'],
        default_value: record['InitialValue'] || '',
        vendor: 'beckhoff' as const,
        tag_type: 'memory',
        is_ai_generated: false
      }));
    }
  }

  validateTags(tags: Tag[]): ImportError[] {
    return tags.map((tag, index) => {
      const errors = validateTagRow(tag, 'beckhoff');
      return errors.length > 0 ? { row: index + 1, errors, raw: tag } : null;
    }).filter(Boolean) as ImportError[];
  }
}

// Factory function to create appropriate importer
function createImporter(vendor: string, projectId: number, file: Express.Multer.File): TagImporter {
  switch (vendor) {
    case 'rockwell':
      return new RockwellTagImporter(projectId, file);
    case 'siemens':
      return new SiemensTagImporter(projectId, file);
    case 'beckhoff':
      return new BeckhoffTagImporter(projectId, file);
    default:
      throw new Error(`Unsupported vendor: ${vendor}`);
  }
}

// Main import functions
export async function importRockwellTags(
  projectId: number,
  file: Express.Multer.File,
  format: string,
  userId: string
): Promise<ImportResult> {
  const importer = createImporter('rockwell', projectId, file);
  const tags = await importer.parseFile();
  const errors = importer.validateTags(tags);
  
  if (errors.length > 0) {
    return {
      success: false,
      errors,
      processed: tags.length
    };
  }

  // Set user_id for all tags
  const tagsWithUser = tags.map(tag => ({ ...tag, user_id: userId }));

  // Save valid tags to database, collecting per-row save errors (e.g., duplicates)
  const saveErrors: ImportError[] = [];
  const savedTags: Tag[] = [];

  for (let i = 0; i < tagsWithUser.length; i++) {
    const tag = tagsWithUser[i];
    try {
      const created = await TagsTable.create(tag);
      savedTags.push(created);
    } catch (error: any) {
      console.error('Error saving tag:', error);
      const msg = (error && (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || (error.message && error.message.includes('UNIQUE'))))
        ? 'Duplicate tag name'
        : (error && error.message) || 'Failed to save tag';
      saveErrors.push({ row: i + 1, errors: [msg], raw: tag });
      // continue saving remaining tags
    }
  }

  const insertedCount = savedTags.length;

  // Notify real-time tag sync subscribers if any tags were inserted
  try {
    const tagSync = getTagSyncService();
    if (insertedCount > 0 && tagSync) {
      tagSync.notifyProjectTagsUpdated(projectId);
    }
  } catch (err) {
    console.error('Failed to notify TagSyncService after Rockwell import:', err);
  }

  return {
    success: insertedCount > 0,
    inserted: insertedCount,
    errors: saveErrors.length > 0 ? saveErrors : undefined,
    processed: tags.length
  };
}

export async function importSiemensTags(
  projectId: number,
  file: Express.Multer.File,
  format: string,
  userId: string
): Promise<ImportResult> {
  const importer = createImporter('siemens', projectId, file);
  const tags = await importer.parseFile();
  const errors = importer.validateTags(tags);
  
  if (errors.length > 0) {
    return {
      success: false,
      errors,
      processed: tags.length
    };
  }

  // Set user_id for all tags
  const tagsWithUser = tags.map(tag => ({ ...tag, user_id: userId }));

  // Save valid tags to database, collecting per-row save errors
  const saveErrors: ImportError[] = [];
  const savedTags: Tag[] = [];

  for (let i = 0; i < tagsWithUser.length; i++) {
    const tag = tagsWithUser[i];
    try {
      const created = await TagsTable.create(tag);
      savedTags.push(created);
    } catch (error: any) {
      console.error('Error saving tag:', error);
      const msg = (error && (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || (error.message && error.message.includes('UNIQUE'))))
        ? 'Duplicate tag name'
        : (error && error.message) || 'Failed to save tag';
      saveErrors.push({ row: i + 1, errors: [msg], raw: tag });
    }
  }

  const insertedCount = savedTags.length;

  // Notify real-time tag sync subscribers if any tags were inserted
  try {
    const tagSync = getTagSyncService();
    if (insertedCount > 0 && tagSync) {
      tagSync.notifyProjectTagsUpdated(projectId);
    }
  } catch (err) {
    console.error('Failed to notify TagSyncService after Siemens import:', err);
  }

  return {
    success: insertedCount > 0,
    inserted: insertedCount,
    errors: saveErrors.length > 0 ? saveErrors : undefined,
    processed: tags.length
  };
}

export async function importBeckhoffTags(
  projectId: number,
  file: Express.Multer.File,
  format: string,
  userId: string
): Promise<ImportResult> {
  const importer = createImporter('beckhoff', projectId, file);
  const tags = await importer.parseFile();
  const errors = importer.validateTags(tags);
  
  if (errors.length > 0) {
    return {
      success: false,
      errors,
      processed: tags.length
    };
  }

  // Set user_id for all tags
  const tagsWithUser = tags.map(tag => ({ ...tag, user_id: userId }));

  // Save valid tags to database, collecting per-row save errors
  const saveErrors: ImportError[] = [];
  const savedTags: Tag[] = [];

  for (let i = 0; i < tagsWithUser.length; i++) {
    const tag = tagsWithUser[i];
    try {
      const created = await TagsTable.create(tag);
      savedTags.push(created);
    } catch (error: any) {
      console.error('Error saving tag:', error);
      const msg = (error && (error.code === 'SQLITE_CONSTRAINT_UNIQUE' || (error.message && error.message.includes('UNIQUE'))))
        ? 'Duplicate tag name'
        : (error && error.message) || 'Failed to save tag';
      saveErrors.push({ row: i + 1, errors: [msg], raw: tag });
    }
  }

  const insertedCount = savedTags.length;

  // Notify real-time tag sync subscribers if any tags were inserted
  try {
    const tagSync = getTagSyncService();
    if (insertedCount > 0 && tagSync) {
      tagSync.notifyProjectTagsUpdated(projectId);
    }
  } catch (err) {
    console.error('Failed to notify TagSyncService after Beckhoff import:', err);
  }

  return {
    success: insertedCount > 0,
    inserted: insertedCount,
    errors: saveErrors.length > 0 ? saveErrors : undefined,
    processed: tags.length
  };
}
