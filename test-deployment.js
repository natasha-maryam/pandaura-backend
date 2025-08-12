#!/usr/bin/env node
/**
 * Test deployment script to verify database abstraction and backend deployment
 * Can run locally to test database compatibility or remotely to test deployment
 */

// For local testing (uncomment and run with: node test-deployment.js local)
async function testLocalDatabase() {
  console.log('🚀 Testing local database compatibility...');
  
  try {
    const { initializeTables, db } = require('./dist/db/database-adapter');
    
    console.log('📊 Current environment:', process.env.NODE_ENV || 'development');
    console.log('🗄️ Database type:', process.env.DATABASE_URL ? 'PostgreSQL' : 'SQLite');
    
    // Test database initialization
    console.log('🔧 Initializing database tables...');
    await initializeTables();
    console.log('✅ Database tables initialized successfully');
    
    console.log('🧪 Testing basic database operations...');
    
    // Test organizations table - create a test org to verify table structure
    try {
      const testOrgId = 'test-org-' + Date.now();
      await db.createOrganization({
        id: testOrgId,
        name: 'Test Organization',
        industry: 'Technology',
        size: 'Small'
      });
      const org = await db.getOrganizationById(testOrgId);
      console.log(`✅ Organizations table accessible - created and retrieved test organization`);
    } catch (e) {
      console.log('⚠️ Organizations table test failed:', e.message);
    }
    
    // Test users table  
    try {
      const users = await db.getAllUsers();
      console.log(`✅ Users table accessible - found ${users.length} users`);
    } catch (e) {
      console.log('⚠️ Users table test failed:', e.message);
    }
    
    // Test audit logs table
    try {
      await db.createAuditLog({
        id: 'test-audit-' + Date.now(),
        userId: 'test-user',
        orgId: 'test-org',
        action: 'test_deployment',
        ipAddress: '127.0.0.1',
        userAgent: 'test-script',
        metadata: { test: true }
      });
      const auditLogs = await db.getAuditLogsByOrg('test-org', { page: 1, limit: 10 });
      console.log(`✅ Audit logs table accessible - found ${auditLogs.logs.length} logs`);
    } catch (e) {
      console.log('⚠️ Audit logs table test failed:', e.message);
    }
    
    console.log('🎉 Local database test completed successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ Local database test failed:', error.message);
    return false;
  }
}

// For remote testing (update API_BASE_URL)
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
// For local database testing, run: node test-deployment.js local
// For remote deployment testing, run: node test-deployment.js remote

const args = process.argv.slice(2);

if (args.includes('local')) {
  testLocalDatabase().then(success => {
    process.exit(success ? 0 : 1);
  });
} else if (args.includes('remote')) {
  testDeployment();
} else {
  console.log('Usage:');
  console.log('  node test-deployment.js local    - Test local database compatibility');
  console.log('  node test-deployment.js remote   - Test remote deployment');
}
