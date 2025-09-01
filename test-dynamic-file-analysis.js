// Test script to verify dynamic file analysis is working properly
const FormData = require('form-data');
const fs = require('fs');
const { default: fetch } = require('node-fetch');

const API_BASE = 'http://localhost:5000/api/assistant';

async function createTestFile(filename, content) {
  fs.writeFileSync(filename, content);
  console.log(`📄 Created test file: ${filename}`);
}

async function testDynamicFileAnalysis() {
  console.log('🧪 Testing Dynamic File Analysis...\n');

  // Create different test files
  const testFile1 = './test-file-1.txt';
  const testFile2 = './test-file-2.txt';
  
  const content1 = `CONVEYOR SYSTEM SPECIFICATION
This document describes a conveyor belt control system.
Key components:
- Motor: M001 (3HP)
- Sensors: PE001 (Photo Eye), LS001 (Limit Switch)
- Emergency Stop: ES001
Safety requirements: E-stop must halt all motion within 0.5 seconds.`;

  const content2 = `PACKAGING LINE SPECIFICATION  
This document describes a packaging automation line.
Key components:
- Robot Arm: R001 (6-axis)
- Vision System: VS001 (2D camera)
- Gripper: GR001 (Pneumatic)
Quality control: Vision system must detect defects >2mm.`;

  await createTestFile(testFile1, content1);
  await createTestFile(testFile2, content2);

  // Test 1: Upload first file
  console.log('🔬 Test 1: Uploading conveyor system file...');
  const response1 = await sendFileRequest(testFile1, 'Analyze this system and list the main components');
  console.log('📋 Response 1 Summary:', response1.answer_md?.substring(0, 200) + '...');

  // Test 2: Upload second file (should be different response)
  console.log('\n🔬 Test 2: Uploading packaging line file...');
  const response2 = await sendFileRequest(testFile2, 'Analyze this system and list the main components');
  console.log('📋 Response 2 Summary:', response2.answer_md?.substring(0, 200) + '...');

  // Test 3: Same prompt, first file again (should get original response)
  console.log('\n🔬 Test 3: Re-uploading conveyor system file...');
  const response3 = await sendFileRequest(testFile1, 'Analyze this system and list the main components');
  console.log('📋 Response 3 Summary:', response3.answer_md?.substring(0, 200) + '...');

  // Compare responses
  console.log('\n📊 Analysis Results:');
  console.log('Response 1 mentions conveyor:', response1.answer_md?.toLowerCase().includes('conveyor') ? '✅' : '❌');
  console.log('Response 2 mentions packaging:', response2.answer_md?.toLowerCase().includes('packaging') ? '✅' : '❌');
  console.log('Response 3 mentions conveyor:', response3.answer_md?.toLowerCase().includes('conveyor') ? '✅' : '❌');
  
  const areResponsesDifferent = response1.answer_md !== response2.answer_md;
  const isResponse1SameAs3 = response1.answer_md === response3.answer_md;
  
  console.log('\nTesting Results:');
  console.log('Different files produce different responses:', areResponsesDifferent ? '✅ PASS' : '❌ FAIL');
  console.log('Same file produces consistent responses:', isResponse1SameAs3 ? '✅ PASS' : '❌ FAIL');

  if (areResponsesDifferent && isResponse1SameAs3) {
    console.log('\n🎉 SUCCESS: Dynamic file analysis is working correctly!');
  } else {
    console.log('\n❌ FAILURE: Files are not being analyzed dynamically');
  }

  // Cleanup
  fs.unlinkSync(testFile1);
  fs.unlinkSync(testFile2);
  console.log('\n🧹 Test files cleaned up');
}

async function sendFileRequest(filePath, prompt) {
  try {
    const form = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    
    form.append('files', fileBuffer, {
      filename: filePath.split('/').pop(),
      contentType: 'text/plain'
    });
    
    form.append('prompt', prompt);
    form.append('projectId', 'test-dynamic-analysis');
    form.append('vendor_selection', 'Generic');
    
    const response = await fetch(`${API_BASE}/wrapperB`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${data.error || 'Unknown error'}`);
    }
    
    return data;
  } catch (error) {
    console.error('❌ Request failed:', error.message);
    return { answer_md: 'ERROR: ' + error.message };
  }
}

// Run the test
testDynamicFileAnalysis().catch(console.error);
