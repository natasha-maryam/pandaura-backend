// Test script for Projects API
const axios = require('axios');

const BASE_URL = process.env.API_URL || 'http://localhost:5000/api/v1';

// Mock authentication token (you'll need a real JWT token from auth)
const AUTH_TOKEN = 'your-jwt-token-here';

const api = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Authorization': `Bearer ${AUTH_TOKEN}`,
    'Content-Type': 'application/json'
  }
});

async function testProjectsAPI() {
  console.log('🚀 Testing Projects API...\n');

  try {
    // 1. Test create project
    console.log('1. Creating a new project...');
    const createResponse = await api.post('/projects', {
      projectName: 'Test Automation Project',
      clientName: 'ACME Corporation',
      projectType: 'Industrial Automation',
      description: 'A test project for PLC programming automation',
      targetPLCVendor: 'siemens'
    });
    
    const projectId = createResponse.data.project.id;
    console.log('✅ Project created:', createResponse.data.project);

    // 2. Test get all projects
    console.log('\n2. Getting all projects...');
    const listResponse = await api.get('/projects');
    console.log('✅ Projects list:', listResponse.data.projects.length, 'projects found');

    // 3. Test get single project
    console.log('\n3. Getting single project...');
    const getResponse = await api.get(`/projects/${projectId}`);
    console.log('✅ Project details:', getResponse.data.project.project_name);

    // 4. Test update project
    console.log('\n4. Updating project...');
    const updateResponse = await api.patch(`/projects/${projectId}`, {
      description: 'Updated description for the test project',
      targetPLCVendor: 'rockwell'
    });
    console.log('✅ Project updated:', updateResponse.data.project.description);

    // 5. Test autosave
    console.log('\n5. Testing autosave...');
    const autosaveResponse = await api.put(`/projects/${projectId}/autosave`, {
      autosaveState: {
        currentStep: 'config',
        progress: 25,
        tags: ['tag1', 'tag2'],
        lastActivity: new Date().toISOString()
      }
    });
    console.log('✅ Autosave successful:', autosaveResponse.data.message);

    // 6. Test explicit save
    console.log('\n6. Testing explicit save...');
    const saveResponse = await api.put(`/projects/${projectId}/save`, {
      state: {
        currentStep: 'implementation',
        progress: 50,
        tags: ['tag1', 'tag2', 'tag3'],
        documents: ['doc1.pdf', 'doc2.pdf']
      }
    });
    console.log('✅ Save successful:', saveResponse.data.message);

    // 7. Test ownership check
    console.log('\n7. Checking project ownership...');
    const ownershipResponse = await api.get(`/projects/${projectId}/ownership`);
    console.log('✅ Ownership check:', ownershipResponse.data.isOwner);

    // 8. Test delete project (optional - uncomment to test)
    // console.log('\n8. Deleting project...');
    // const deleteResponse = await api.delete(`/projects/${projectId}`);
    // console.log('✅ Project deleted:', deleteResponse.data.message);

    console.log('\n🎉 All tests completed successfully!');

  } catch (error) {
    console.error('❌ Test failed:', error.response?.data || error.message);
  }
}

async function testValidationErrors() {
  console.log('\n🛡️ Testing validation errors...\n');

  try {
    // Test missing project name
    console.log('1. Testing missing project name...');
    try {
      await api.post('/projects', {
        clientName: 'Test Client'
      });
    } catch (error) {
      console.log('✅ Expected error for missing project name:', error.response.data.error);
    }

    // Test invalid PLC vendor
    console.log('\n2. Testing invalid PLC vendor...');
    try {
      await api.post('/projects', {
        projectName: 'Test Project',
        targetPLCVendor: 'invalid-vendor'
      });
    } catch (error) {
      console.log('✅ Expected error for invalid PLC vendor:', error.response.data.error);
    }

    // Test unauthorized access
    console.log('\n3. Testing unauthorized access...');
    try {
      const unauthorizedApi = axios.create({
        baseURL: BASE_URL,
        headers: { 'Content-Type': 'application/json' }
      });
      await unauthorizedApi.get('/projects');
    } catch (error) {
      console.log('✅ Expected error for unauthorized access:', error.response.data.error);
    }

  } catch (error) {
    console.error('❌ Validation test failed:', error.message);
  }
}

// Run tests if this script is executed directly
if (require.main === module) {
  console.log('⚠️  Please set a valid JWT token in AUTH_TOKEN variable before running tests');
  console.log('ℹ️  You can get a token by authenticating through /api/v1/auth/signin\n');
  
  // Uncomment these lines to run the tests with a valid token:
  // testProjectsAPI();
  // testValidationErrors();
}

module.exports = {
  testProjectsAPI,
  testValidationErrors
};
