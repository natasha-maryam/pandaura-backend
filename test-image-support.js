const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:5000';

async function testImageSupport() {
  try {
    console.log('🖼️ Testing Image Support...\n');

    // Test 1: Health check
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${BASE_URL}/api/assistant/health`);
    console.log('✅ Health:', healthResponse.data);
    console.log('Image support enabled:', healthResponse.data.image_support);

    // Test 2: Image upload
    console.log('\n2. Testing image upload...');
    
    // Create a simple test image (1x1 pixel PNG)
    const testImagePath = path.join(__dirname, 'test-image.png');
    const testImageBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
      0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
      0x49, 0x48, 0x44, 0x52, // IHDR
      0x00, 0x00, 0x00, 0x01, // width: 1
      0x00, 0x00, 0x00, 0x01, // height: 1
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

    const formData = new FormData();
    formData.append('image', fs.createReadStream(testImagePath), {
      filename: 'test-image.png',
      contentType: 'image/png'
    });

    const uploadResponse = await axios.post(`${BASE_URL}/api/assistant/upload-image`, formData, {
      headers: {
        ...formData.getHeaders()
      }
    });
    console.log('✅ Upload response:', uploadResponse.data);

    // Test 3: Image analysis
    console.log('\n3. Testing image analysis...');
    const sessionId = 'test-image-' + Date.now();
    
    const analysisFormData = new FormData();
    analysisFormData.append('image', fs.createReadStream(testImagePath), {
      filename: 'test-image.png',
      contentType: 'image/png'
    });
    analysisFormData.append('prompt', 'What do you see in this image?');
    analysisFormData.append('sessionId', sessionId);

    const analysisResponse = await axios.post(`${BASE_URL}/api/assistant/analyze-image`, analysisFormData, {
      headers: {
        ...analysisFormData.getHeaders()
      }
    });
    console.log('✅ Analysis response:', analysisResponse.data);

    // Test 4: Follow-up question with memory
    console.log('\n4. Testing follow-up question with memory...');
    const followUpResponse = await axios.post(`${BASE_URL}/api/assistant/wrapperA`, {
      prompt: 'What did you see in the previous image?',
      sessionId: sessionId,
      stream: false
    });
    console.log('✅ Follow-up response:', followUpResponse.data.answer_md);

    // Clean up
    fs.unlinkSync(testImagePath);
    console.log('\n🎉 Image support test completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.log('\n💡 Make sure the server is running on port 5000');
  }
}

async function testWithRealImage() {
  try {
    console.log('\n🖼️ Testing with a real image...\n');

    // Look for a real image in the current directory
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
    let testImagePath = null;

    for (const ext of imageExtensions) {
      const files = fs.readdirSync('.').filter(file => file.toLowerCase().endsWith(ext));
      if (files.length > 0) {
        testImagePath = files[0];
        break;
      }
    }

    if (!testImagePath) {
      console.log('⚠️ No image files found in current directory. Skipping real image test.');
      return;
    }

    console.log(`Using image: ${testImagePath}`);

    const sessionId = 'test-real-image-' + Date.now();
    
    const formData = new FormData();
    formData.append('image', fs.createReadStream(testImagePath), {
      filename: testImagePath,
      contentType: 'image/png'
    });
    formData.append('prompt', 'Describe what you see in this image in detail.');
    formData.append('sessionId', sessionId);

    const response = await axios.post(`${BASE_URL}/api/assistant/analyze-image`, formData, {
      headers: {
        ...formData.getHeaders()
      }
    });
    console.log('✅ Real image analysis:', response.data.answer_md);

  } catch (error) {
    console.error('❌ Real image test failed:', error.response?.data || error.message);
  }
}

// Run tests
testImageSupport().then(() => {
  return testWithRealImage();
}).catch(console.error);
