// test-rockwell-address-validation.ts
// Quick test to verify Rockwell address validation is working correctly

// Import the parsing and validation functions directly instead of the full import function
import { parse } from 'csv-parse/sync';

// Copy the relevant validation code locally for testing
const ROCKWELL_TYPES = new Set([
  'BOOL', 'SINT', 'INT', 'DINT', 'REAL', 'LINT', 'STRING', 
  'WORD', 'DWORD', 'LWORD', 'BYTE', 'CHAR', 'ENUM', 'STRUCT'
]);

const DATA_TYPE_NORMALIZE: Record<string, string> = {
  'BOOL': 'BOOL',
  'SINT': 'SINT',
  'INT': 'INT',
  'DINT': 'DINT',
  'REAL': 'REAL',
  'LINT': 'LINT',
  'STRING': 'STRING'
};

const HEADER_MAP: Record<string, string> = {
  'tagname': 'name',
  'name': 'name',
  'tag name': 'name',
  'data_type': 'data_type',
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
  'symbol': 'name',
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

function normalizeHeaders(rawHeaders: string[]): (string | null)[] {
  return rawHeaders.map(h => {
    if (!h) return null;
    const clean = h.toString().trim().toLowerCase();
    return HEADER_MAP[clean] || null;
  });
}

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

  const rawHeaders = Object.keys(records[0]);
  const normalized = normalizeHeaders(rawHeaders);
  const headerMap: Record<string, string | null> = {};
  rawHeaders.forEach((raw, idx) => {
    headerMap[raw] = normalized[idx];
  });

  const rows: ParsedRockwellRow[] = [];
  for (const rec of records) {
    const canon: ParsedRockwellRow = {};
    for (const rawKey of Object.keys(rec)) {
      const canonKey = headerMap[rawKey];
      if (!canonKey) continue;
      (canon as any)[canonKey] = rec[rawKey] !== undefined ? rec[rawKey].toString().trim() : '';
    }
    rows.push(canon);
  }

  return rows;
}

function validateRockwellRow(row: ParsedRockwellRow): { errors: string[]; isValid: boolean } {
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

  // Test the improved address validation
  if (row.address) {
    const addr = row.address.trim();
    const rockwellPatterns = [
      /^I:\d+\/\d+$/i,           // Input: I:1/0
      /^O:\d+\/\d+$/i,           // Output: O:2/0  
      /^N\d+:\d+$/i,             // Integer: N7:0
      /^F\d+:\d+$/i,             // Float: F8:0
      /^B\d+:\d+$/i,             // Binary: B3:0
      /^T\d+:\d+$/i,             // Timer: T4:0
      /^C\d+:\d+$/i,             // Counter: C5:0
      /^R\d+:\d+$/i,             // Control: R6:0
      /^S\d+:\d+$/i,             // String: S2:0
      /^[A-Za-z_][A-Za-z0-9_]*$/ // Symbolic: MyTag_1
    ];
    
    const isValidAddress = rockwellPatterns.some(pattern => pattern.test(addr));
    if (!isValidAddress) {
      errors.push(`Invalid Rockwell address format: ${row.address}. Expected formats: I:x/y, O:x/y, Nx:y, Fx:y, or symbolic name`);
    }
  }

  return { errors, isValid: errors.length === 0 };
}

// Create a test CSV buffer with the addresses that were failing
const testCsvContent = `name,data_type,scope,description,external_access,default_value,address
Temperature_PV,REAL,global,Process temperature reading,,FALSE,N7:0
Motor1_Start,BOOL,global,Motor 1 start command,,FALSE,N7:1
Input_Sensor,BOOL,global,Input sensor status,,FALSE,I:1/0
Output_Valve,BOOL,global,Output valve control,,FALSE,O:2/0
Float_Value,REAL,global,Float measurement,,0.0,F8:0
Symbolic_Tag,DINT,global,Symbolic tag example,,0,MyTag_1
Bad_Address1,BOOL,global,Invalid address test 1,,FALSE,%I0.0
Bad_Address2,BOOL,global,Invalid address test 2,,FALSE,123:456
Bad_Address3,BOOL,global,Invalid address test 3,,FALSE,X:Y/Z`;

async function testRockwellValidation() {
  console.log('🧪 Testing Rockwell address validation...\n');
  
  const buffer = Buffer.from(testCsvContent, 'utf8');
  
  console.log('📝 Test CSV content:');
  console.log(testCsvContent);
  console.log('\n📊 Testing address validation...');
  
  try {
    const rows = parseRockwellCsvBuffer(buffer);
    
    console.log(`\n✅ Parsed ${rows.length} rows from CSV`);
    
    let validCount = 0;
    const errors: any[] = [];
    
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const { errors: rowErrors, isValid } = validateRockwellRow(row);
      
      console.log(`\n🔍 Row ${i + 1}: ${row.name} (${row.data_type}) @ ${row.address}`);
      
      if (isValid) {
        console.log(`  ✅ Valid!`);
        validCount++;
      } else {
        console.log(`  ❌ Errors: ${rowErrors.join(', ')}`);
        errors.push({ row: i + 1, errors: rowErrors, raw: row });
      }
    }
    
    console.log(`\n� Summary:`);
    console.log(`  ✅ Valid tags: ${validCount}/${rows.length}`);
    console.log(`  ❌ Invalid tags: ${errors.length}/${rows.length}`);
    
    if (errors.length > 0) {
      console.log('\n❌ Validation errors:');
      errors.forEach((error) => {
        console.log(`  Row ${error.row}: ${error.errors.join(', ')}`);
      });
    } else {
      console.log('\n🎉 All addresses are now valid!');
    }
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

testRockwellValidation();
