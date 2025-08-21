"use strict";
// rockwellTagIO.ts
// Plug-and-play Rockwell CSV / L5X / XLSX import-export for Pandaura AS
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
exports.importRockwellCsv = importRockwellCsv;
exports.exportRockwellCsv = exportRockwellCsv;
exports.importRockwellL5X = importRockwellL5X;
exports.exportRockwellL5X = exportRockwellL5X;
exports.exportRockwellXlsx = exportRockwellXlsx;
const sync_1 = require("csv-parse/sync");
const fastCsv = __importStar(require("fast-csv"));
const xml2js = __importStar(require("xml2js"));
const xmlbuilder = __importStar(require("xmlbuilder"));
const XLSX = __importStar(require("xlsx"));
const knex_1 = __importDefault(require("../db/knex"));
// Rockwell tag CSV headers mapping & normalization
const HEADER_MAP = {
    'tagname': 'name',
    'name': 'name',
    'tag name': 'name',
    'data_type': 'data_type', // Add exact match for data_type
    'datatype': 'data_type',
    'data type': 'data_type',
    'type': 'data_type',
    'scope': 'scope',
    'description': 'description',
    'comment': 'description',
    'address': 'address',
    'external_access': 'external_access',
    'external access': 'external_access',
    'default_value': 'default_value',
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
const ROCKWELL_TO_STANDARD_TYPE = {
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
const DATA_TYPE_NORMALIZE = {
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
// Utility: normalize header row to canonical keys
function normalizeHeaders(rawHeaders) {
    return rawHeaders.map(h => {
        if (!h)
            return null;
        const clean = h.toString().trim().toLowerCase();
        return HEADER_MAP[clean] || null;
    });
}
// Parse Rockwell CSV buffer into canonical rows
function parseRockwellCsvBuffer(buffer) {
    const text = buffer.toString('utf8');
    const records = (0, sync_1.parse)(text, {
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
// Validate and map a single Rockwell CSV row to internal tag model
function validateAndMapRockwellRow(row, projectId, userId) {
    const errors = [];
    if (!row.name) {
        errors.push('Missing tag name');
    }
    if (!row.data_type) {
        errors.push('Missing data type');
    }
    else {
        const dtRaw = row.data_type.trim().toUpperCase();
        const dtNorm = DATA_TYPE_NORMALIZE[dtRaw];
        if (!dtNorm || !ROCKWELL_TYPES.has(dtNorm)) {
            errors.push(`Unsupported Rockwell data type: ${row.data_type}`);
        }
    }
    // Rockwell address validation: supports I:x/y, O:x/y, Nxx:y, Fxx:y, and symbolic names
    if (row.address) {
        const addr = row.address.trim();
        const rockwellPatterns = [
            /^I:\d+\/\d+$/i, // Input: I:1/0
            /^O:\d+\/\d+$/i, // Output: O:2/0  
            /^N\d+:\d+$/i, // Integer: N7:0
            /^F\d+:\d+$/i, // Float: F8:0
            /^B\d+:\d+$/i, // Binary: B3:0
            // Timer/Counter address formats intentionally excluded (not supported types)
            /^R\d+:\d+$/i, // Control: R6:0
            /^S\d+:\d+$/i, // String: S2:0
            /^[A-Za-z_][A-Za-z0-9_]*$/ // Symbolic: MyTag_1
        ];
        const isValidAddress = rockwellPatterns.some(pattern => pattern.test(addr));
        if (!isValidAddress) {
            errors.push(`Invalid Rockwell address format: ${row.address}. Expected formats: I:x/y, O:x/y, Nx:y, Fx:y, or symbolic name`);
        }
    }
    if (errors.length > 0) {
        return { errors, mapped: null };
    }
    const dataType = row.data_type.trim().toUpperCase();
    const standardType = ROCKWELL_TO_STANDARD_TYPE[dataType] || 'STRING';
    const mapped = {
        project_id: projectId,
        user_id: userId,
        name: row.name,
        description: row.description || '',
        type: standardType,
        data_type: dataType,
        address: row.address || '',
        default_value: row.default_value || '',
        vendor: 'rockwell',
        scope: row.scope?.toLowerCase() || 'global',
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
async function importRockwellCsv(buffer, projectId, userId) {
    const rows = parseRockwellCsvBuffer(buffer);
    if (!rows || rows.length === 0) {
        throw new Error('No rows parsed from Rockwell CSV file');
    }
    const validTags = [];
    const errors = [];
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
        await (0, knex_1.default)('tags').insert({
            ...tag,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
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
async function exportRockwellCsv(projectId, outStream, options = {}) {
    const delimiter = options.delimiter || ',';
    // Only get Rockwell tags for this project
    const tags = await (0, knex_1.default)('tags')
        .where({ project_id: projectId, vendor: 'rockwell' })
        .orderBy('name');
    console.log(`🚀 Exporting Rockwell CSV for project ${projectId}: Found ${tags.length} Rockwell tags`);
    tags.forEach((tag) => console.log(`  - ${tag.name} (${tag.vendor})`));
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
async function importRockwellL5X(buffer, projectId, userId) {
    const xmlStr = buffer.toString('utf8');
    const parser = new xml2js.Parser({ explicitArray: false, mergeAttrs: true });
    let parsedXml;
    try {
        parsedXml = await parser.parseStringPromise(xmlStr);
    }
    catch (err) {
        throw new Error('Failed to parse L5X XML: ' + err.message);
    }
    // Navigate XML: Root > ControllerTags > Tag (array or single)
    const tagsNode = parsedXml?.ControllerTags?.Tag;
    if (!tagsNode) {
        throw new Error('No Tags found in L5X XML');
    }
    // Tags can be array or single object
    const tagsArray = Array.isArray(tagsNode) ? tagsNode : [tagsNode];
    const validTags = [];
    const errors = [];
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
        const tag = {
            project_id: projectId,
            user_id: userId,
            name,
            description,
            type: standardType,
            data_type: dataType.toUpperCase(),
            address: '', // L5X typically doesn't include physical addresses
            default_value: '',
            vendor: 'rockwell',
            scope: scope.toLowerCase(),
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
        await (0, knex_1.default)('tags').insert({
            ...tag,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
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
async function exportRockwellL5X(projectId, outStream) {
    // Only get Rockwell tags for this project
    const tags = await (0, knex_1.default)('tags')
        .where({ project_id: projectId, vendor: 'rockwell' })
        .orderBy('name');
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
// --- XLSX Export Function ---
async function exportRockwellXlsx(projectId, outStream) {
    try {
        console.log(`🔄 Starting Rockwell XLSX export for project ${projectId}`);
        // Fetch tags from the database
        const tags = await (0, knex_1.default)('tags')
            .where({ project_id: projectId, vendor: 'rockwell' })
            .select('*');
        if (tags.length === 0) {
            console.log('⚠️ No Rockwell tags found for export');
            // Create an empty workbook
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet([
                ['Tag Name', 'Data Type', 'Address', 'Default Value', 'Description', 'Scope']
            ]);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Rockwell Tags');
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            outStream.write(buffer);
            outStream.end();
            return true;
        }
        // Prepare data for XLSX
        const worksheetData = [
            // Header row (matching Studio 5000 format)
            ['Tag Name', 'Data Type', 'Address', 'Default Value', 'Description', 'Scope']
        ];
        // Add tag data rows
        for (const tag of tags) {
            worksheetData.push([
                tag.name || '',
                tag.data_type || tag.type || 'DINT',
                tag.address || '',
                tag.default_value || '',
                tag.description || '',
                tag.scope || 'Global'
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
            { width: 25 }, // Tag Name
            { width: 15 }, // Data Type
            { width: 20 }, // Address
            { width: 15 }, // Default Value
            { width: 30 }, // Description
            { width: 12 } // Scope
        ];
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Rockwell Tags');
        // Generate XLSX buffer and write to stream
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        outStream.write(buffer);
        outStream.end();
        console.log(`✅ Successfully exported ${tags.length} Rockwell tags to XLSX`);
        return true;
    }
    catch (error) {
        throw new Error(`Failed to export Rockwell XLSX: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
