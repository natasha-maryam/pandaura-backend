// beckhoffTagIO.ts
// Plug-and-play Beckhoff CSV + XML import/export helper for Pandaura AS backend
// Requires: TagsTable, CreateTagData from db/tables/tags
// Dependencies: csv-parse, fast-csv, xml2js, xmlbuilder

import { parse } from 'csv-parse/sync';
import * as fastCsv from 'fast-csv';
import * as xml2js from 'xml2js';
import * as xmlbuilder from 'xmlbuilder';
import { TagsTable, CreateTagData, Tag } from '../db/tables/tags';
import { Writable } from 'stream';

// --- Beckhoff CSV headers normalization map (common variants from TwinCAT CSV exports)
const HEADER_MAP: Record<string, string> = {
  'name': 'name',
  'variable name': 'name',
  'variable_name': 'name',
  'symbol': 'name',
  'type': 'data_type',
  'data type': 'data_type',
  'data_type': 'data_type',
  'datatype': 'data_type',
  'comment': 'comment',
  'description': 'comment',
  'address': 'address',
  'physical address': 'address',
  'physical_address': 'address',
  'initial value': 'default_value',
  'initial_value': 'default_value',
  'default value': 'default_value',
  'default_value': 'default_value',
  'initialvalue': 'default_value',
  'scope': 'scope',
  'access mode': 'access_mode',
  'access_mode': 'access_mode',
  'category': 'category'
};

// --- Beckhoff common data types (TwinCAT data types) - extend as needed
const BECKHOFF_TYPES = new Set([
  'BOOL', 'BYTE', 'WORD', 'DWORD', 'LWORD',
  'SINT', 'USINT', 'INT', 'UINT',
  'DINT', 'UDINT', 'LINT', 'ULINT',
  'REAL', 'LREAL', 'TIME', 'DATE', 'TIME_OF_DAY', 'DATE_AND_TIME',
  'STRING', 'WSTRING',
  'ARRAY', 'STRUCT'
]);

// Map Beckhoff types to our standard tag types
const BECKHOFF_TO_STANDARD_TYPE: Record<string, 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'STRING' | 'TIMER' | 'COUNTER'> = {
  'BOOL': 'BOOL',
  'BYTE': 'INT',
  'WORD': 'INT',
  'DWORD': 'DINT',
  'LWORD': 'DINT',
  'SINT': 'INT',
  'USINT': 'INT',
  'INT': 'INT',
  'UINT': 'INT',
  'DINT': 'DINT',
  'UDINT': 'DINT',
  'LINT': 'DINT',
  'ULINT': 'DINT',
  'REAL': 'REAL',
  'LREAL': 'REAL',
  'TIME': 'TIMER',
  'DATE': 'STRING',
  'TIME_OF_DAY': 'TIMER',
  'DATE_AND_TIME': 'STRING',
  'STRING': 'STRING',
  'WSTRING': 'STRING',
  'ARRAY': 'STRING',
  'STRUCT': 'STRING'
};

// Normalize data type strings to canonical Beckhoff types (case-insensitive)
const DATA_TYPE_NORMALIZE: Record<string, string> = {
  'bool': 'BOOL',
  'byte': 'BYTE',
  'word': 'WORD',
  'dword': 'DWORD',
  'lword': 'LWORD',
  'sint': 'SINT',
  'usint': 'USINT',
  'int': 'INT',
  'uint': 'UINT',
  'dint': 'DINT',
  'udint': 'UDINT',
  'lint': 'LINT',
  'ulint': 'ULINT',
  'real': 'REAL',
  'lreal': 'LREAL',
  'time': 'TIME',
  'date': 'DATE',
  'time_of_day': 'TIME_OF_DAY',
  'date_and_time': 'DATE_AND_TIME',
  'string': 'STRING',
  'wstring': 'WSTRING',
  'array': 'ARRAY',
  'struct': 'STRUCT'
};

interface ParsedRow {
  name?: string;
  data_type?: string;
  address?: string;
  default_value?: string;
  scope?: string;
  comment?: string;
  access_mode?: string;
  category?: string;
}

interface ValidationResult {
  errors: string[];
  mapped: {
    name: string | null;
    standardType: 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'STRING' | 'TIMER' | 'COUNTER' | null;
    dataType: string | null;
    address: string | null;
    defaultValue: string | null;
    scope: 'global' | 'local' | 'input' | 'output';
    comment: string;
    accessMode: string;
  };
}

interface ImportResult {
  success: boolean;
  inserted?: number;
  errors?: Array<{
    row: number;
    errors: string[];
    raw: any;
  }>;
  processed?: number;
}

// Utility: normalize header row to canonical keys
function normalizeHeaders(rawHeaders: string[]): (string | null)[] {
  return rawHeaders.map(h => {
    if (!h) return null;
    const clean = h.toString().trim().toLowerCase().replace(/\s+/g, '_');
    return HEADER_MAP[clean] || null;
  });
}

// --- CSV Parsing and Normalization ---
function parseBeckhoffCsvBuffer(buffer: Buffer): ParsedRow[] {
  const text = buffer.toString('utf8');
  const records = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  }) as Record<string, any>[];

  if (!records || records.length === 0) {
    throw new Error('No rows found in Beckhoff CSV');
  }

  // Normalize headers
  const rawHeaders = Object.keys(records[0]);
  const normalized = normalizeHeaders(rawHeaders);
  const headerMap: Record<string, string | null> = {};
  
  rawHeaders.forEach((raw, idx) => {
    headerMap[raw] = normalized[idx];
  });

  // Convert rows to canonical objects
  const rows: ParsedRow[] = [];
  for (const rec of records) {
    const canon: ParsedRow = {};
    for (const rawKey of Object.keys(rec)) {
      const canonKey = headerMap[rawKey];
      if (!canonKey) continue; // ignore unknown columns
      (canon as any)[canonKey] = rec[rawKey] !== undefined ? rec[rawKey].toString().trim() : '';
    }
    rows.push(canon);
  }

  return rows;
}

// --- Validation & Mapping for Beckhoff Tags ---
function validateAndMapBeckhoffRow(row: ParsedRow): ValidationResult {
  const errors: string[] = [];
  const mapped = {
    name: row.name || null,
    standardType: null as 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'STRING' | 'TIMER' | 'COUNTER' | null,
    dataType: null as string | null,
    address: row.address || null,
    defaultValue: row.default_value || null,
    scope: 'global' as 'global' | 'local' | 'input' | 'output',
    comment: row.comment || '',
    accessMode: row.access_mode || ''
  };

  if (!mapped.name) {
    errors.push('Missing variable name');
  }

  if (row.data_type) {
    const dtRaw = row.data_type.trim().toLowerCase().replace(/\s+/g, '_');
    const dtNorm = DATA_TYPE_NORMALIZE[dtRaw];
    if (!dtNorm || !BECKHOFF_TYPES.has(dtNorm)) {
      errors.push(`Unsupported Beckhoff data type: ${row.data_type}`);
    } else {
      mapped.dataType = dtNorm;
      mapped.standardType = BECKHOFF_TO_STANDARD_TYPE[dtNorm];
    }
  } else {
    errors.push('Missing data type');
  }

  // Set scope based on address or default to global
  if (mapped.address) {
    const addr = mapped.address.trim();
    if (addr.match(/^%I/i)) {
      mapped.scope = 'input';
    } else if (addr.match(/^%Q/i)) {
      mapped.scope = 'output';
    }
    
    // Basic address validation: Beckhoff physical addresses
    // Supports: %I, %Q, %M addresses with various formats, symbolic names
    const validAddressFormats = [
      /^%[IQMT]\d+(\.\d+)?$/i,      // %I0.0, %Q2, %M1.5, %T0
      /^%[IQMT][BWDL]\d+$/i,        // %IB0, %QW1, %MD200, %ML100
      /^%[IQMT][BWDL]*\d+$/i,       // %MW100, %MB400 (memory addresses)
      /^[a-zA-Z_][\w]*$/,           // Symbolic names
      /^GVL\.[a-zA-Z_][\w]*$/i,     // Global variable list references
      /^MAIN\.[a-zA-Z_][\w]*$/i     // Program references
    ];
    
    const isValidAddress = validAddressFormats.some(pattern => addr.match(pattern));
    if (!isValidAddress) {
      errors.push(`Invalid Beckhoff address format: ${mapped.address}`);
    }
  }

  return { errors, mapped };
}

// Create or update tags in database (upsert functionality)
async function upsertTagsInDB(projectId: number, userId: string, tags: CreateTagData[]): Promise<void> {
  for (const tagData of tags) {
    try {
      // Try to find existing tag
      const existingTagsResult = TagsTable.getTags({ project_id: projectId });
      const existingTag = existingTagsResult.tags.find((t: Tag) => t.name === tagData.name);
      
      if (existingTag) {
        // Update existing tag
        TagsTable.updateTag(existingTag.id, {
          description: tagData.description,
          type: tagData.type,
          data_type: tagData.data_type,
          address: tagData.address,
          default_value: tagData.default_value,
          vendor: tagData.vendor,
          scope: tagData.scope,
          tag_type: tagData.tag_type,
          is_ai_generated: tagData.is_ai_generated
        });
      } else {
        // Create new tag
        TagsTable.createTag(tagData);
      }
    } catch (error) {
      console.error(`Error upserting tag ${tagData.name}:`, error);
      throw error;
    }
  }
}

/**
 * importBeckhoffCsv
 * - buffer: Buffer of Beckhoff CSV file upload
 * - projectId: number
 * - userId: string
 *
 * Returns: { success: true, inserted: N } or detailed errors
 */
export async function importBeckhoffCsv(buffer: Buffer, projectId: number, userId: string): Promise<ImportResult> {
  try {
    const rows = parseBeckhoffCsvBuffer(buffer);
    if (!rows || rows.length === 0) {
      throw new Error('No rows parsed from Beckhoff CSV file');
    }

    const validTags: CreateTagData[] = [];
    const errors: Array<{ row: number; errors: string[]; raw: any }> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const { errors: rowErrors, mapped } = validateAndMapBeckhoffRow(r);
      
      if (rowErrors.length) {
        errors.push({ row: i + 1, errors: rowErrors, raw: r });
        continue;
      }

      if (!mapped.name || !mapped.standardType || !mapped.dataType) {
        errors.push({ row: i + 1, errors: ['Missing required fields after validation'], raw: r });
        continue;
      }

      // Determine tag_type based on address or default to memory
      let tagType: 'input' | 'output' | 'memory' | 'temp' | 'constant' = 'memory';
      if (mapped.address) {
        if (mapped.address.match(/^%I/i)) {
          tagType = 'input';
        } else if (mapped.address.match(/^%Q/i)) {
          tagType = 'output';
        }
      }

      const tag: CreateTagData = {
        project_id: projectId,
        user_id: userId,
        name: mapped.name,
        description: mapped.comment,
        type: mapped.standardType,
        data_type: mapped.dataType,
        address: mapped.address || '',
        default_value: mapped.defaultValue || undefined,
        vendor: 'beckhoff',
        scope: mapped.scope,
        tag_type: tagType,
        is_ai_generated: false
      };

      validTags.push(tag);
    }

    if (errors.length) {
      return { success: false, errors, processed: validTags.length };
    }

    await upsertTagsInDB(projectId, userId, validTags);
    return { success: true, inserted: validTags.length };
  } catch (error) {
    throw new Error(`Failed to import Beckhoff CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// --- Export Beckhoff CSV ---
// Columns usually required for Beckhoff CSV import: Name, DataType, Address, Comment, InitialValue, Scope, AccessMode
export async function exportBeckhoffCsv(projectId: number, outStream: Writable, options: { delimiter?: string } = {}): Promise<boolean> {
  const delimiter = options.delimiter || ',';
  
  try {
    const tagsResult = TagsTable.getTags({ project_id: projectId });
    const tags = tagsResult.tags;

    const headers = [
      'Name',
      'DataType',
      'Address',
      'Comment',
      'InitialValue',
      'Scope',
      'AccessMode'
    ];

    const csvStream = fastCsv.format({ headers, delimiter });
    csvStream.pipe(outStream);

    for (const tag of tags) {
      csvStream.write({
        Name: tag.name,
        DataType: tag.data_type || '',
        Address: tag.address || '',
        Comment: tag.description || '',
        InitialValue: tag.default_value || '',
        Scope: tag.scope || 'Global',
        AccessMode: '' // Not stored in our current schema
      });
    }

    csvStream.end();
    return true;
  } catch (error) {
    throw new Error(`Failed to export Beckhoff CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// --- Beckhoff XML Import (e.g. TwinCAT ADS XML format) ---
// This is a simplified parser assuming tags under <Variables><Variable>...</Variable></Variables>
// Extend as needed to support more TwinCAT XML features
export async function importBeckhoffXml(buffer: Buffer, projectId: number, userId: string): Promise<ImportResult> {
  try {
    const xmlStr = buffer.toString('utf8');
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    
    let parsedXml: any;
    try {
      parsedXml = await parser.parseStringPromise(xmlStr);
    } catch (err) {
      throw new Error('Failed to parse Beckhoff XML: ' + (err instanceof Error ? err.message : 'Unknown error'));
    }

    const variablesNode = parsedXml?.Variables?.Variable;
    if (!variablesNode) {
      throw new Error('No Variables found in Beckhoff XML');
    }

    const varsArray = Array.isArray(variablesNode) ? variablesNode : [variablesNode];
    const validTags: CreateTagData[] = [];
    const errors: Array<{ row: number; errors: string[]; raw: any }> = [];

    for (let i = 0; i < varsArray.length; i++) {
      const v = varsArray[i];
      const name = v.Name || null;
      const dataTypeRaw = v.DataType || v.Type || null;
      const comment = v.Comment || '';
      const address = v.PhysicalAddress || null;
      const scope = 'global'; // Beckhoff XML often doesn't specify scope explicitly

      if (!name) {
        errors.push({ row: i + 1, errors: ['Missing variable name'], raw: v });
        continue;
      }

      if (!dataTypeRaw) {
        errors.push({ row: i + 1, errors: ['Missing data type'], raw: v });
        continue;
      }

      const dtNorm = DATA_TYPE_NORMALIZE[dataTypeRaw.toLowerCase()] || null;
      if (!dtNorm || !BECKHOFF_TYPES.has(dtNorm)) {
        errors.push({ row: i + 1, errors: [`Unsupported Beckhoff data type: ${dataTypeRaw}`], raw: v });
        continue;
      }

      const standardType = BECKHOFF_TO_STANDARD_TYPE[dtNorm];
      if (!standardType) {
        errors.push({ row: i + 1, errors: [`Cannot map data type to standard type: ${dtNorm}`], raw: v });
        continue;
      }

      // Determine tag_type based on address or default to memory
      let tagType: 'input' | 'output' | 'memory' | 'temp' | 'constant' = 'memory';
      if (address) {
        if (address.match(/^%I/i)) {
          tagType = 'input';
        } else if (address.match(/^%Q/i)) {
          tagType = 'output';
        }
      }

      validTags.push({
        project_id: projectId,
        user_id: userId,
        name,
        description: comment,
        type: standardType,
        data_type: dtNorm,
        address: address || '',
        default_value: undefined,
        vendor: 'beckhoff',
        scope: scope as 'global' | 'local' | 'input' | 'output',
        tag_type: tagType,
        is_ai_generated: false
      });
    }

    if (errors.length) {
      return { success: false, errors, processed: validTags.length };
    }

    await upsertTagsInDB(projectId, userId, validTags);
    return { success: true, inserted: validTags.length };
  } catch (error) {
    throw new Error(`Failed to import Beckhoff XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// --- Beckhoff XML Export (simplified) ---
export async function exportBeckhoffXml(projectId: number, outStream: Writable): Promise<boolean> {
  try {
    const tagsResult = TagsTable.getTags({ project_id: projectId });
    const tags = tagsResult.tags;

    const root = xmlbuilder.create('Variables', { encoding: 'utf-8' });

    for (const tag of tags) {
      const varNode = root.ele('Variable');
      varNode.ele('Name', {}, tag.name);
      varNode.ele('DataType', {}, tag.data_type || 'DINT');
      if (tag.address) varNode.ele('PhysicalAddress', {}, tag.address);
      if (tag.description) varNode.ele('Comment', {}, tag.description);
      varNode.ele('Scope', {}, tag.scope || 'Global');
    }

    const xmlString = root.end({ pretty: true });
    outStream.write(xmlString);
    outStream.end();
    return true;
  } catch (error) {
    throw new Error(`Failed to export Beckhoff XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// Export helper functions for unit tests if needed
export {
  parseBeckhoffCsvBuffer,
  validateAndMapBeckhoffRow,
  upsertTagsInDB
};
