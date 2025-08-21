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
exports.importRockwellTags = importRockwellTags;
exports.importSiemensTags = importSiemensTags;
exports.importBeckhoffTags = importBeckhoffTags;
const sync_1 = require("csv-parse/sync");
const XLSX = __importStar(require("xlsx"));
const xml2js = __importStar(require("xml2js"));
const vendorFormatters_1 = require("../utils/vendorFormatters");
const knex_1 = __importDefault(require("../db/knex"));
function validateTagRow(tag, vendor) {
    const errors = [];
    if (!tag.name) {
        errors.push('Missing tag name');
    }
    if (!tag.data_type) {
        errors.push('Missing data type');
    }
    // Vendor-specific address format validation — use the central helper so imports match UI validation
    if (tag.address) {
        const ok = (0, vendorFormatters_1.validateAddressForVendor)(tag.address, vendor);
        if (!ok) {
            errors.push(`Invalid ${vendor.charAt(0).toUpperCase() + vendor.slice(1)} address format`);
        }
    }
    else {
        errors.push('Missing address');
    }
    return errors;
}
// Base class for tag importers
class TagImporter {
    constructor(projectId, file) {
        this.projectId = projectId;
        this.file = file;
    }
    mapDataTypeToType(dataType) {
        // Coerce to string safely (handles undefined/null/objects)
        const normalizedType = String(dataType ?? '').toUpperCase();
        if (normalizedType.includes('BOOL'))
            return 'BOOL';
        if (normalizedType.includes('INT'))
            return 'INT';
        if (normalizedType.includes('DINT'))
            return 'DINT';
        if (normalizedType.includes('REAL'))
            return 'REAL';
        if (normalizedType.includes('STRING'))
            return 'STRING';
        return 'DINT'; // Default to DINT for unknown types
    }
}
// Rockwell tag importer
class RockwellTagImporter extends TagImporter {
    async parseFile() {
        const content = this.file.buffer.toString('utf8');
        const records = (0, sync_1.parse)(content, {
            columns: true,
            skip_empty_lines: true
        });
        return records.map((record) => ({
            project_id: this.projectId,
            user_id: '', // Will be set from authenticated user
            name: record['Tag Name'],
            type: this.mapDataTypeToType(record['Data Type']),
            data_type: record['Data Type'],
            scope: record['Scope']?.toLowerCase() || 'local',
            description: record['Description'] || '',
            address: record['Address'],
            default_value: record['Default Value'] || '',
            vendor: 'rockwell',
            tag_type: 'memory',
            is_ai_generated: false
        }));
    }
    validateTags(tags) {
        return tags.map((tag, index) => {
            const errors = validateTagRow(tag, 'rockwell');
            return errors.length > 0 ? { row: index + 1, errors, raw: tag } : null;
        }).filter(Boolean);
    }
}
// Siemens tag importer
class SiemensTagImporter extends TagImporter {
    async parseFile() {
        let records;
        if (this.file.mimetype.includes('spreadsheet')) {
            const workbook = XLSX.read(this.file.buffer);
            const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
            records = XLSX.utils.sheet_to_json(firstSheet);
        }
        else if (this.file.mimetype.includes('xml') || this.file.originalname?.toLowerCase().endsWith('.xml')) {
            // Parse Siemens PLCOpen / TIA Portal XML format
            const parser = new xml2js.Parser();
            const content = this.file.buffer.toString('utf8');
            const parsed = await parser.parseStringPromise(content);
            // Expecting structure: Siemens.TIA.Portal.TagTable -> TagTable -> Tags -> Tag[]
            const tagsNode = parsed?.['Siemens.TIA.Portal.TagTable']?.TagTable?.[0]?.Tags?.[0]?.Tag || parsed?.TagTable?.Tags?.[0]?.Tag || [];
            records = tagsNode.map((t) => ({
                Name: t.Name?.[0] || (typeof t.Name === 'string' ? t.Name : undefined),
                DataType: (Array.isArray(t.DataType) ? t.DataType[0] : (t.DataType && typeof t.DataType === 'object' ? (t.DataType._ || t.DataType) : t.DataType)),
                Address: t.Address?.[0] || (typeof t.Address === 'string' ? t.Address : undefined),
                Comment: t.Comment?.[0] || (typeof t.Comment === 'string' ? t.Comment : undefined),
                InitialValue: t.InitialValue?.[0] || (typeof t.InitialValue === 'string' ? t.InitialValue : undefined),
                Scope: t.Scope?.[0] || (typeof t.Scope === 'string' ? t.Scope : undefined)
            }));
        }
        else {
            const content = this.file.buffer.toString('utf8');
            records = (0, sync_1.parse)(content, {
                columns: true,
                skip_empty_lines: true
            });
        }
        return records.map((record) => ({
            project_id: this.projectId,
            user_id: '', // Will be set from authenticated user
            name: record['Name'] || record['name'] || record.Name || record.nameText,
            type: this.mapDataTypeToType(record['Data Type'] || record['DataType'] || record.DataType || record.data_type),
            data_type: record['Data Type'] || record['DataType'] || record.DataType || record.data_type || '',
            scope: 'global',
            description: record['Comment'] || '',
            address: record['Address'] || record['Address'] || record.address || '',
            default_value: record['Initial Value'] || record['InitialValue'] || record.InitialValue || '',
            vendor: 'siemens',
            tag_type: 'memory',
            is_ai_generated: false
        }));
    }
    validateTags(tags) {
        return tags.map((tag, index) => {
            const errors = validateTagRow(tag, 'siemens');
            return errors.length > 0 ? { row: index + 1, errors, raw: tag } : null;
        }).filter(Boolean);
    }
}
// Beckhoff tag importer
class BeckhoffTagImporter extends TagImporter {
    async parseFile() {
        if (this.file.mimetype.includes('xml')) {
            const parser = new xml2js.Parser();
            const result = await parser.parseStringPromise(this.file.buffer.toString());
            const variables = result.Variables?.Variable || [];
            return variables.map((v) => ({
                project_id: this.projectId,
                user_id: '', // Will be set from authenticated user
                name: v.Name[0],
                type: this.mapDataTypeToType(v.DataType[0]),
                data_type: v.DataType[0],
                scope: v.Scope?.[0]?.toLowerCase() || 'local',
                description: v.Comment?.[0] || '',
                address: v.PhysicalAddress?.[0] || '',
                default_value: v.InitialValue?.[0] || '',
                vendor: 'beckhoff',
                tag_type: 'memory',
                is_ai_generated: false
            }));
        }
        else {
            const content = this.file.buffer.toString('utf8');
            const records = (0, sync_1.parse)(content, {
                columns: true,
                skip_empty_lines: true
            });
            return records.map((record) => ({
                project_id: this.projectId,
                user_id: '', // Will be set from authenticated user
                name: record['Name'],
                type: this.mapDataTypeToType(record['DataType']),
                data_type: record['DataType'],
                scope: record['Scope']?.toLowerCase() || 'local',
                description: record['Comment'] || '',
                address: record['Address'],
                default_value: record['InitialValue'] || '',
                vendor: 'beckhoff',
                tag_type: 'memory',
                is_ai_generated: false
            }));
        }
    }
    validateTags(tags) {
        return tags.map((tag, index) => {
            const errors = validateTagRow(tag, 'beckhoff');
            return errors.length > 0 ? { row: index + 1, errors, raw: tag } : null;
        }).filter(Boolean);
    }
}
// Factory function to create appropriate importer
function createImporter(vendor, projectId, file) {
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
async function importRockwellTags(projectId, file, format, userId) {
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
    const saveErrors = [];
    const savedTags = [];
    for (let i = 0; i < tagsWithUser.length; i++) {
        const tag = tagsWithUser[i];
        try {
            const [created] = await (0, knex_1.default)('tags')
                .insert({
                ...tag,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .returning('*');
            savedTags.push(created);
        }
        catch (error) {
            console.error('Error saving tag:', error);
            const msg = (error && (error.code === '23505' || (error.message && error.message.includes('duplicate key'))))
                ? 'Duplicate tag name'
                : (error && error.message) || 'Failed to save tag';
            saveErrors.push({ row: i + 1, errors: [msg], raw: tag });
            // continue saving remaining tags
        }
    }
    const insertedCount = savedTags.length;
    // Note: Real-time tag sync is disabled for now
    // TODO: Implement tag sync notification if needed
    return {
        success: insertedCount > 0,
        inserted: insertedCount,
        errors: saveErrors.length > 0 ? saveErrors : undefined,
        processed: tags.length
    };
}
async function importSiemensTags(projectId, file, format, userId) {
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
    const saveErrors = [];
    const savedTags = [];
    for (let i = 0; i < tagsWithUser.length; i++) {
        const tag = tagsWithUser[i];
        try {
            const [created] = await (0, knex_1.default)('tags')
                .insert({
                ...tag,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .returning('*');
            savedTags.push(created);
        }
        catch (error) {
            console.error('Error saving tag:', error);
            const msg = (error && (error.code === '23505' || (error.message && error.message.includes('duplicate key'))))
                ? 'Duplicate tag name'
                : (error && error.message) || 'Failed to save tag';
            saveErrors.push({ row: i + 1, errors: [msg], raw: tag });
        }
    }
    const insertedCount = savedTags.length;
    // Note: Real-time tag sync is disabled for now
    // TODO: Implement tag sync notification if needed
    return {
        success: insertedCount > 0,
        inserted: insertedCount,
        errors: saveErrors.length > 0 ? saveErrors : undefined,
        processed: tags.length
    };
}
async function importBeckhoffTags(projectId, file, format, userId) {
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
    const saveErrors = [];
    const savedTags = [];
    for (let i = 0; i < tagsWithUser.length; i++) {
        const tag = tagsWithUser[i];
        try {
            const [created] = await (0, knex_1.default)('tags')
                .insert({
                ...tag,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .returning('*');
            savedTags.push(created);
        }
        catch (error) {
            console.error('Error saving tag:', error);
            const msg = (error && (error.code === '23505' || (error.message && error.message.includes('duplicate key'))))
                ? 'Duplicate tag name'
                : (error && error.message) || 'Failed to save tag';
            saveErrors.push({ row: i + 1, errors: [msg], raw: tag });
        }
    }
    const insertedCount = savedTags.length;
    // Note: Real-time tag sync is disabled for now
    // TODO: Implement tag sync notification if needed
    return {
        success: insertedCount > 0,
        inserted: insertedCount,
        errors: saveErrors.length > 0 ? saveErrors : undefined,
        processed: tags.length
    };
}
