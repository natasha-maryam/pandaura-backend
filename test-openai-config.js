// Test script to validate OpenAI configuration
require('dotenv').config();

console.log('🔍 OpenAI Configuration Test');
console.log('=============================');

console.log('Environment:', process.env.NODE_ENV || 'development');
console.log('OPENAI_API_KEY exists:', !!process.env.OPENAI_API_KEY);
console.log('OPENAI_API_KEY length:', process.env.OPENAI_API_KEY?.length || 0);
console.log('OPENAI_API_KEY starts with:', process.env.OPENAI_API_KEY?.substring(0, 10) || 'undefined');
console.log('OPENAI_MODEL_NAME:', process.env.OPENAI_MODEL_NAME || 'gpt-4o-mini (default)');
console.log('OPENAI_BASE_URL:', process.env.OPENAI_BASE_URL || 'default OpenAI base URL');

if (!process.env.OPENAI_API_KEY) {
  console.error('❌ CRITICAL: OPENAI_API_KEY is missing!');
  console.error('   This will cause code generation to fail.');
  console.error('   Please set this environment variable in Railway dashboard.');
} else {
  console.log('✅ OPENAI_API_KEY is configured');
}

// Test basic OpenAI connection
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
  baseURL: process.env.OPENAI_BASE_URL,
});

async function testConnection() {
  try {
    console.log('\n🧪 Testing OpenAI connection...');
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL_NAME || "gpt-4o-mini",
      messages: [{ role: "user", content: "Hello, test connection" }],
      max_tokens: 10
    });
    
    console.log('✅ OpenAI connection successful');
    console.log('Response preview:', response.choices[0]?.message?.content?.substring(0, 50) + '...');
  } catch (error) {
    console.error('❌ OpenAI connection failed:', error.message);
    if (error.message.includes('Incorrect API key')) {
      console.error('   The API key is invalid or missing');
    } else if (error.message.includes('quota')) {
      console.error('   API quota exceeded');
    } else if (error.message.includes('network')) {
      console.error('   Network connectivity issue');
    }
  }
}

testConnection();
