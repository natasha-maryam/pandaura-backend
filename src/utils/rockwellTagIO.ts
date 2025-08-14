// rockwellTagIO.ts
// Plug-and-play Rockwell CSV / L5X import-export for Pandaura AS
// Requires: TagsTable, CreateTagData from db/tables/tags
// Dependencies: csv-parse, fast-csv, xml2js, xmlbuilder

import { parse } from 'csv-parse/sync';
import * as fastCsv from 'fast-csv';
import * as xml2js from 'xml2js';
import * as xmlbuilder from 'xmlbuilder';
import { TagsTable, CreateTagData, Tag } from '../db/tables/tags';
import { Writable } from 'stream';

// Rockwell tag CSV headers mapping & normalization
const HEADER_MAP: Record<string, string> = {
  'tagname': 'name',
  'name': 'name',
  'tag name': 'name',
  'datatype': 'data_type',
  'data type': 'data_type',
  'type': 'data_type',
  'scope': 'scope',
  'description': 'description',
  'comment': 'description',
  'address': 'address',
  'external access': 'external_access',
  'default value': 'default_value',
  'initial value': 'default_value',
  // Sometimes 'Tag' or 'Symbol' in exports
  'symbol': 'name',
};

// Rockwell data types allowed (common Studio 5000 types)
const ROCKWELL_TYPES = new Set([
  'BOOL', 'SINT', 'INT', 'DINT', 'REAL', 'LINT', 'STRING', 
  'WORD', 'DWORD', 'LWORD', 'BYTE', 'CHAR', 'ENUM', 'STRUCT'
]);

// Map Rockwell types to our standard tag types
const ROCKWELL_TO_STANDARD_TYPE: Record<string, 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'STRING' | 'TIMER' | 'COUNTER'> = {
  'BOOL': 'BOOL',
  'SINT': 'INT',
  'INT': 'INT', 
  'DINT': 'DINT',
  'REAL': 'REAL',
  'LINT': 'DINT',
  'STRING': 'STRING',
  'WORD': 'INT',
  'DWORD': 'DINT',
  'LWORD': 'DINT',
  'BYTE': 'INT',
  'CHAR': 'STRING',
  'ENUM': 'INT',
  'STRUCT': 'STRING' // Default fallback
};

// Normalize data type strings to canonical Rockwell types
const DATA_TYPE_NORMALIZE: Record<string, string> = {
  'BOOL': 'BOOL',
  'SINT': 'SINT',
  'INT': 'INT',
  'DINT': 'DINT',
  'REAL': 'REAL',
  'LINT': 'LINT',
  'STRING': 'STRING',
  'WORD': 'WORD',
  'DWORD': 'DWORD',
  'LWORD': 'LWORD',
  'BYTE': 'BYTE',
  'CHAR': 'CHAR',
  'ENUM': 'ENUM',
  'STRUCT': 'STRUCT'
};

interface ParsedRockwellRow {
  name?: string;
  data_type?: string;
  scope?: string;
  description?: string;
  external_access?: string;
  default_value?: string;
  address?: string;
}

interface ValidationResult {
  errors: string[];
  mapped: CreateTagData | null;
}

// Utility: normalize header row to canonical keys
function normalizeHeaders(rawHeaders: string[]): (string | null)[] {
  return rawHeaders.map(h => {
    if (!h) return null;
    const clean = h.toString().trim().toLowerCase();
    return HEADER_MAP[clean] || null;
  });
}

// Parse Rockwell CSV buffer into canonical rows
function parseRockwellCsvBuffer(buffer: Buffer): ParsedRockwellRow[] {
  const text = buffer.toString('utf8');
  const records: any[] = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    trim: true
  });

  if (!records || records.length === 0) {
    throw new Error('No rows found in Rockwell CSV');
  }

  // Normalize headers
  const rawHeaders = Object.keys(records[0]);
  const normalized = normalizeHeaders(rawHeaders);
  const headerMap: Record<string, string | null> = {};
  rawHeaders.forEach((raw, idx) => {
    headerMap[raw] = normalized[idx];
  });

  // Convert rows to canonical objects
  const rows: ParsedRockwellRow[] = [];
  for (const rec of records) {
    const canon: ParsedRockwellRow = {};
    for (const rawKey of Object.keys(rec)) {
      const canonKey = headerMap[rawKey];
      if (!canonKey) continue; // ignore unknown columns
      (canon as any)[canonKey] = rec[rawKey] !== undefined ? rec[rawKey].toString().trim() : '';
    }
    rows.push(canon);
  }

  return rows;
}

// Validate and map a single Rockwell CSV row to internal tag model
function validateAndMapRockwellRow(row: ParsedRockwellRow, projectId: number, userId: string): ValidationResult {
  const errors: string[] = [];

  if (!row.name) {
    errors.push('Missing tag name');
  }

  if (!row.data_type) {
    errors.push('Missing data type');
  } else {
    const dtRaw = row.data_type.trim().toUpperCase();
    const dtNorm = DATA_TYPE_NORMALIZE[dtRaw];
    if (!dtNorm || !ROCKWELL_TYPES.has(dtNorm)) {
      errors.push(`Unsupported Rockwell data type: ${row.data_type}`);
    }
  }

  // Basic address validation: Rockwell addresses can be %I, %Q, or symbolic
  if (row.address) {
    const addr = row.address.trim();
    if (!addr.match(/^%[I|Q|M|T|C]\d+(\.\d+)?$/i) && !addr.match(/^[a-zA-Z_][\w]*$/)) {
      // Address is neither symbolic nor classic PLC address format
      errors.push(`Invalid Rockwell address format: ${row.address}`);
    }
  }

  if (errors.length > 0) {
    return { errors, mapped: null };
  }

  const dataType = row.data_type!.trim().toUpperCase();
  const standardType = ROCKWELL_TO_STANDARD_TYPE[dataType] || 'STRING';

  const mapped: CreateTagData = {
    project_id: projectId,
    user_id: userId,
    name: row.name!,
    description: row.description || '',
    type: standardType,
    data_type: dataType,
    address: row.address || '',
    default_value: row.default_value || '',
    vendor: 'rockwell',
    scope: (row.scope?.toLowerCase() as any) || 'global',
    tag_type: 'memory', // Default to memory type
    is_ai_generated: false
  };

  return { errors: [], mapped };
}

/**
 * importRockwellCsv
 * - buffer: Buffer of Rockwell CSV file upload
 * - projectId: number
 * - userId: string
 * - tagsTable: TagsTable instance
 *
 * Returns: { success: true, inserted: N } or throws detailed errors
 */
export async function importRockwellCsv(
  buffer: Buffer, 
  projectId: number, 
  userId: string
): Promise<{ success: boolean; inserted?: number; errors?: any[] }> {
  const rows = parseRockwellCsvBuffer(buffer);
  
  if (!rows || rows.length === 0) {
    throw new Error('No rows parsed from Rockwell CSV file');
  }

  const validTags: CreateTagData[] = [];
  const errors: any[] = [];

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const { errors: rowErrors, mapped } = validateAndMapRockwellRow(r, projectId, userId);
    
    if (rowErrors.length > 0) {
      errors.push({ row: i + 1, errors: rowErrors, raw: r });
      continue;
    }

    if (mapped) {
      validTags.push(mapped);
    }
  }

  if (errors.length > 0) {
    return { success: false, errors, inserted: validTags.length };
  }

  // Upsert tags into database
  for (const tag of validTags) {
    TagsTable.createTag(tag);
  }

  return { success: true, inserted: validTags.length };
}

/**
 * exportRockwellCsv
 * - projectId: number
 * - outStream: writable stream (e.g., fs.createWriteStream or HTTP res)
 * - tagsTable: TagsTable instance
 * - options: { delimiter: ',' or ';' } default ','
 *
 * Writes CSV compatible with Rockwell Studio 5000 Tag Database import conventions.
 * Common columns: Tag Name, Data Type, Scope, Description, External Access, Default Value, Address
 */
export async function exportRockwellCsv(
  projectId: number,
  outStream: Writable,
  options: { delimiter?: string } = {}
): Promise<boolean> {
  const delimiter = options.delimiter || ',';
  
  const tags = TagsTable.getTags({ project_id: projectId, page_size: 10000, page: 1 }).tags;

  const headers = [
    'Tag Name',
    'Data Type', 
    'Scope',
    'Description',
    'External Access',
    'Default Value',
    'Address'
  ];

  const csvStream = fastCsv.format({ headers, delimiter });
  csvStream.pipe(outStream);

  for (const tag of tags) {
    csvStream.write({
      'Tag Name': tag.name,
      'Data Type': tag.data_type || '',
      'Scope': tag.scope || 'Global',
      'Description': tag.description || '',
      'External Access': '', // Default empty for now
      'Default Value': tag.default_value || '',
      'Address': tag.address || ''
    });
  }

  csvStream.end();
  return true;
}

/**
 * importRockwellL5X
 * - buffer: Buffer of L5X XML file upload
 * - projectId: number
 * - userId: string
 * - tagsTable: TagsTable instance
 *
 * Parses Rockwell Studio 5000 L5X XML tag export, validates tags, and upserts.
 *
 * Returns: { success: true, inserted: N } or throws detailed errors
 */
export async function importRockwellL5X(
  buffer: Buffer, 
  projectId: number, 
  userId: string
): Promise<{ success: boolean; inserted?: number; errors?: any[] }> {
  const xmlStr = buffer.toString('utf8');
  const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
  
  let parsedXml: any;
  try {
    parsedXml = await parser.parseStringPromise(xmlStr);
  } catch (err: any) {
    throw new Error('Failed to parse L5X XML: ' + err.message);
  }

  // Navigate XML: Root > ControllerTags > Tag (array or single)
  const tagsNode = parsedXml?.ControllerTags?.Tag;
  if (!tagsNode) {
    throw new Error('No Tags found in L5X XML');
  }

  // Tags can be array or single object
  const tagsArray = Array.isArray(tagsNode) ? tagsNode : [tagsNode];
  const validTags: CreateTagData[] = [];
  const errors: any[] = [];

  // Map L5X Tag to internal model
  for (let i = 0; i < tagsArray.length; i++) {
    const t = tagsArray[i];
    const name = t.Name || null;
    const dataType = t.DataType || null;
    const description = t.Comment || '';
    const scope = t.Scope || 'Global';

    if (!name) {
      errors.push({ row: i + 1, errors: ['Missing tag name'], raw: t });
      continue;
    }

    if (!dataType || !ROCKWELL_TYPES.has(dataType.toUpperCase())) {
      errors.push({ row: i + 1, errors: [`Unsupported or missing data type: ${dataType}`], raw: t });
      continue;
    }

    const standardType = ROCKWELL_TO_STANDARD_TYPE[dataType.toUpperCase()] || 'STRING';

    const tag: CreateTagData = {
      project_id: projectId,
      user_id: userId,
      name,
      description,
      type: standardType,
      data_type: dataType.toUpperCase(),
      address: '', // L5X typically doesn't include physical addresses
      default_value: '',
      vendor: 'rockwell',
      scope: scope.toLowerCase() as any,
      tag_type: 'memory',
      is_ai_generated: false
    };

    validTags.push(tag);
  }

  if (errors.length > 0) {
    return { success: false, errors, inserted: validTags.length };
  }

  // Upsert tags into database
  for (const tag of validTags) {
    TagsTable.createTag(tag);
  }

  return { success: true, inserted: validTags.length };
}

/**
 * exportRockwellL5X
 * - projectId: number
 * - outStream: writable stream
 * - tagsTable: TagsTable instance
 *
 * Generates Rockwell Studio 5000 L5X XML tag export compatible with import
 */
export async function exportRockwellL5X(
  projectId: number,
  outStream: Writable
): Promise<boolean> {
  const tags = TagsTable.getTags({ project_id: projectId, page_size: 10000, page: 1 }).tags;

  // Build XML root
  const root = xmlbuilder.create('ControllerTags', { encoding: 'utf-8' });
  
  for (const tag of tags) {
    const tagNode = root.ele('Tag');
    tagNode.ele('Name', {}, tag.name);
    tagNode.ele('DataType', {}, tag.data_type || 'DINT');
    if (tag.description) {
      tagNode.ele('Comment', {}, tag.description);
    }
    tagNode.ele('Scope', {}, tag.scope || 'Global');
  }

  const xmlString = root.end({ pretty: true });
  outStream.write(xmlString);
  outStream.end();
  return true;
}
