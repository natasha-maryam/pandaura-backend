"use strict";
// beckhoffTagIO.ts
// Plug-and-play Beckhoff CSV + XML + XLSX import/export helper for Pandaura AS backend
// Requires: TagsTable, CreateTagData from db/tables/tags
// Dependencies: csv-parse, fast-csv, xml2js, xmlbuilder, xlsx
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.importBeckhoffCsv = importBeckhoffCsv;
exports.exportBeckhoffCsv = exportBeckhoffCsv;
exports.importBeckhoffXml = importBeckhoffXml;
exports.exportBeckhoffXml = exportBeckhoffXml;
exports.exportBeckhoffXlsx = exportBeckhoffXlsx;
exports.parseBeckhoffCsvBuffer = parseBeckhoffCsvBuffer;
exports.validateAndMapBeckhoffRow = validateAndMapBeckhoffRow;
exports.upsertTagsInDB = upsertTagsInDB;
const sync_1 = require("csv-parse/sync");
const fastCsv = __importStar(require("fast-csv"));
const xml2js = __importStar(require("xml2js"));
const xmlbuilder = __importStar(require("xmlbuilder"));
const XLSX = __importStar(require("xlsx"));
const knex_1 = __importDefault(require("../db/knex"));
// --- Beckhoff CSV headers normalization map (common variants from TwinCAT CSV exports)
const HEADER_MAP = {
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
const BECKHOFF_TO_STANDARD_TYPE = {
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
    'TIME': 'DINT',
    'DATE': 'STRING',
    'TIME_OF_DAY': 'DINT',
    'DATE_AND_TIME': 'STRING',
    'STRING': 'STRING',
    'WSTRING': 'STRING',
    'ARRAY': 'STRING',
    'STRUCT': 'STRING'
};
// Normalize data type strings to canonical Beckhoff types (case-insensitive)
const DATA_TYPE_NORMALIZE = {
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
// Utility: normalize header row to canonical keys
function normalizeHeaders(rawHeaders) {
    return rawHeaders.map(h => {
        if (!h)
            return null;
        const clean = h.toString().trim().toLowerCase().replace(/\s+/g, '_');
        return HEADER_MAP[clean] || null;
    });
}
// --- CSV Parsing and Normalization ---
function parseBeckhoffCsvBuffer(buffer) {
    const text = buffer.toString('utf8');
    const records = (0, sync_1.parse)(text, {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
        trim: true
    });
    if (!records || records.length === 0) {
        throw new Error('No rows found in Beckhoff CSV');
    }
    // Normalize headers
    const rawHeaders = Object.keys(records[0]);
    const normalized = normalizeHeaders(rawHeaders);
    const headerMap = {};
    rawHeaders.forEach((raw, idx) => {
        headerMap[raw] = normalized[idx];
    });
    // Convert rows to canonical objects
    const rows = [];
    for (const rec of records) {
        const canon = {};
        for (const rawKey of Object.keys(rec)) {
            const canonKey = headerMap[rawKey];
            if (!canonKey)
                continue; // ignore unknown columns
            canon[canonKey] = rec[rawKey] !== undefined ? rec[rawKey].toString().trim() : '';
        }
        rows.push(canon);
    }
    return rows;
}
// --- Validation & Mapping for Beckhoff Tags ---
function validateAndMapBeckhoffRow(row) {
    const errors = [];
    const mapped = {
        name: row.name || null,
        standardType: null,
        dataType: null,
        address: row.address || null,
        defaultValue: row.default_value || null,
        scope: 'global',
        comment: row.comment || '',
        accessMode: row.access_mode || ''
    };
    if (!mapped.name) {
        errors.push('Missing variable name');
    }
    if (row.data_type) {
        const raw = row.data_type.trim();
        const key = raw.toLowerCase().replace(/\s+/g, '_');
        // Prefer canonical normalization if available
        const canonical = DATA_TYPE_NORMALIZE[key] || raw.toUpperCase();
        // Accept any Beckhoff data type; if it's known, map to our standard type, otherwise fallback to DINT
        mapped.dataType = canonical;
        mapped.standardType = BECKHOFF_TO_STANDARD_TYPE[canonical] || 'DINT';
    }
    else {
        errors.push('Missing data type');
    }
    // Set scope based on address or default to global
    if (mapped.address) {
        const addr = mapped.address.trim();
        if (addr.match(/^%I/i)) {
            mapped.scope = 'input';
        }
        else if (addr.match(/^%Q/i)) {
            mapped.scope = 'output';
        }
        // Basic address validation: Beckhoff physical addresses
        // Supports: %I, %Q, %M addresses with various formats, symbolic names
        const validAddressFormats = [
            /^%[IQMT]\d+(\.\d+)?$/i, // %I0.0, %Q2, %M1.5, %T0
            /^%[IQMT][BWDL]\d+$/i, // %IB0, %QW1, %MD200, %ML100
            /^%[IQMT][BWDL]*\d+$/i, // %MW100, %MB400 (memory addresses)
            /^[a-zA-Z_][\w]*$/, // Symbolic names
            /^GVL\.[a-zA-Z_][\w]*$/i, // Global variable list references
            /^MAIN\.[a-zA-Z_][\w]*$/i // Program references
        ];
        const isValidAddress = validAddressFormats.some(pattern => addr.match(pattern));
        if (!isValidAddress) {
            errors.push(`Invalid Beckhoff address format: ${mapped.address}`);
        }
    }
    return { errors, mapped };
}
// Create or update tags in database (upsert functionality)
async function upsertTagsInDB(projectId, userId, tags) {
    for (const tagData of tags) {
        try {
            // Try to find existing tag
            const existingTag = await (0, knex_1.default)('tags')
                .where({ project_id: projectId, name: tagData.name })
                .first();
            if (existingTag) {
                // Update existing tag
                await (0, knex_1.default)('tags')
                    .where({ id: existingTag.id })
                    .update({
                    description: tagData.description,
                    type: tagData.type,
                    data_type: tagData.data_type,
                    address: tagData.address,
                    default_value: tagData.default_value,
                    vendor: tagData.vendor,
                    scope: tagData.scope,
                    tag_type: tagData.tag_type,
                    is_ai_generated: tagData.is_ai_generated,
                    updated_at: new Date().toISOString()
                });
            }
            else {
                // Create new tag
                await (0, knex_1.default)('tags').insert({
                    ...tagData,
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });
            }
        }
        catch (error) {
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
async function importBeckhoffCsv(buffer, projectId, userId) {
    try {
        const rows = parseBeckhoffCsvBuffer(buffer);
        if (!rows || rows.length === 0) {
            throw new Error('No rows parsed from Beckhoff CSV file');
        }
        const validTags = [];
        const errors = [];
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
            let tagType = 'memory';
            if (mapped.address) {
                if (mapped.address.match(/^%I/i)) {
                    tagType = 'input';
                }
                else if (mapped.address.match(/^%Q/i)) {
                    tagType = 'output';
                }
            }
            const tag = {
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
    }
    catch (error) {
        throw new Error(`Failed to import Beckhoff CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
// --- Export Beckhoff CSV ---
// Columns usually required for Beckhoff CSV import: Name, DataType, Address, Comment, InitialValue, Scope, AccessMode
async function exportBeckhoffCsv(projectId, outStream, options = {}) {
    const delimiter = options.delimiter || ',';
    try {
        // Only get Beckhoff tags for this project
        const tags = await (0, knex_1.default)('tags')
            .where({ project_id: projectId, vendor: 'beckhoff' })
            .orderBy('name');
        console.log(`🔧 Exporting Beckhoff CSV for project ${projectId}: Found ${tags.length} Beckhoff tags`);
        tags.forEach((tag) => console.log(`  - ${tag.name} (${tag.vendor})`));
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
    }
    catch (error) {
        throw new Error(`Failed to export Beckhoff CSV: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
// --- Beckhoff XML Import (e.g. TwinCAT ADS XML format) ---
// This is a simplified parser assuming tags under <Variables><Variable>...</Variable></Variables>
// Extend as needed to support more TwinCAT XML features
async function importBeckhoffXml(buffer, projectId, userId) {
    try {
        const xmlStr = buffer.toString('utf8');
        const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
        let parsedXml;
        try {
            parsedXml = await parser.parseStringPromise(xmlStr);
        }
        catch (err) {
            throw new Error('Failed to parse Beckhoff XML: ' + (err instanceof Error ? err.message : 'Unknown error'));
        }
        const variablesNode = parsedXml?.Variables?.Variable;
        if (!variablesNode) {
            throw new Error('No Variables found in Beckhoff XML');
        }
        const varsArray = Array.isArray(variablesNode) ? variablesNode : [variablesNode];
        const validTags = [];
        const errors = [];
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
            const raw = dataTypeRaw.toString().trim();
            const key = raw.toLowerCase().replace(/\s+/g, '_');
            const canonical = DATA_TYPE_NORMALIZE[key] || raw.toUpperCase();
            // Accept any Beckhoff data type. If known, map to a standard type, otherwise fallback to DINT
            const standardType = BECKHOFF_TO_STANDARD_TYPE[canonical] || 'DINT';
            const dtNorm = canonical;
            // Determine tag_type based on address or default to memory
            let tagType = 'memory';
            if (address) {
                if (address.match(/^%I/i)) {
                    tagType = 'input';
                }
                else if (address.match(/^%Q/i)) {
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
                scope: scope,
                tag_type: tagType,
                is_ai_generated: false
            });
        }
        if (errors.length) {
            return { success: false, errors, processed: validTags.length };
        }
        await upsertTagsInDB(projectId, userId, validTags);
        return { success: true, inserted: validTags.length };
    }
    catch (error) {
        throw new Error(`Failed to import Beckhoff XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
// --- Beckhoff XML Export (simplified) ---
async function exportBeckhoffXml(projectId, outStream) {
    try {
        // Only get Beckhoff tags for this project
        const tags = await (0, knex_1.default)('tags')
            .where({ project_id: projectId, vendor: 'beckhoff' })
            .orderBy('name');
        const root = xmlbuilder.create('Variables', { encoding: 'utf-8' });
        for (const tag of tags) {
            const varNode = root.ele('Variable');
            varNode.ele('Name', {}, tag.name);
            varNode.ele('DataType', {}, tag.data_type || 'DINT');
            if (tag.address)
                varNode.ele('PhysicalAddress', {}, tag.address);
            if (tag.description)
                varNode.ele('Comment', {}, tag.description);
            varNode.ele('Scope', {}, tag.scope || 'Global');
        }
        const xmlString = root.end({ pretty: true });
        outStream.write(xmlString);
        outStream.end();
        return true;
    }
    catch (error) {
        throw new Error(`Failed to export Beckhoff XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
// --- XLSX Export Function ---
async function exportBeckhoffXlsx(projectId, outStream) {
    try {
        console.log(`🔄 Starting Beckhoff XLSX export for project ${projectId}`);
        // Fetch tags from the database
        const tags = await (0, knex_1.default)('tags')
            .where({ project_id: projectId, vendor: 'beckhoff' })
            .select('*');
        if (tags.length === 0) {
            console.log('⚠️ No Beckhoff tags found for export');
            // Create an empty workbook
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet([
                ['Name', 'Data Type', 'Address', 'Default Value', 'Description', 'Scope']
            ]);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Beckhoff Tags');
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            outStream.write(buffer);
            outStream.end();
            return true;
        }
        // Prepare data for XLSX
        const worksheetData = [
            // Header row
            ['Name', 'Data Type', 'Address', 'Default Value', 'Description', 'Scope']
        ];
        // Add tag data rows
        for (const tag of tags) {
            worksheetData.push([
                tag.name || '',
                tag.data_type || tag.type || '',
                tag.address || '',
                tag.default_value || '',
                tag.description || '',
                tag.scope || 'global'
            ]);
        }
        // Create workbook and worksheet
        const workbook = XLSX.utils.book_new();
        const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);
        // Add some styling to the header row
        const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:F1');
        for (let col = range.s.c; col <= range.e.c; col++) {
            const cellAddress = XLSX.utils.encode_cell({ r: 0, c: col });
            if (!worksheet[cellAddress])
                continue;
            worksheet[cellAddress].s = {
                font: { bold: true },
                fill: { fgColor: { rgb: 'FFE6E6E6' } }
            };
        }
        // Set column widths
        worksheet['!cols'] = [
            { width: 25 }, // Name
            { width: 15 }, // Data Type
            { width: 20 }, // Address
            { width: 15 }, // Default Value
            { width: 30 }, // Description
            { width: 10 } // Scope
        ];
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Beckhoff Tags');
        // Generate XLSX buffer and write to stream
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        outStream.write(buffer);
        outStream.end();
        console.log(`✅ Successfully exported ${tags.length} Beckhoff tags to XLSX`);
        return true;
    }
    catch (error) {
        throw new Error(`Failed to export Beckhoff XLSX: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
