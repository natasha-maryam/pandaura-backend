// ST (Structured Text) Parser for PLC Variable Declarations
// Parses structured text code and extracts variable declarations with metadata

export interface ParsedVariable {
  name: string;
  type: string;
  dataType: string;
  address?: string;
  defaultValue?: string | number | boolean;
  scope?: string;
  description?: string;
  vendor?: string;
  line?: number;
}

/**
 * Parse ST variable declarations from code
 * Supports standard IEC 61131-3 structured text format
 */
export function parseSTVariablesDetailed(stCode: string, vendor?: string): ParsedVariable[] {
  const variables: ParsedVariable[] = [];
  const lines = stCode.split('\n');
  let currentScope = 'Global';
  let inVarBlock = false;
  let varBlockType = 'VAR';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const lineNumber = i + 1;

    // Skip empty lines and full line comments
    if (!line || line.startsWith('//') || line.startsWith('(*') || line.startsWith('*')) {
      continue;
    }

    // Detect VAR blocks and their types
    if (line.match(/^VAR(_INPUT|_OUTPUT|_IN_OUT|_GLOBAL|_LOCAL)?/i)) {
      inVarBlock = true;
      const varMatch = line.match(/^VAR(_INPUT|_OUTPUT|_IN_OUT|_GLOBAL|_LOCAL)?/i);
      if (varMatch && varMatch[1]) {
        varBlockType = varMatch[1].substring(1); // Remove the underscore
        currentScope = mapVarBlockToScope(varBlockType);
      } else {
        varBlockType = 'VAR';
        currentScope = 'Local';
      }
      continue;
    }

    // End of VAR block
    if (line.match(/^END_VAR/i)) {
      inVarBlock = false;
      currentScope = 'Global';
      continue;
    }

    // Parse variable declarations within VAR blocks
    if (inVarBlock) {
      const variable = parseVariableLine(line, currentScope, vendor, lineNumber);
      if (variable) {
        variables.push(variable);
      }
    }

    // Also parse inline variable declarations (outside VAR blocks)
    if (!inVarBlock) {
      // Look for variable declarations in assignment statements
      const inlineVariable = parseInlineVariable(line, currentScope, vendor, lineNumber);
      if (inlineVariable) {
        variables.push(inlineVariable);
      }
    }
  }

  return variables;
}

/**
 * Parse a single variable declaration line
 */
function parseVariableLine(line: string, scope: string, vendor?: string, lineNumber?: number): ParsedVariable | null {
  // Remove inline comments
  const cleanLine = line.split('//')[0].trim();
  if (!cleanLine) return null;

  // Pattern for: VariableName : DataType [:= DefaultValue]; [// comment]
  const varPattern = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*([a-zA-Z_][a-zA-Z0-9_]*(?:\([^)]*\))?)\s*(?::=\s*([^;]+))?\s*;?\s*(?:\/\/\s*(.*))?$/;
  const match = cleanLine.match(varPattern);

  if (!match) return null;

  const [, name, rawDataType, defaultValue, comment] = match;

  // Normalize data type to uppercase to match database constraints
  const dataType = rawDataType.trim().toUpperCase();
  console.log(`🔍 ST Parser: Raw data type: "${rawDataType}" → Normalized: "${dataType}"`);

  // Extract address and description from comment if present
  let address: string | undefined;
  let description: string | undefined;

  if (comment) {
    // Look for address pattern in comment
    const addressMatch = comment.match(/address\s*=\s*([^\s,]+)/i);
    if (addressMatch) {
      address = addressMatch[1];
    }

    // Extract description (remaining comment after address)
    description = comment
      .replace(/address\s*=\s*[^\s,]+/i, '')
      .replace(/scope\s*=\s*[^\s,]+/i, '')
      .trim();
  }

  return {
    name: name.trim(),
    type: 'variable',
    dataType: dataType.trim(),
    address,
    defaultValue: parseDefaultValue(defaultValue),
    scope,
    description: description || undefined,
    vendor: vendor?.toLowerCase(),
    line: lineNumber
  };
}

/**
 * Parse inline variable declarations from assignment statements
 */
function parseInlineVariable(line: string, scope: string, vendor?: string, lineNumber?: number): ParsedVariable | null {
  // Look for patterns like: VARIABLE_NAME := VALUE; where VARIABLE_NAME suggests it's a new variable
  const assignmentPattern = /^([A-Z_][A-Z0-9_]*)\s*:=\s*([^;]+);?\s*(?:\/\/\s*(.*))?$/;
  const match = line.match(assignmentPattern);

  if (!match) return null;

  const [, name, value, comment] = match;
  
  // Infer data type from value and normalize it
  const dataType = normalizeDataType(inferDataTypeFromValue(value.trim()));
  
  let address: string | undefined;
  let description: string | undefined;

  if (comment) {
    const addressMatch = comment.match(/address\s*=\s*([^\s,]+)/i);
    if (addressMatch) {
      address = addressMatch[1];
    }
    description = comment
      .replace(/address\s*=\s*[^\s,]+/i, '')
      .trim();
  }

  return {
    name: name.trim(),
    type: 'variable',
    dataType,
    address,
    defaultValue: parseDefaultValue(value.trim()),
    scope,
    description: description || undefined,
    vendor: vendor?.toLowerCase(),
    line: lineNumber
  };
}

/**
 * Map VAR block type to scope
 */
function mapVarBlockToScope(varBlockType: string): string {
  switch (varBlockType.toUpperCase()) {
    case 'INPUT':
      return 'Input';
    case 'OUTPUT':
      return 'Output';
    case 'IN_OUT':
      return 'InOut';
    case 'GLOBAL':
      return 'Global';
    case 'LOCAL':
      return 'Local';
    default:
      return 'Local';
  }
}

/**
 * Parse default value and convert to appropriate type
 */
function parseDefaultValue(value?: string): string | number | boolean | undefined {
  if (!value) return undefined;

  const trimmedValue = value.trim();

  // Boolean values
  if (trimmedValue.toUpperCase() === 'TRUE') return true;
  if (trimmedValue.toUpperCase() === 'FALSE') return false;

  // Numeric values
  if (/^-?\d+$/.test(trimmedValue)) {
    return parseInt(trimmedValue, 10);
  }
  if (/^-?\d*\.\d+$/.test(trimmedValue)) {
    return parseFloat(trimmedValue);
  }

  // String values (remove quotes)
  if ((trimmedValue.startsWith("'") && trimmedValue.endsWith("'")) ||
      (trimmedValue.startsWith('"') && trimmedValue.endsWith('"'))) {
    return trimmedValue.slice(1, -1);
  }

  // Return as string for everything else
  return trimmedValue;
}

/**
 * Normalize data type to match database constraints
 */
function normalizeDataType(dataType: string): string {
  const normalized = dataType.toUpperCase();

  // Map common variations to standard types
  const typeMap: Record<string, string> = {
    'BOOL': 'BOOL',
    'BOOLEAN': 'BOOL',
    'BIT': 'BOOL',
    'INT': 'INT',
    'INTEGER': 'INT',
    'DINT': 'DINT',
    'DOUBLE_INT': 'DINT',
    'REAL': 'REAL',
    'FLOAT': 'REAL',
    'STRING': 'STRING'
  };

  return typeMap[normalized] || normalized;
}

/**
 * Infer data type from value
 */
function inferDataTypeFromValue(value: string): string {
  const trimmedValue = value.trim();

  if (trimmedValue.toUpperCase() === 'TRUE' || trimmedValue.toUpperCase() === 'FALSE') {
    return 'BOOL';
  }

  if (/^-?\d+$/.test(trimmedValue)) {
    const num = parseInt(trimmedValue, 10);
    if (num >= -32768 && num <= 32767) {
      return 'INT';
    } else {
      return 'DINT';
    }
  }

  if (/^-?\d*\.\d+$/.test(trimmedValue)) {
    return 'REAL';
  }

  if ((trimmedValue.startsWith("'") && trimmedValue.endsWith("'")) ||
      (trimmedValue.startsWith('"') && trimmedValue.endsWith('"'))) {
    return 'STRING';
  }

  // Default to DINT for unknown
  return 'DINT';
}

/**
 * Simple function to extract all variables from ST code (backward compatibility)
 */
export function parseSTVariables(stCode: string): ParsedVariable[] {
  return parseSTVariablesDetailed(stCode);
}
