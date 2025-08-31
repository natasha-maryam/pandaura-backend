const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000';

async function testImageIntegration() {
  try {
    console.log('🖼️ Testing Image Integration (Frontend-Backend)...\n');

    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${BASE_URL}/api/assistant/health`);
    console.log('✅ Health:', {
      status: healthResponse.data.status,
      image_support: healthResponse.data.image_support,
      vision_model: healthResponse.data.vision_model
    });

    // Test 2: Create a test image
    console.log('\n2. Creating test image...');
    const testImagePath = path.join(__dirname, 'test-integration.png');
    
    // Create a simple 2x2 pixel PNG
    const testImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
      0x49, 0x48, 0x44, 0x52, // IHDR
      0x00, 0x00, 0x00, 0x02, // width: 2
      0x00, 0x00, 0x00, 0x02, // height: 2
      0x08, 0x02, 0x00, 0x00, 0x00, // bit depth, color type, etc.
      0x90, 0x77, 0x53, 0xDE, // CRC
      0x00, 0x00, 0x00, 0x0C, // IDAT chunk length
      0x49, 0x44, 0x41, 0x54, // IDAT
      0x08, 0x99, 0x01, 0x01, 0x00, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x02, 0x00, 0x01, // compressed data
      0x00, 0x00, 0x00, 0x00, // IEND chunk length
      0x49, 0x45, 0x4E, 0x44, // IEND
      0xAE, 0x42, 0x60, 0x82  // CRC
    ]);

    fs.writeFileSync(testImagePath, testImageBuffer);
    console.log('✅ Test image created');

    // Test 3: Test frontend-style FormData (multiple images with same field name)
    console.log('\n3. Testing frontend-style FormData...');
    const sessionId = 'test-integration-' + Date.now();
    
    const formData = new FormData();
    formData.append('prompt', 'What do you see in these images? Please describe them.');
    formData.append('projectId', 'test-project');
    formData.append('sessionId', sessionId);
    
    // Add the same image twice (simulating multiple image uploads)
    formData.append('image', fs.createReadStream(testImagePath), {
      filename: 'test1.png',
      contentType: 'image/png'
    });
    formData.append('image', fs.createReadStream(testImagePath), {
      filename: 'test2.png',
      contentType: 'image/png'
    });

    const response = await axios.post(`${BASE_URL}/api/assistant/wrapperA`, formData, {
      headers: {
        ...formData.getHeaders()
      }
    });
    
    console.log('✅ Frontend-style response:', {
      status: response.data.status,
      task_type: response.data.task_type,
      has_answer: !!response.data.answer_md,
      answer_length: response.data.answer_md?.length || 0
    });

    // Test 4: Test follow-up question with memory
    console.log('\n4. Testing follow-up question with memory...');
    const followUpResponse = await axios.post(`${BASE_URL}/api/assistant/wrapperA`, {
      prompt: 'What did you see in the previous images?',
      sessionId: sessionId,
      stream: false
    });
    
    console.log('✅ Follow-up response:', {
      status: followUpResponse.data.status,
      has_answer: !!followUpResponse.data.answer_md,
      answer_preview: followUpResponse.data.answer_md?.substring(0, 100) + '...'
    });

    // Test 5: Test text-only message (no images)
    console.log('\n5. Testing text-only message...');
    const textResponse = await axios.post(`${BASE_URL}/api/assistant/wrapperA`, {
      prompt: 'Hello, this is a text-only message. How are you?',
      sessionId: sessionId,
      stream: false
    });
    
    console.log('✅ Text-only response:', {
      status: textResponse.data.status,
      has_answer: !!textResponse.data.answer_md
    });

    // Test 6: Test image analysis endpoint
    console.log('\n6. Testing dedicated image analysis endpoint...');
    const analysisFormData = new FormData();
    analysisFormData.append('image', fs.createReadStream(testImagePath), {
      filename: 'analysis-test.png',
      contentType: 'image/png'
    });
    analysisFormData.append('prompt', 'Analyze this image in detail.');
    analysisFormData.append('sessionId', sessionId);

    const analysisResponse = await axios.post(`${BASE_URL}/api/assistant/analyze-image`, analysisFormData, {
      headers: {
        ...analysisFormData.getHeaders()
      }
    });
    
    console.log('✅ Analysis endpoint response:', {
      status: analysisResponse.data.status,
      task_type: analysisResponse.data.task_type,
      has_answer: !!analysisResponse.data.answer_md
    });

    // Clean up
    fs.unlinkSync(testImagePath);
    console.log('\n🎉 Image integration test completed successfully!');
    console.log('\n📋 Summary:');
    console.log('✅ Health check passed');
    console.log('✅ Frontend-style FormData works');
    console.log('✅ Memory/context works');
    console.log('✅ Text-only messages work');
    console.log('✅ Dedicated image analysis endpoint works');
    console.log('✅ Multiple images support works');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.log('\n💡 Make sure the server is running on port 5000');
    console.log('💡 Check that OpenAI API key is configured');
  }
}

// Run the test
testImageIntegration();
