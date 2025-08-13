const Database = require('better-sqlite3');

// Connect to the database
const db = new Database('./pandaura.db');

const testUserId = 'test-user-frontend';

// Insert a test project for the frontend user
try {
  const projectInsert = db.prepare(`
    INSERT INTO projects (user_id, project_name, client_name, project_type, description, target_plc_vendor) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const result = projectInsert.run(
    testUserId,
    'Frontend Test Project',
    'ACME Corporation',
    'Industrial Automation', 
    'Test project for frontend authentication flow',
    'siemens'
  );
  
  const projectId = result.lastInsertRowid;
  console.log('✅ Frontend test project created with ID:', projectId);
  console.log('👤 User ID:', testUserId);
  console.log('📋 Project Name: Frontend Test Project');
  
  console.log('\n🔗 You can now test the full flow:');
  console.log('1. Go to http://localhost:5174/signin');
  console.log('2. Login with: test@pandaura.com / test123');
  console.log('3. Navigate to projects and open "Frontend Test Project"');
  console.log('4. Click "Open Full Project Workspace"');
  console.log('5. Test the Tag Database Manager');
  
} catch (error) {
  console.error('❌ Error creating test project:', error.message);
}

db.close();
