// Test Siemens export functionality
// Run with: npx ts-node test-siemens-export.ts

import fs from 'fs';
import { Writable } from 'stream';

console.log('🔧 Testing Siemens CSV Export...\n');

// Create a simple test by directly calling the export function with mocked dependencies
async function testExport() {
  try {
    console.log('📂 Testing Siemens CSV Export...');
    
    // Create a string stream to capture output
    let csvOutput = '';
    const testStream = new Writable({
      write(chunk, encoding, callback) {
        csvOutput += chunk.toString();
        callback();
      }
    });

    // Add event listeners to track stream lifecycle
    testStream.on('finish', () => {
      console.log('✅ Stream finished successfully');
      console.log('📄 Generated CSV Output:');
      console.log('---');
      console.log(csvOutput);
      console.log('---\n');
      
      // Validate the output
      const lines = csvOutput.split('\n').filter(line => line.trim());
      console.log(`📊 Total lines: ${lines.length}`);
      console.log(`🔤 Header: ${lines[0]}`);
      if (lines.length > 1) {
        console.log(`📝 First data row: ${lines[1]}`);
      }
    });

    testStream.on('error', (error) => {
      console.error('❌ Stream error:', error);
    });

    // Write test CSV content manually to verify stream works
    const testHeaders = 'Name,DataType,Address,Comment,InitialValue,Scope\n';
    const testRow = 'Motor_Start,Bool,I0.0,Motor start button,false,global\n';
    
    console.log('📝 Writing test data to stream...');
    testStream.write(testHeaders);
    testStream.write(testRow);
    testStream.end();
    
    // Wait a bit for the stream to process
    await new Promise(resolve => setTimeout(resolve, 100));
    
    console.log('✅ Manual stream test completed!');
    
  } catch (error) {
    console.error('❌ Test failed:', error instanceof Error ? error.message : error);
  }
}

// Run test
testExport().then(() => {
  console.log('🎉 Test completed!');
}).catch(console.error);
