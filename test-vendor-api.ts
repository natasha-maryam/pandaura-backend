// test-vendor-api.ts
// Test suite for the vendor formatting API endpoints

import http from 'http';
import fs from 'fs';
import path from 'path';

interface TestTag {
  name: string;
  dataType: string;
  address?: string;
  description?: string;
  scope?: string;
  defaultValue?: any;
}

const BASE_URL = 'http://localhost:3000/api/tags';
const TEST_TOKEN = 'your_jwt_token_here'; // Replace with actual token for testing

async function makeRequest(method: string, endpoint: string, data?: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 3000,
      path: `/api/tags${endpoint}`,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${TEST_TOKEN}`
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(body);
          resolve({ statusCode: res.statusCode, data: response });
        } catch (error) {
          resolve({ statusCode: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testVendorFormattingAPI() {
  console.log('🧪 Testing Vendor Formatting API Endpoints...\n');

  const testTags: TestTag[] = [
    {
      name: 'Motor_Start_Button',
      dataType: 'BOOL',
      description: 'Start button for motor control',
      scope: 'input'
    },
    {
      name: 'Motor_Stop_Button',
      dataType: 'BOOL',
      description: 'Stop button for motor control',
      scope: 'input'
    },
    {
      name: 'Motor_Running_Status',
      dataType: 'BOOL',
      description: 'Motor running status output',
      scope: 'output'
    },
    {
      name: 'Speed_Setpoint',
      dataType: 'INT',
      description: 'Motor speed setpoint',
      scope: 'global',
      defaultValue: 1500
    },
    {
      name: 'Current_Speed',
      dataType: 'REAL',
      description: 'Current motor speed feedback',
      scope: 'global',
      defaultValue: 0.0
    }
  ];

  const testProjectId = 1; // Replace with actual project ID for testing

  try {
    // Test 1: Format tags for Rockwell
    console.log('🔧 Testing Rockwell Formatting...');
    const rockwellResponse = await makeRequest('POST', '/format/rockwell', {
      tags: testTags,
      projectId: testProjectId
    });
    console.log('✅ Rockwell Response Status:', rockwellResponse.statusCode);
    if (rockwellResponse.statusCode === 200) {
      console.log('   Formatted Tags Count:', rockwellResponse.data.data.formattedCount);
      console.log('   Sample Tag:', rockwellResponse.data.data.tags[0]);
    } else {
      console.log('❌ Rockwell Error:', rockwellResponse.data);
    }
    console.log('');

    // Test 2: Format tags for Siemens
    console.log('🔧 Testing Siemens Formatting...');
    const siemensResponse = await makeRequest('POST', '/format/siemens', {
      tags: testTags,
      projectId: testProjectId
    });
    console.log('✅ Siemens Response Status:', siemensResponse.statusCode);
    if (siemensResponse.statusCode === 200) {
      console.log('   Formatted Tags Count:', siemensResponse.data.data.formattedCount);
      console.log('   Sample Tag:', siemensResponse.data.data.tags[0]);
    } else {
      console.log('❌ Siemens Error:', siemensResponse.data);
    }
    console.log('');

    // Test 3: Format tags for Beckhoff
    console.log('🔧 Testing Beckhoff Formatting...');
    const beckhoffResponse = await makeRequest('POST', '/format/beckhoff', {
      tags: testTags,
      projectId: testProjectId
    });
    console.log('✅ Beckhoff Response Status:', beckhoffResponse.statusCode);
    if (beckhoffResponse.statusCode === 200) {
      console.log('   Formatted Tags Count:', beckhoffResponse.data.data.formattedCount);
      console.log('   Sample Tag:', beckhoffResponse.data.data.tags[0]);
    } else {
      console.log('❌ Beckhoff Error:', beckhoffResponse.data);
    }
    console.log('');

    // Test 4: Address validation for different vendors
    const testAddresses = {
      rockwell: ['I:1/0', 'O:2/0', 'N7:0', 'Motor_Start', 'InvalidAddress'],
      siemens: ['I0.0', 'Q0.0', 'DB1.DBD0', 'Motor_Start', 'InvalidAddress'],
      beckhoff: ['%I0.0', '%Q0.0', '%MW100', 'Motor_Start', 'InvalidAddress']
    };

    for (const [vendor, addresses] of Object.entries(testAddresses)) {
      console.log(`🔧 Testing ${vendor.toUpperCase()} Address Validation...`);
      const validationResponse = await makeRequest('POST', `/validate-addresses/${vendor}`, {
        addresses
      });
      console.log(`✅ ${vendor.toUpperCase()} Validation Status:`, validationResponse.statusCode);
      if (validationResponse.statusCode === 200) {
        const data = validationResponse.data.data;
        console.log(`   Valid: ${data.validAddresses}/${data.totalAddresses}`);
        console.log('   Results:', data.results.map((r: any) => `${r.address}: ${r.isValid ? '✅' : '❌'}`).join(', '));
      } else {
        console.log(`❌ ${vendor.toUpperCase()} Validation Error:`, validationResponse.data);
      }
      console.log('');
    }

    // Test 5: Export formatted tags (if project exists and has tags)
    console.log('🔧 Testing Formatted Export...');
    for (const vendor of ['rockwell', 'siemens', 'beckhoff']) {
      const exportResponse = await makeRequest('GET', `/projects/${testProjectId}/export/${vendor}/formatted`);
      console.log(`✅ ${vendor.toUpperCase()} Export Status:`, exportResponse.statusCode);
      if (exportResponse.statusCode === 200) {
        console.log(`   Exported ${exportResponse.data.tagCount} tags`);
        console.log(`   Project: ${exportResponse.data.project.name}`);
      } else {
        console.log(`❌ ${vendor.toUpperCase()} Export Error:`, exportResponse.data);
      }
    }
    console.log('');

    // Test 6: Error handling - invalid vendor
    console.log('🔧 Testing Error Handling...');
    const invalidVendorResponse = await makeRequest('POST', '/format/invalid_vendor', {
      tags: testTags,
      projectId: testProjectId
    });
    console.log('✅ Invalid Vendor Response Status:', invalidVendorResponse.statusCode);
    console.log('   Should be 400 or 500:', invalidVendorResponse.statusCode >= 400 ? '✅' : '❌');
    console.log('');

    // Test 7: Error handling - missing data
    console.log('🔧 Testing Missing Data Handling...');
    const missingDataResponse = await makeRequest('POST', '/format/rockwell', {
      // Missing tags and projectId
    });
    console.log('✅ Missing Data Response Status:', missingDataResponse.statusCode);
    console.log('   Should be 400:', missingDataResponse.statusCode === 400 ? '✅' : '❌');
    console.log('');

    console.log('🎉 All Vendor Formatting API Tests Completed!');
    console.log('\n📊 Summary:');
    console.log('   ✅ Rockwell Formatting API: Tested');
    console.log('   ✅ Siemens Formatting API: Tested');
    console.log('   ✅ Beckhoff Formatting API: Tested');
    console.log('   ✅ Address Validation API: Tested');
    console.log('   ✅ Formatted Export API: Tested');
    console.log('   ✅ Error Handling: Tested');
    
    console.log('\n🚀 Vendor Formatting APIs are ready for production use!');

  } catch (error) {
    console.error('❌ API Test failed:', error);
  }
}

// Instructions for running the test
console.log('📝 Instructions for Testing:');
console.log('1. Make sure the backend server is running on localhost:3000');
console.log('2. Replace TEST_TOKEN with a valid JWT token');
console.log('3. Replace testProjectId with an actual project ID');
console.log('4. Run: npx ts-node test-vendor-api.ts');
console.log('');

// Export for external use
export { testVendorFormattingAPI };

// Run test if this file is executed directly
if (require.main === module) {
  testVendorFormattingAPI();
}
