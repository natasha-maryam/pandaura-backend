// Frontend API test - simulates what the frontend should send
const FormData = require('form-data');
const fs = require('fs');
const { default: fetch } = require('node-fetch');

const API_BASE = 'http://localhost:5000/api/assistant';
const FRONTEND_PORT = 5174;

async function testFrontendAPIBehavior() {
  console.log('🧪 Testing Frontend API Behavior...\n');

  // Create test files
  const conveyor = `Conveyor System Manual
Motor: M001 - 3HP  
Sensor: PE001 - Photo Eye
Emergency Stop: ES001
Safety: E-stop must halt motion in 0.5s`;

  const packaging = `Packaging Line Specification
Robot: R001 - 6-axis arm
Vision: VS001 - 2D camera system
Gripper: GR001 - Pneumatic  
Quality: Vision detects defects >2mm`;

  fs.writeFileSync('./test-conveyor.txt', conveyor);
  fs.writeFileSync('./test-packaging.txt', packaging);

  // Simulate fresh session for each file upload (like frontend should do)
  const generateSessionId = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  };

  // Test 1: First file with new session
  console.log('🔬 Test 1: Conveyor file with fresh session');
  const session1 = generateSessionId();
  const response1 = await sendFileWithSession('./test-conveyor.txt', 'What are the main components?', session1);
  console.log(`📋 Session ${session1.substring(0, 8)}... Response:`, response1.answer_md?.substring(0, 100) + '...');

  // Test 2: Different file with new session (frontend behavior)
  console.log('\n🔬 Test 2: Packaging file with fresh session');
  const session2 = generateSessionId(); // New session like frontend creates
  const response2 = await sendFileWithSession('./test-packaging.txt', 'What are the main components?', session2);
  console.log(`📋 Session ${session2.substring(0, 8)}... Response:`, response2.answer_md?.substring(0, 100) + '...');

  // Test 3: First file again with new session
  console.log('\n🔬 Test 3: Conveyor file again with fresh session');
  const session3 = generateSessionId(); // New session
  const response3 = await sendFileWithSession('./test-conveyor.txt', 'What are the main components?', session3);
  console.log(`📋 Session ${session3.substring(0, 8)}... Response:`, response3.answer_md?.substring(0, 100) + '...');

  // Analyze results
  console.log('\n📊 Analysis Results:');
  const mentions = {
    conveyor1: response1.answer_md?.toLowerCase().includes('conveyor'),
    packaging: response2.answer_md?.toLowerCase().includes('packaging') || response2.answer_md?.toLowerCase().includes('robot'),
    conveyor3: response3.answer_md?.toLowerCase().includes('conveyor')
  };

  console.log('Response 1 mentions conveyor/motor:', mentions.conveyor1 ? '✅' : '❌');
  console.log('Response 2 mentions packaging/robot:', mentions.packaging ? '✅' : '❌');  
  console.log('Response 3 mentions conveyor/motor:', mentions.conveyor3 ? '✅' : '❌');

  const differentResponses = response1.answer_md !== response2.answer_md;
  const consistentResponses = response1.answer_md === response3.answer_md;

  console.log('\nFrontend Simulation Results:');
  console.log('Different files → Different responses:', differentResponses ? '✅ PASS' : '❌ FAIL');
  console.log('Same file → Consistent responses:', consistentResponses ? '✅ PASS' : '❌ FAIL');

  if (differentResponses && consistentResponses && mentions.conveyor1 && mentions.packaging && mentions.conveyor3) {
    console.log('\n🎉 SUCCESS: Frontend session management would work correctly!');
  } else {
    console.log('\n❌ ISSUE: Frontend session management may still have problems');
    console.log('Check that each file upload creates a new session ID');
  }

  // Cleanup
  fs.unlinkSync('./test-conveyor.txt');
  fs.unlinkSync('./test-packaging.txt');
}

async function sendFileWithSession(filePath, prompt, sessionId) {
  try {
    const form = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    
    form.append('files', fileBuffer, {
      filename: filePath.split('/').pop(),
      contentType: 'text/plain'
    });
    
    form.append('prompt', prompt);
    form.append('projectId', 'frontend-test');
    form.append('vendor_selection', 'Generic');
    form.append('sessionId', sessionId); // Use specific session ID
    
    console.log(`📤 Sending ${filePath.split('/').pop()} with session ${sessionId.substring(0, 8)}...`);
    
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

testFrontendAPIBehavior().catch(console.error);
