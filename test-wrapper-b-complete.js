// Test Wrapper B with actual file upload
const FormData = require('form-data');
const fs = require('fs');
const { default: fetch } = require('node-fetch');

async function testWrapperBWithFile() {
  try {
    console.log('🧪 Testing Wrapper B with Structured Text file...');
    
    // Check if file exists
    const filePath = './test-files/structured-text-sample.st';
    if (!fs.existsSync(filePath)) {
      console.log('❌ Test file not found:', filePath);
      return;
    }
    
    // Create form data
    const form = new FormData();
    const fileBuffer = fs.readFileSync(filePath);
    
    form.append('files', fileBuffer, {
      filename: 'structured-text-sample.st',
      contentType: 'text/x-structured-text'
    });
    
    form.append('prompt', 'Review this structured text program and identify potential improvements');
    form.append('projectId', 'test-project');
    form.append('vendor_selection', 'Generic');
    
    console.log('📤 Sending request to Wrapper B...');
    
    // Send request
    const response = await fetch('http://localhost:5000/api/assistant/wrapperB', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const responseText = await response.text();
    console.log('📥 Raw response:', responseText);
    
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.log('❌ Failed to parse response as JSON:', parseError.message);
      return;
    }
    
    console.log('📊 Response Status:', response.status);
    console.log('📊 Response Data Structure:', Object.keys(data));
    
    // Check required fields
    const requiredFields = ['status', 'task_type', 'assumptions', 'answer_md', 'artifacts', 'next_actions', 'errors'];
    const missingFields = requiredFields.filter(field => !(field in data));
    
    if (missingFields.length === 0) {
      console.log('✅ All required fields present');
      console.log('📝 Status:', data.status);
      console.log('📝 Task Type:', data.task_type);
      console.log('📝 Next Actions:', data.next_actions);
      console.log('📝 Errors:', data.errors);
      
      if (data.status === 'ok') {
        console.log('🎉 Wrapper B is working correctly!');
      } else if (data.status === 'error' && data.errors.includes('Response validation failed')) {
        console.log('❌ Still getting validation errors - the AI is not following JSON format');
      }
    } else {
      console.log('❌ Missing required fields:', missingFields);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

testWrapperBWithFile();
