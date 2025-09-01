// Simple test to debug the wrapper B issue
const FormData = require('form-data');
const fs = require('fs');
const { default: fetch } = require('node-fetch');

const API_BASE = 'http://localhost:5000/api/assistant';

async function resetCircuitBreaker() {
  try {
    console.log('🔄 Resetting circuit breaker...');
    const response = await fetch(`${API_BASE}/resetCircuitBreaker`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    const data = await response.json();
    console.log('✅ Circuit breaker reset:', data.message);
  } catch (error) {
    console.error('❌ Failed to reset circuit breaker:', error.message);
  }
}

async function simpleFileTest() {
  try {
    // Reset circuit breaker first
    await resetCircuitBreaker();
    
    console.log('🧪 Testing simple file upload...');
    
    // Create a very simple test file
    const testContent = 'This is a simple test file for debugging.';
    fs.writeFileSync('./debug-test.txt', testContent);
    
    const form = new FormData();
    const fileBuffer = fs.readFileSync('./debug-test.txt');
    
    form.append('files', fileBuffer, {
      filename: 'debug-test.txt',
      contentType: 'text/plain'
    });
    
    form.append('prompt', 'What is in this file?');
    form.append('projectId', 'debug-test');
    form.append('vendor_selection', 'Generic');
    
    console.log('📤 Sending simple request...');
    
    const response = await fetch(`${API_BASE}/wrapperB`, {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const responseText = await response.text();
    console.log('📥 Response status:', response.status);
    console.log('📥 Response text:', responseText);
    
    if (response.ok) {
      const data = JSON.parse(responseText);
      console.log('✅ Success! Response type:', data.status);
      console.log('📄 Answer summary:', data.answer_md?.substring(0, 200) + '...');
    } else {
      console.log('❌ Request failed with status:', response.status);
    }
    
    // Cleanup
    fs.unlinkSync('./debug-test.txt');
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.error('Stack:', error.stack);
  }
}

simpleFileTest();
