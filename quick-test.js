// Quick test script for the API
const http = require('http');

function testEndpoint(path, expectedStatus = 200) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://localhost:5000${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        console.log(`\n=== Testing ${path} ===`);
        console.log(`Status: ${res.statusCode}`);
        console.log(`Content: ${data}`);
        resolve({ status: res.statusCode, data: JSON.parse(data || '{}') });
      });
    });
    
    req.on('error', (err) => {
      console.error(`Error testing ${path}:`, err.message);
      reject(err);
    });
  });
}

async function runTests() {
  try {
    // Test root endpoint
    await testEndpoint('/');
    
    // Test projects endpoint (should return 401 without auth)
    await testEndpoint('/api/v1/projects', 401);
    
    console.log('\n🎉 Basic API tests completed!');
    
  } catch (error) {
    console.error('Test failed:', error);
  }
}

runTests();
