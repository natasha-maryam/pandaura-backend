"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.importSiemensCsv = importSiemensCsv;
exports.exportSiemensCsv = exportSiemensCsv;
exports.exportSiemensXml = exportSiemensXml;
const csv_parse_1 = require("csv-parse");
const tags_1 = require("../db/tables/tags");
function validateAndMapSiemensRow(row, projectId, userId) {
    const errors = [];
    // Validate required fields
    if (!row.Name)
        errors.push('Tag name is required');
    if (!row.DataType)
        errors.push('Data type is required');
    // Validate name format (Siemens specific)
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(row.Name)) {
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
        'TIME': 'TIME'
    };
    const standardType = dataTypeMap[row.DataType.toUpperCase()];
    if (!standardType) {
        errors.push(`Unsupported Siemens data type: ${row.DataType}`);
    }
    if (errors.length > 0) {
        return { errors };
    }
    // Map to internal tag format
    const mapped = {
        project_id: projectId,
        user_id: userId,
        name: row.Name,
        description: row.Comment || '',
        type: standardType,
        data_type: row.DataType,
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
        const parser = (0, csv_parse_1.parse)({
            delimiter: ',',
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
                    await tags_1.TagsTable.createTag(tag);
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
        const { tags } = await tags_1.TagsTable.getTags({ project_id: projectId, vendor: 'siemens' });
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
        const { tags } = await tags_1.TagsTable.getTags({ project_id: projectId, vendor: 'siemens' });
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
