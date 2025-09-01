const axios = require('axios');

const BASE_URL = 'http://localhost:5001';
const sessionId = 'test-session-' + Date.now();

async function testStreamingAndMemory() {
  try {
    console.log('🧪 Testing OpenAI Streaming and Memory Features...\n');

    // Test 1: First message - introduce yourself
    console.log('1. Testing memory - introducing yourself...');
    const response1 = await axios.post(`${BASE_URL}/api/assistant/wrapperA`, {
      prompt: 'I am Jana',
      sessionId: sessionId,
      stream: false
    });
    console.log('✅ First message response:', response1.data.answer_md);

    // Test 2: Second message - ask who you are
    console.log('\n2. Testing memory - asking who you are...');
    const response2 = await axios.post(`${BASE_URL}/api/assistant/wrapperA`, {
      prompt: 'Who am I?',
      sessionId: sessionId,
      stream: false
    });
    console.log('✅ Second message response:', response2.data.answer_md);

    // Test 3: Streaming test
    console.log('\n3. Testing streaming...');
    const response3 = await axios.post(`${BASE_URL}/api/assistant/wrapperA`, {
      prompt: 'Tell me a short story about automation',
      sessionId: sessionId,
      stream: true
    }, {
      responseType: 'stream',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    });

    console.log('✅ Streaming response received');
    let streamedContent = '';
    
    response3.data.on('data', (chunk) => {
      const lines = chunk.toString().split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'chunk') {
              process.stdout.write(data.content);
              streamedContent += data.content;
            } else if (data.type === 'end') {
              console.log('\n✅ Streaming completed');
            } else if (data.type === 'error') {
              console.error('\n❌ Streaming error:', data.error);
            }
          } catch (e) {
            // Ignore parsing errors for non-JSON lines
          }
        }
      }
    });

    // Test 4: Check memory sessions
    console.log('\n4. Checking memory sessions...');
    const healthResponse = await axios.get(`${BASE_URL}/api/assistant/health`);
    console.log('✅ Memory sessions:', healthResponse.data.memory_sessions);

    // Test 5: Clear memory
    console.log('\n5. Clearing memory...');
    const clearResponse = await axios.post(`${BASE_URL}/api/assistant/clear-memory`, {
      sessionId: sessionId
    });
    console.log('✅ Memory cleared:', clearResponse.data.message);

    console.log('\n🎉 All streaming and memory tests completed!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
    console.log('\n💡 Make sure the server is running on port 5000');
    console.log('💡 Make sure your OpenAI API key is configured correctly');
  }
}

testStreamingAndMemory();
