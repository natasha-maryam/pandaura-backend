const fetch = require('node-fetch');
const FormData = require('form-data');

async function testCodeCleaning() {
  try {
    console.log('🧪 Testing code cleaning functionality...');
    
    const formData = new FormData();
    formData.append('prompt', 'give me react code eg for timer');
    formData.append('projectId', '2');
    formData.append('sessionId', 'test_session_' + Date.now());
    
    const response = await fetch('http://localhost:5001/api/assistant/wrapperA', {
      method: 'POST',
      body: formData
    });
    
    const data = await response.json();
    console.log('📋 Response status:', data.status);
    console.log('📋 Answer MD length:', data.answer_md?.length || 0);
    console.log('📋 Code artifacts count:', data.artifacts?.code?.length || 0);
    
    // Check if answer_md contains code blocks
    const hasCodeBlocks = data.answer_md && (
      data.answer_md.includes('```') || 
      data.answer_md.includes('`') ||
      data.answer_md.includes('import React') ||
      data.answer_md.includes('function') ||
      data.answer_md.includes('const')
    );
    
    if (hasCodeBlocks) {
      console.log('❌ Code blocks found in answer_md!');
      console.log('📝 Answer MD preview:', data.answer_md.substring(0, 200) + '...');
    } else {
      console.log('✅ No code blocks found in answer_md');
    }
    
    if (data.artifacts && data.artifacts.code && data.artifacts.code.length > 0) {
      console.log('✅ Code found in artifacts.code');
      data.artifacts.code.forEach((snippet, index) => {
        console.log(`📝 Code ${index + 1}:`);
        console.log(`   Language: ${snippet.language || 'N/A'}`);
        console.log(`   Code length: ${(snippet.code || snippet.content || '').length} chars`);
      });
    } else {
      console.log('❌ No code found in artifacts.code');
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testCodeCleaning();
