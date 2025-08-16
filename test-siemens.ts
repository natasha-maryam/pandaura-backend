// Test file for Siemens import/export functionality
// Run with: npx ts-node test-siemens.ts

import fs from 'fs';
import path from 'path';
import { importSiemensCsv } from './src/utils/siemensTagIO';

console.log('🔧 Testing Siemens Tag IO...\n');

async function testSiemensImport() {
  try {
    console.log('📂 Testing Siemens CSV Import...');
    
    // Read the sample CSV file
    const csvPath = path.join(__dirname, '..', 'sample-siemens-test.csv');
    
    if (!fs.existsSync(csvPath)) {
      console.log('❌ Sample CSV file not found at:', csvPath);
      return;
    }
    
    const buffer = fs.readFileSync(csvPath);
    const projectId = 1; // Test project ID
    const userId = 'test-user-id';
    
    console.log(`   📊 CSV file size: ${buffer.length} bytes`);
    console.log(`   🏗️ Project ID: ${projectId}`);
    console.log(`   👤 User ID: ${userId}\n`);
    
    // Mock the TagsTable.createTag function since we don't have a DB connection
    const originalCreateTag = require('./src/db/tables/tags').TagsTable.createTag;
    
    let createdTags: any[] = [];
    require('./src/db/tables/tags').TagsTable.createTag = async (tag: any) => {
      createdTags.push(tag);
      return { id: `tag_${createdTags.length}`, ...tag };
    };
    
    // Test the import
    const result = await importSiemensCsv(buffer, projectId, userId);
    
    console.log('📈 Import Results:');
    console.log(`   ✅ Success: ${result.success}`);
    console.log(`   📊 Inserted: ${result.inserted}`);
    
    if (result.errors) {
      console.log(`   ❌ Errors: ${result.errors.length}`);
      result.errors.forEach((error, index) => {
        console.log(`      Error ${index + 1}: Row ${error.row}`);
        error.errors.forEach((err: string) => console.log(`        - ${err}`));
      });
    }
    
    if (createdTags.length > 0) {
      console.log('\n📋 Sample Created Tags:');
      createdTags.slice(0, 3).forEach((tag, index) => {
        console.log(`   Tag ${index + 1}:`);
        console.log(`     Name: ${tag.name}`);
        console.log(`     Type: ${tag.type}`);
        console.log(`     Address: ${tag.address}`);
        console.log(`     Vendor: ${tag.vendor}`);
        console.log(`     Scope: ${tag.scope}`);
      });
    }
    
    // Restore original function
    require('./src/db/tables/tags').TagsTable.createTag = originalCreateTag;
    
    console.log('\n✅ Siemens import test completed successfully!');
    
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
  }
}

async function main() {
  await testSiemensImport();
  console.log('\n🎉 All tests completed!');
}

// Run the test
main().catch(console.error);
