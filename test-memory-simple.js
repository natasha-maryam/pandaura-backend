const axios = require('axios');

const BASE_URL = 'http://localhost:5000';
const sessionId = 'test-jahanzaib-' + Date.now();

async function testMemory() {
  try {
    console.log('🧪 Testing Conversation Memory...\n');

    // Test 1: Introduce yourself
    console.log('1. Saying: "Hi, I\'m Jahanzaib"');
    const response1 = await axios.post(`${BASE_URL}/api/assistant/wrapperA`, {
      prompt: 'Hi, I\'m Jahanzaib',
      sessionId: sessionId,
      stream: false
    });
    console.log('✅ Response:', response1.data.answer_md);

    // Test 2: Ask who you are
    console.log('\n2. Asking: "Who am I?"');
    const response2 = await axios.post(`${BASE_URL}/api/assistant/wrapperA`, {
      prompt: 'Who am I?',
      sessionId: sessionId,
      stream: false
    });
    console.log('✅ Response:', response2.data.answer_md);

    // Test 3: Ask what your name is
    console.log('\n3. Asking: "What\'s my name?"');
    const response3 = await axios.post(`${BASE_URL}/api/assistant/wrapperA`, {
      prompt: 'What\'s my name?',
      sessionId: sessionId,
      stream: false
    });
    console.log('✅ Response:', response3.data.answer_md);

    // Test 4: Ask what you told the AI
    console.log('\n4. Asking: "What did I tell you?"');
    const response4 = await axios.post(`${BASE_URL}/api/assistant/wrapperA`, {
      prompt: 'What did I tell you?',
      sessionId: sessionId,
      stream: false
    });
    console.log('✅ Response:', response4.data.answer_md);

    console.log('\n🎉 Memory test completed!');
    console.log('Session ID used:', sessionId);

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.log('\n💡 Make sure the server is running on port 5000');
  }
}

testMemory();
