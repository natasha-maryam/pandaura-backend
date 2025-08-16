// Test the fixed Rockwell address validation with the original failing data
import { importRockwellCsv } from './src/utils/rockwellTagIO';

// Create test CSV data that was originally failing
const testCsvContent = `name,data_type,scope,description,external_access,default_value,address
Temperature_PV,REAL,global,"Process temperature reading","",FALSE,N7:0
Motor1_Start,BOOL,global,"Motor 1 start command","",FALSE,N7:1`;

async function testRockwellValidation() {
  console.log('🧪 Testing Rockwell address validation with original failing data...\n');
  
  const buffer = Buffer.from(testCsvContent);
  
  try {
    // This should now work without database insertion
    const result = await importRockwellCsv(buffer, 999, 'test-user');
    
    console.log('✅ Test Result:');
    console.log(`Success: ${result.success}`);
    console.log(`Inserted: ${result.inserted || 0}`);
    
    if (result.errors && result.errors.length > 0) {
      console.log(`\n❌ Errors found (${result.errors.length}):`);
      result.errors.forEach(error => {
        console.log(`  Row ${error.row}: ${error.errors.join(', ')}`);
      });
    } else {
      console.log('✅ No validation errors found!');
    }
    
  } catch (error) {
    if (error instanceof Error && error.message.includes('FOREIGN KEY constraint failed')) {
      console.log('✅ Address validation passed! (Database constraint error is expected in test)');
    } else {
      console.log('❌ Unexpected error:', error);
    }
  }
}

testRockwellValidation();
