// Test vendor-specific data type validation
// Run with: npx ts-node test-vendor-validation.ts

import fs from 'fs';
import path from 'path';

console.log('🔧 Testing Vendor-Specific Data Type Validation...\n');

// Test data for different scenarios
const testScenarios = [
  {
    name: 'Valid Siemens tag with BOOL',
    vendor: 'siemens',
    type: 'BOOL',
    shouldPass: true
  },
  {
    name: 'Valid Siemens tag with REAL',
    vendor: 'siemens',
    type: 'REAL',
    shouldPass: true
  },
  {
    name: 'Invalid Siemens tag with TIMER',
    vendor: 'siemens',
    type: 'TIMER',
    shouldPass: false
  },
  {
    name: 'Invalid Siemens tag with COUNTER',
    vendor: 'siemens',
    type: 'COUNTER',
    shouldPass: false
  },
  {
    name: 'Valid Rockwell tag with TIMER',
    vendor: 'rockwell',
    type: 'TIMER',
    shouldPass: true
  },
  {
    name: 'Valid Rockwell tag with COUNTER',
    vendor: 'rockwell',
    type: 'COUNTER',
    shouldPass: true
  },
  {
    name: 'Valid Beckhoff tag with TIMER',
    vendor: 'beckhoff',
    type: 'TIMER',
    shouldPass: true
  }
];

// Frontend validation logic (copied from CreateTagModal)
const vendorSupportedTypes = {
  rockwell: ['BOOL', 'INT', 'DINT', 'REAL', 'STRING', 'TIMER', 'COUNTER'],
  siemens: ['BOOL', 'INT', 'DINT', 'REAL', 'STRING'],
  beckhoff: ['BOOL', 'INT', 'DINT', 'REAL', 'STRING', 'TIMER', 'COUNTER']
};

function validateTypeForVendor(type: string, vendor: string): { isValid: boolean; error?: string } {
  const supportedTypes = vendorSupportedTypes[vendor as keyof typeof vendorSupportedTypes] || vendorSupportedTypes.rockwell;
  
  if (!supportedTypes.includes(type)) {
    return {
      isValid: false,
      error: `Data type '${type}' is not supported by ${vendor.charAt(0).toUpperCase() + vendor.slice(1)}. Supported types: ${supportedTypes.join(', ')}`
    };
  }
  
  return { isValid: true };
}

async function runValidationTests() {
  console.log('📋 Running Validation Tests...\n');
  
  let passedTests = 0;
  let failedTests = 0;
  
  for (const scenario of testScenarios) {
    const result = validateTypeForVendor(scenario.type, scenario.vendor);
    const testPassed = result.isValid === scenario.shouldPass;
    
    if (testPassed) {
      console.log(`✅ ${scenario.name}`);
      if (!scenario.shouldPass && result.error) {
        console.log(`   Expected error: ${result.error}`);
      }
      passedTests++;
    } else {
      console.log(`❌ ${scenario.name}`);
      console.log(`   Expected: ${scenario.shouldPass ? 'PASS' : 'FAIL'}`);
      console.log(`   Got: ${result.isValid ? 'PASS' : 'FAIL'}`);
      if (result.error) {
        console.log(`   Error: ${result.error}`);
      }
      failedTests++;
    }
    console.log();
  }
  
  console.log(`📊 Test Results: ${passedTests} passed, ${failedTests} failed\n`);
  
  if (failedTests === 0) {
    console.log('🎉 All validation tests passed!');
  } else {
    console.log('⚠️  Some tests failed. Please review the validation logic.');
  }
}

// Run tests
runValidationTests().catch(console.error);
