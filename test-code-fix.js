const fetch = require('node-fetch');
const FormData = require('form-data');

async function testCodeGeneration() {
  try {
    console.log('🧪 Testing code generation fix...');
    
    const formData = new FormData();
    formData.append('prompt', 'give me react code eg for timer');
    formData.append('projectId', '2');
    formData.append('sessionId', 'test_session_' + Date.now());
    
    const response = await fetch('http://localhost:5001/api/assistant/wrapperA', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    console.log('📋 Response:', JSON.stringify(data, null, 2));
    
    if (data.status === 'ok' && data.artifacts && data.artifacts.code && data.artifacts.code.length > 0) {
      console.log('✅ Code generation working! Found', data.artifacts.code.length, 'code snippet(s)');
      data.artifacts.code.forEach((snippet, index) => {
        console.log(`📝 Code ${index + 1}:`);
        console.log(`   Language: ${snippet.language || 'N/A'}`);
        console.log(`   Code: ${snippet.code || snippet.content || 'N/A'}`);
      });
    } else {
      console.log('❌ No code artifacts found or error occurred');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCodeGeneration();
