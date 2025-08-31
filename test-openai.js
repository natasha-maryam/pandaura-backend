const axios = require('axios');

const BASE_URL = 'http://localhost:5000';

async function testOpenAI() {
  try {
    console.log('🧪 Testing OpenAI Integration...\n');

    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const healthResponse = await axios.get(`${BASE_URL}/api/assistant/health`);
    console.log('✅ Health check passed:', healthResponse.data);

    // Test ping endpoint
    console.log('\n2. Testing ping endpoint...');
    const pingResponse = await axios.get(`${BASE_URL}/api/assistant/health/ping`);
    console.log('✅ Ping test passed:', pingResponse.data);

    // Test simple wrapper
    console.log('\n3. Testing main wrapper...');
    const wrapperResponse = await axios.post(`${BASE_URL}/api/assistant/wrapperA`, {
      prompt: 'What is automation engineering?',
      projectId: 'test-project',
      vendor_selection: 'Generic'
    });
    console.log('✅ Wrapper test passed:', wrapperResponse.data);

    console.log('\n🎉 All tests passed! OpenAI integration is working correctly.');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.log('\n💡 Make sure the server is running on port 5000');
    console.log('💡 Make sure your OpenAI API key is configured correctly');
  }
}

testOpenAI();
