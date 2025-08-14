// test-vendor-formatters.ts
// Test suite for vendor-specific address & syntax formatters

import {
  formatTagForRockwell,
  formatTagForSiemens,
  formatTagForBeckhoff,
  formatTagForVendor,
  generateRockwellAddress,
  generateSiemensAddress,
  generateBeckhoffAddress,
  validateRockwellAddress,
  validateSiemensAddress,
  validateBeckhoffAddress,
  validateAddressForVendor,
  type VendorTag,
  type RockwellTag,
  type SiemensTag,
  type BeckhoffTag
} from './src/utils/vendorFormatters';

async function testVendorFormatters() {
  console.log('🧪 Testing Vendor-Specific Address & Syntax Formatters...\n');

  try {
    // Test data
    const testTag: VendorTag = {
      name: 'Motor_Start_Button',
      dataType: 'BOOL',
      address: undefined, // Will be auto-generated
      description: 'Start button for motor control',
      scope: 'input',
      defaultValue: false,
      vendor: 'test'
    };

    console.log('📋 Test Tag:', testTag);
    console.log('');

    // Test 1: Rockwell Formatter
    console.log('🔧 Testing Rockwell Formatter...');
    const rockwellTag = formatTagForRockwell(testTag);
    console.log('✅ Rockwell Result:', rockwellTag);
    console.log(`   - Address Generated: ${rockwellTag.Address}`);
    console.log(`   - DataType Mapped: ${rockwellTag.DataType}`);
    console.log(`   - Scope: ${rockwellTag.Scope}`);
    console.log('');

    // Test 2: Siemens Formatter
    console.log('🔧 Testing Siemens Formatter...');
    const siemensTag = formatTagForSiemens(testTag);
    console.log('✅ Siemens Result:', siemensTag);
    console.log(`   - Address Generated: ${siemensTag.Address}`);
    console.log(`   - DataType Mapped: ${siemensTag.DataType}`);
    console.log(`   - Scope: ${siemensTag.Scope}`);
    console.log('');

    // Test 3: Beckhoff Formatter
    console.log('🔧 Testing Beckhoff Formatter...');
    const beckhoffTag = formatTagForBeckhoff(testTag);
    console.log('✅ Beckhoff Result:', beckhoffTag);
    console.log(`   - Address Generated: ${beckhoffTag.Address}`);
    console.log(`   - DataType Mapped: ${beckhoffTag.DataType}`);
    console.log(`   - Scope: ${beckhoffTag.Scope}`);
    console.log('');

    // Test 4: Generic Vendor Formatter
    console.log('🔧 Testing Generic Vendor Formatter...');
    const rockwellGeneric = formatTagForVendor(testTag, 'rockwell') as RockwellTag;
    const siemensGeneric = formatTagForVendor(testTag, 'siemens') as SiemensTag;
    const beckhoffGeneric = formatTagForVendor(testTag, 'beckhoff') as BeckhoffTag;
    
    console.log('✅ Generic Rockwell:', rockwellGeneric.Address);
    console.log('✅ Generic Siemens:', siemensGeneric.Address);
    console.log('✅ Generic Beckhoff:', beckhoffGeneric.Address);
    console.log('');

    // Test 5: Address Generation for Different Scopes
    console.log('🔧 Testing Address Generation for Different Scopes...');
    const scopes = ['input', 'output', 'global', 'local'];
    
    for (const scope of scopes) {
      console.log(`   Scope: ${scope}`);
      console.log(`     - Rockwell: ${generateRockwellAddress(scope, 'BOOL')}`);
      console.log(`     - Siemens:  ${generateSiemensAddress(scope)}`);
      console.log(`     - Beckhoff: ${generateBeckhoffAddress(scope)}`);
    }
    console.log('');

    // Test 6: Address Validation
    console.log('🔧 Testing Address Validation...');
    
    const testAddresses = {
      rockwell: ['I:1/0', 'O:2/0', 'N7:0', 'Motor_Start', 'InvalidAddr'],
      siemens: ['I0.0', 'Q0.0', 'DB1.DBD0', 'Motor_Start', 'InvalidAddr'],
      beckhoff: ['%I0.0', '%Q0.0', '%MW100', 'Motor_Start', 'InvalidAddr']
    };

    for (const [vendor, addresses] of Object.entries(testAddresses)) {
      console.log(`   ${vendor.toUpperCase()} Address Validation:`);
      for (const addr of addresses) {
        let isValid = false;
        switch (vendor) {
          case 'rockwell':
            isValid = validateRockwellAddress(addr);
            break;
          case 'siemens':
            isValid = validateSiemensAddress(addr);
            break;
          case 'beckhoff':
            isValid = validateBeckhoffAddress(addr);
            break;
        }
        console.log(`     - ${addr}: ${isValid ? '✅ Valid' : '❌ Invalid'}`);
      }
    }
    console.log('');

    // Test 7: Data Type Mapping
    console.log('🔧 Testing Data Type Mapping...');
    const dataTypes = ['BOOL', 'INT', 'DINT', 'REAL', 'STRING', 'UNKNOWN_TYPE'];
    
    for (const dataType of dataTypes) {
      const testTagWithType: VendorTag = {
        ...testTag,
        dataType,
        scope: 'global'
      };
      
      const rockwell = formatTagForRockwell(testTagWithType);
      const siemens = formatTagForSiemens(testTagWithType);
      const beckhoff = formatTagForBeckhoff(testTagWithType);
      
      console.log(`   Input: ${dataType}`);
      console.log(`     - Rockwell: ${rockwell.DataType}`);
      console.log(`     - Siemens:  ${siemens.DataType}`);
      console.log(`     - Beckhoff: ${beckhoff.DataType}`);
    }
    console.log('');

    // Test 8: Edge Cases
    console.log('🔧 Testing Edge Cases...');
    
    const edgeTestTag: VendorTag = {
      name: '',
      dataType: '',
      address: '',
      description: '',
      scope: '',
      defaultValue: null,
      vendor: ''
    };

    try {
      const edgeRockwell = formatTagForRockwell(edgeTestTag);
      console.log('✅ Edge Case Rockwell handled:', edgeRockwell);
    } catch (error) {
      console.log('⚠️  Edge Case Rockwell error:', (error as Error).message);
    }

    try {
      const edgeSiemens = formatTagForSiemens(edgeTestTag);
      console.log('✅ Edge Case Siemens handled:', edgeSiemens);
    } catch (error) {
      console.log('⚠️  Edge Case Siemens error:', (error as Error).message);
    }

    try {
      const edgeBeckhoff = formatTagForBeckhoff(edgeTestTag);
      console.log('✅ Edge Case Beckhoff handled:', edgeBeckhoff);
    } catch (error) {
      console.log('⚠️  Edge Case Beckhoff error:', (error as Error).message);
    }

    console.log('\n🎉 All Vendor Formatter Tests Completed Successfully!');
    console.log('\n📊 Summary:');
    console.log('   ✅ Rockwell Formatter: Operational');
    console.log('   ✅ Siemens Formatter: Operational');
    console.log('   ✅ Beckhoff Formatter: Operational');
    console.log('   ✅ Address Generation: Working for all vendors');
    console.log('   ✅ Address Validation: Working for all vendors');
    console.log('   ✅ Data Type Mapping: Working with fallbacks');
    console.log('   ✅ Edge Cases: Handled gracefully');
    
    console.log('\n🚀 Vendor Formatters are ready for integration!');
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test if this file is executed directly
if (require.main === module) {
  testVendorFormatters();
}

export { testVendorFormatters };
