"use strict";
// vendorFormatters.ts
// Step 2: Vendor-Specific Address & Syntax Formatters
// Provides standardized tag formatting for Rockwell, Siemens, and Beckhoff vendors
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTagForRockwell = formatTagForRockwell;
exports.generateRockwellAddress = generateRockwellAddress;
exports.formatTagForSiemens = formatTagForSiemens;
exports.generateSiemensAddress = generateSiemensAddress;
exports.formatTagForBeckhoff = formatTagForBeckhoff;
exports.generateBeckhoffAddress = generateBeckhoffAddress;
exports.formatTagForVendor = formatTagForVendor;
exports.validateRockwellAddress = validateRockwellAddress;
exports.validateSiemensAddress = validateSiemensAddress;
exports.validateBeckhoffAddress = validateBeckhoffAddress;
exports.validateAddressForVendor = validateAddressForVendor;
// 1. Rockwell Formatter
/**
 * Format tag for Rockwell PLC systems (Allen-Bradley)
 * Address examples: N7:0 (integer), I:0.0 (input), O:0.0 (output)
 * Data Types: BOOL, INT, DINT, REAL, STRING, etc.
 * Scope affects tag category: Local, Global, Input, Output
 * Naming conventions: PascalCase usually, no spaces or special chars
 * Tags formatted as JSON or L5X XML for export
 */
function formatTagForRockwell(tag) {
    // Validate & format address if missing or inconsistent
    // For simplicity, if address missing, generate placeholder
    const address = tag.address || generateRockwellAddress(tag.scope, tag.dataType);
    // Data type map to strict Rockwell types
    const validTypes = ['BOOL', 'INT', 'DINT', 'REAL', 'STRING'];
    const dataType = validTypes.includes(tag.dataType.toUpperCase())
        ? tag.dataType.toUpperCase()
        : 'DINT';
    return {
        Name: tag.name,
        DataType: dataType,
        Address: address,
        Description: tag.description || '', // could be added later
        Scope: tag.scope || 'Internal',
        DefaultValue: tag.defaultValue || null,
        Vendor: 'Rockwell',
    };
}
/**
 * Generate Rockwell-style address based on scope and type
 */
function generateRockwellAddress(scope, type) {
    // Simplified placeholder example
    if (!scope)
        return null;
    switch (scope.toLowerCase()) {
        case 'input':
            return 'I:0.0';
        case 'output':
            return 'O:0.0';
        case 'global':
            return 'N7:0';
        case 'local':
            return 'L1:0';
        default:
            return null;
    }
}
// 2. Siemens Formatter
/**
 * Format tag for Siemens PLC systems (TIA Portal)
 * Address format examples: DB1.DBD0, I0.0, Q0.0
 * Data types: Bool, Int, DInt, Real, String, etc.
 * Tags are usually exported as CSV or TIA Portal XML format
 * Scope implied via DB (data block), Inputs, Outputs
 */
function formatTagForSiemens(tag) {
    // Map Rockwell-like data types to Siemens types
    const dataTypeMap = {
        BOOL: 'BOOL',
        INT: 'INT',
        DINT: 'DINT',
        REAL: 'REAL',
        STRING: 'STRING',
    };
    const dataType = dataTypeMap[tag.dataType.toUpperCase()] || 'Int';
    const address = tag.address || generateSiemensAddress(tag.scope);
    return {
        TagName: tag.name,
        DataType: dataType,
        Address: address,
        Description: tag.description || '', // optional
        Scope: tag.scope || 'Internal',
        DefaultValue: tag.defaultValue || null,
        Vendor: 'Siemens',
    };
}
/**
 * Generate Siemens-style address based on scope
 */
function generateSiemensAddress(scope) {
    switch ((scope || '').toLowerCase()) {
        case 'input':
            return 'I0.0';
        case 'output':
            return 'Q0.0';
        case 'global':
            return 'DB1.DBD0';
        case 'local':
            return 'L0.0';
        default:
            return null;
    }
}
// 3. Beckhoff Formatter
/**
 * Format tag for Beckhoff PLC systems (TwinCAT)
 * Addresses often use ADS syntax or symbolic addresses (e.g. %I0.0, %Q0.0)
 * Data types similar to Rockwell but can include user-defined types
 * Scope typically Input, Output, Internal (Global/Local)
 */
function formatTagForBeckhoff(tag) {
    const validTypes = ['BOOL', 'INT', 'DINT', 'REAL', 'STRING'];
    const dataType = validTypes.includes(tag.dataType.toUpperCase())
        ? tag.dataType.toUpperCase()
        : 'DINT';
    const address = tag.address || generateBeckhoffAddress(tag.scope);
    return {
        Name: tag.name,
        DataType: dataType,
        Address: address,
        Scope: tag.scope || 'Internal',
        DefaultValue: tag.defaultValue || null,
        Vendor: 'Beckhoff',
    };
}
/**
 * Generate Beckhoff-style address based on scope
 */
function generateBeckhoffAddress(scope) {
    switch ((scope || '').toLowerCase()) {
        case 'input':
            return '%I0.0';
        case 'output':
            return '%Q0.0';
        case 'global':
            return '%M0.0';
        case 'local':
            return '%L0.0';
        case 'memory':
            return '%M0.0';
        default:
            return null;
    }
}
// Utility function to format tag based on vendor type
function formatTagForVendor(tag, vendor) {
    switch (vendor.toLowerCase()) {
        case 'rockwell':
            return formatTagForRockwell({ ...tag, vendor: 'rockwell' });
        case 'siemens':
            return formatTagForSiemens({ ...tag, vendor: 'siemens' });
        case 'beckhoff':
            return formatTagForBeckhoff({ ...tag, vendor: 'beckhoff' });
        default:
            throw new Error(`Unsupported vendor: ${vendor}`);
    }
}
// Validation functions for each vendor
function validateRockwellAddress(address) {
    const rockwellPatterns = [
        /^I:\d+\/\d+$/, // Input: I:1/0
        /^O:\d+\/\d+$/, // Output: O:2/0
        /^N\d+:\d+$/, // Integer: N7:0
        /^F\d+:\d+$/, // Float: F8:0
        /^B\d+:\d+$/, // Binary: B3:0
        // Timers/Counters are intentionally excluded from supported data types
        /^L\d+:\d+$/, // Local: L1:0
        /^[A-Za-z_][A-Za-z0-9_]*$/ // Tag names
    ];
    return rockwellPatterns.some(pattern => pattern.test(address));
}
function validateSiemensAddress(address) {
    const siemensPatterns = [
        /^I\d+\.\d+$/, // Input: I0.0
        /^Q\d+\.\d+$/, // Output: Q0.0
        /^M\d+\.\d+$/, // Memory: M0.0
        /^DB\d+\.DB[BWDX]\d+$/, // Data block: DB1.DBD0, DB1.DBW0, etc.
        /^L\d+\.\d+$/, // Local: L0.0
        /^[A-Za-z_][A-Za-z0-9_]*$/ // Tag names
    ];
    return siemensPatterns.some(pattern => pattern.test(address));
}
function validateBeckhoffAddress(address) {
    const beckhoffPatterns = [
        /^%[IQMT]\d+(\.\d+)?$/, // %I0.0, %Q2, %M1.5, %T0
        /^%[IQMT][BWDL]\d+$/, // %IB0, %QW1, %MD200, %ML100
        /^%[IQMT][BWDL]*\d+$/, // %MW100, %MB400 (memory addresses)
        /^[a-zA-Z_][\w]*$/, // Symbolic names
        /^GVL\.[a-zA-Z_][\w]*$/, // Global variable list references
        /^MAIN\.[a-zA-Z_][\w]*$/, // Program references
        /^%L\d+\.\d+$/ // Local addresses
    ];
    return beckhoffPatterns.some(pattern => pattern.test(address));
}
// Validate address for any vendor
function validateAddressForVendor(address, vendor) {
    switch (vendor.toLowerCase()) {
        case 'rockwell':
            return validateRockwellAddress(address);
        case 'siemens':
            return validateSiemensAddress(address);
        case 'beckhoff':
            return validateBeckhoffAddress(address);
        default:
            return false;
    }
}
