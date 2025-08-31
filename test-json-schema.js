// Simple test to verify JSON schema compliance
async function testJSONSchemaCompliance() {
  try {
    console.log('🧪 Testing JSON schema compliance...');
    
    // Test with a simple prompt to see if the response format is correct
    const response = await fetch('http://localhost:5000/api/assistant/test-format', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        prompt: 'Test JSON format compliance'
      })
    });
    
    const data = await response.json();
    
    console.log('📊 Test format response:', JSON.stringify(data, null, 2));
    
    // Check if all required fields are present
    const requiredFields = ['status', 'task_type', 'assumptions', 'answer_md', 'artifacts', 'next_actions', 'errors'];
    const missingFields = requiredFields.filter(field => !(field in data));
    
    if (missingFields.length === 0) {
      console.log('✅ All required fields present');
    } else {
      console.log('❌ Missing fields:', missingFields);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// For Node.js
if (typeof window === 'undefined') {
  const { default: fetch } = require('node-fetch');
  testJSONSchemaCompliance();
}
