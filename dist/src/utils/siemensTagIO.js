"use strict";
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
exports.importSiemensCsv = importSiemensCsv;
exports.exportSiemensCsv = exportSiemensCsv;
exports.exportSiemensXml = exportSiemensXml;
exports.exportSiemensXlsx = exportSiemensXlsx;
const csv_parse_1 = require("csv-parse");
const XLSX = __importStar(require("xlsx"));
const knex_1 = __importDefault(require("../db/knex"));
function validateAndMapSiemensRow(row, projectId, userId) {
    const errors = [];
    // Validate required fields
    if (!row.Name || row.Name.trim() === '')
        errors.push('Tag name is required');
    // Validate name format (Siemens specific)
    if (row.Name && !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(row.Name.trim())) {
        errors.push('Invalid tag name format for Siemens. Must start with letter or underscore, followed by letters, numbers, or underscores');
    }
    // Map Siemens data types to standard types
    const dataTypeMap = {
        'BOOL': 'BOOL',
        'INT': 'INT',
        'DINT': 'DINT',
        'REAL': 'REAL',
        'STRING': 'STRING',
        'WORD': 'WORD',
        'DWORD': 'DWORD',
        'TIME': 'DINT'
    };
    // Try to determine data type
    let standardType;
    let finalDataType;
    if (row.DataType && row.DataType.trim() !== '') {
        // Use provided data type
        finalDataType = row.DataType.trim();
        standardType = dataTypeMap[finalDataType.toUpperCase()];
        if (!standardType) {
            errors.push(`Unsupported Siemens data type: ${finalDataType}`);
        }
    }
    else {
        // Try to infer data type from initial value
        const initialValue = row.InitialValue?.trim() || '';
        if (initialValue.toLowerCase() === 'true' || initialValue.toLowerCase() === 'false' ||
            initialValue.toLowerCase() === 'falsse' || initialValue === '1' || initialValue === '0') {
            finalDataType = 'BOOL';
            standardType = 'BOOL';
        }
        else if (!isNaN(Number(initialValue)) && !initialValue.includes('.')) {
            finalDataType = 'DINT';
            standardType = 'DINT';
        }
        else if (!isNaN(Number(initialValue)) && initialValue.includes('.')) {
            finalDataType = 'REAL';
            standardType = 'REAL';
        }
        else {
            // Default to DINT for memory tags, BOOL for I/O
            const address = row.Address?.toLowerCase() || '';
            if (address.startsWith('i') || address.startsWith('q') || address.startsWith('e') || address.startsWith('a')) {
                finalDataType = 'BOOL';
                standardType = 'BOOL';
            }
            else {
                finalDataType = 'DINT';
                standardType = 'DINT';
            }
        }
    }
    if (errors.length > 0) {
        return { errors };
    }
    // Map to internal tag format (only if validation passed)
    const mapped = {
        project_id: projectId,
        user_id: userId,
        name: row.Name.trim(),
        description: row.Comment || '',
        type: standardType,
        data_type: finalDataType,
        address: row.Address || '',
        default_value: row.InitialValue,
        vendor: 'siemens',
        scope: (row.Scope || 'global'),
        tag_type: determineTagType(row.Address),
        is_ai_generated: false
    };
    return { errors: [], mapped };
}
function determineTagType(address) {
    if (!address)
        return 'memory';
    const lowerAddress = address.toLowerCase();
    if (lowerAddress.startsWith('i') || lowerAddress.startsWith('e'))
        return 'input';
    if (lowerAddress.startsWith('q') || lowerAddress.startsWith('a'))
        return 'output';
    if (lowerAddress.startsWith('m'))
        return 'memory';
    if (lowerAddress.startsWith('t'))
        return 'temp';
    return 'memory';
}
async function importSiemensCsv(buffer, projectId, userId) {
    return new Promise((resolve, reject) => {
        const rows = [];
        // Auto-detect delimiter by checking the first line
        const content = buffer.toString('utf8');
        const firstLine = content.split('\n')[0];
        const delimiter = firstLine.includes(';') ? ';' : ',';
        const parser = (0, csv_parse_1.parse)({
            delimiter: delimiter,
            columns: true,
            skip_empty_lines: true
        });
        parser.on('readable', () => {
            let row;
            while ((row = parser.read()) !== null) {
                rows.push(row);
            }
        });
        parser.on('error', (err) => {
            reject(new Error(`Failed to parse Siemens CSV: ${err.message}`));
        });
        parser.on('end', async () => {
            try {
                if (rows.length === 0) {
                    throw new Error('No rows parsed from Siemens CSV file');
                }
                const validTags = [];
                const errors = [];
                for (let i = 0; i < rows.length; i++) {
                    const { errors: rowErrors, mapped } = validateAndMapSiemensRow(rows[i], projectId, userId);
                    if (rowErrors.length > 0) {
                        errors.push({ row: i + 1, errors: rowErrors, raw: rows[i] });
                        continue;
                    }
                    if (mapped) {
                        validTags.push(mapped);
                    }
                }
                if (errors.length > 0) {
                    resolve({ success: false, errors, inserted: validTags.length });
                    return;
                }
                // Insert valid tags
                for (const tag of validTags) {
                    await (0, knex_1.default)('tags').insert({
                        ...tag,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    });
                }
                resolve({ success: true, inserted: validTags.length });
            }
            catch (error) {
                reject(error);
            }
        });
        parser.write(buffer);
        parser.end();
    });
}
async function exportSiemensCsv(projectId, outStream, options = {}) {
    try {
        const delimiter = options.delimiter || ',';
        const headers = [
            'Name',
            'DataType',
            'Address',
            'Comment',
            'InitialValue',
            'Scope'
        ].join(delimiter) + '\n';
        outStream.write(headers);
        // Get all Siemens tags for the project
        const tags = await (0, knex_1.default)('tags')
            .where({ project_id: projectId, vendor: 'siemens' })
            .orderBy('name');
        for (const tag of tags) {
            // Format tag for Siemens
            const siemensTag = {
                Name: tag.name,
                DataType: tag.data_type,
                Address: tag.address || '',
                Comment: tag.description || '',
                InitialValue: tag.default_value || '',
                Scope: tag.scope || ''
            };
            const row = [
                siemensTag.Name,
                siemensTag.DataType,
                siemensTag.Address,
                siemensTag.Comment,
                siemensTag.InitialValue,
                siemensTag.Scope
            ].join(delimiter) + '\n';
            outStream.write(row);
        }
        // Close the stream to signal completion
        outStream.end();
        return true;
    }
    catch (error) {
        console.error('Error exporting Siemens CSV:', error);
        throw error;
    }
}
async function exportSiemensXml(projectId, outStream) {
    try {
        const xmlBuilder = require('xmlbuilder');
        // Get all Siemens tags for the project
        const tags = await (0, knex_1.default)('tags')
            .where({ project_id: projectId, vendor: 'siemens' })
            .orderBy('name');
        // Create XML structure
        const xml = xmlBuilder.create('Siemens.TIA.Portal.TagTable', { version: '1.0', encoding: 'UTF-8' });
        xml.att('Version', '1.0');
        const tagTable = xml.ele('TagTable');
        tagTable.ele('Name').txt(`Project_${projectId}_Tags`);
        const tagsElement = tagTable.ele('Tags');
        for (const tag of tags) {
            // Format tag for Siemens
            const siemensTag = {
                Name: tag.name,
                DataType: tag.data_type,
                Address: tag.address || '',
                Comment: tag.description || '',
                InitialValue: tag.default_value || '',
                Scope: tag.scope || ''
            };
            const tagElement = tagsElement.ele('Tag');
            tagElement.ele('Name').txt(siemensTag.Name);
            tagElement.ele('DataType').txt(siemensTag.DataType);
            if (siemensTag.Address)
                tagElement.ele('Address').txt(siemensTag.Address);
            if (siemensTag.Comment)
                tagElement.ele('Comment').txt(siemensTag.Comment);
            if (siemensTag.InitialValue)
                tagElement.ele('InitialValue').txt(siemensTag.InitialValue);
            if (siemensTag.Scope)
                tagElement.ele('Scope').txt(siemensTag.Scope);
        }
        // Write XML to stream and close it
        outStream.write(xml.end({ pretty: true }));
        outStream.end();
        return true;
    }
    catch (error) {
        console.error('Error exporting Siemens XML:', error);
        throw error;
    }
}
// --- XLSX Export Function ---
async function exportSiemensXlsx(projectId, outStream) {
    try {
        console.log(`🔄 Starting Siemens XLSX export for project ${projectId}`);
        // Fetch tags from the database
        const tags = await (0, knex_1.default)('tags')
            .where({ project_id: projectId, vendor: 'siemens' })
            .select('*');
        if (tags.length === 0) {
            console.log('⚠️ No Siemens tags found for export');
            // Create an empty workbook
            const workbook = XLSX.utils.book_new();
            const worksheet = XLSX.utils.aoa_to_sheet([
                ['Name', 'Data Type', 'Address', 'Initial Value', 'Comment', 'Scope']
            ]);
            XLSX.utils.book_append_sheet(workbook, worksheet, 'Siemens Tags');
            const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
            outStream.write(buffer);
            outStream.end();
            return true;
        }
        // Prepare data for XLSX
        const worksheetData = [
            // Header row
            ['Name', 'Data Type', 'Address', 'Initial Value', 'Comment', 'Scope']
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
            { width: 15 }, // Initial Value
            { width: 30 }, // Comment
            { width: 10 } // Scope
        ];
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Siemens Tags');
        // Generate XLSX buffer and write to stream
        const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
        outStream.write(buffer);
        outStream.end();
        console.log(`✅ Successfully exported ${tags.length} Siemens tags to XLSX`);
        return true;
    }
    catch (error) {
        throw new Error(`Failed to export Siemens XLSX: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}
