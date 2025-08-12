// Test script to verify backend deployment
// Run this after deploying to verify everything works

const API_BASE_URL = 'https://your-backend-url.vercel.app';

async function testDeployment() {
  console.log('🧪 Testing Backend Deployment...\n');
  
  try {
    // Test 1: Health Check
    console.log('1. Testing health endpoint...');
    const healthResponse = await fetch(`${API_BASE_URL}/`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData);
    
    // Test 2: CORS Configuration
    console.log('\n2. Testing CORS configuration...');
    const corsResponse = await fetch(`${API_BASE_URL}/api/v1/test/cors-test`, {
      method: 'GET',
      headers: {
        'Origin': 'https://your-frontend-url.vercel.app',
      }
    });
    console.log('✅ CORS test:', corsResponse.status === 200 ? 'PASSED' : 'FAILED');
    
    // Test 3: Database Connection
    console.log('\n3. Testing database connection...');
    const dbResponse = await fetch(`${API_BASE_URL}/api/v1/test/db-connection`);
    const dbData = await dbResponse.json();
    console.log('✅ Database connection:', dbData);
    
    // Test 4: Environment Variables
    console.log('\n4. Testing environment configuration...');
    const envResponse = await fetch(`${API_BASE_URL}/api/v1/test/env-check`);
    const envData = await envResponse.json();
    console.log('✅ Environment check:', envData);
    
    console.log('\n🎉 All tests completed!');
    
  } catch (error) {
    console.error('❌ Deployment test failed:', error);
  }
}

// Uncomment and update the API_BASE_URL, then run: node test-deployment.js
// testDeployment();
