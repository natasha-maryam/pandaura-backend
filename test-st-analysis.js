// Test specific structured text analysis issue
const FormData = require('form-data');
const fs = require('fs');
const { default: fetch } = require('node-fetch');

async function testStructuredTextAnalysis() {
  try {
    console.log('🧪 Testing Structured Text analysis...');
    
    // Create form data with the ST file
    const form = new FormData();
    const stFile = fs.readFileSync('./test-files/structured-text-sample.st');
    
    form.append('files', stFile, 'structured-text-sample.st');
    form.append('prompt', 'Review this structured text program and identify potential improvements');
    form.append('projectId', 'test-project');
    form.append('vendor_selection', 'Generic');
    
    // Send request to Wrapper B
    const response = await fetch('http://localhost:5001/api/assistant/wrapperB', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const data = await response.json();
    
    console.log('\n📊 Response Status:', response.status);
    console.log('📊 Response Data:');
    console.log(JSON.stringify(data, null, 2));
    
    // Check for the specific error
    if (data.status === 'error' && data.errors?.includes('Response validation failed')) {
      console.log('\n❌ Reproduced the validation error!');
      console.log('🔍 This is the same issue you encountered.');
      
      // Check if it's the JSON format issue
      if (data.answer_md?.includes('The AI response did not match the expected format')) {
        console.log('🎯 Confirmed: AI model is not following JSON schema format');
      }
    } else if (data.status === 'ok') {
      console.log('\n✅ Request successful!');
      console.log('📝 Task Type:', data.task_type);
      console.log('📝 Next Actions:', data.next_actions);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testStructuredTextAnalysis();
