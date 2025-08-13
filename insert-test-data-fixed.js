const Database = require('better-sqlite3');

// Connect to the database
const db = new Database('./pandaura.db');

// Insert a test user if not exists
const testUserId = 'test-user-123';
const checkUser = db.prepare('SELECT id FROM users WHERE id = ?').get(testUserId);

if (!checkUser) {
  db.prepare(`
    INSERT OR REPLACE INTO users (id, full_name, email, password_hash, is_active) 
    VALUES (?, ?, ?, ?, ?)
  `).run(testUserId, 'Test User', 'test@pandaura.com', 'fake-hash', 1);
  
  console.log('✅ Test user created');
} else {
  console.log('ℹ️ Test user already exists');
}

// Insert a test project (note: projects.id is INTEGER and auto-increments)
const existingProject = db.prepare('SELECT id FROM projects WHERE user_id = ? LIMIT 1').get(testUserId);

let projectId;
if (!existingProject) {
  const projectInsert = db.prepare(`
    INSERT INTO projects (user_id, project_name, client_name, project_type, description, target_plc_vendor) 
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  const result = projectInsert.run(
    testUserId,
    'Test Automation Project',
    'ACME Corporation',
    'Industrial Automation', 
    'Test project for PLC programming automation',
    'siemens'
  );
  
  projectId = result.lastInsertRowid;
  console.log('✅ Test project created with ID:', projectId);
} else {
  projectId = existingProject.id;
  console.log('ℹ️ Using existing test project with ID:', projectId);
}

// Show the test data
console.log('\n📊 Test Data Summary:');
console.log('Test User ID:', testUserId);
console.log('Test Project ID:', projectId);

console.log('\n🔧 You can now test the Tags API with this project ID.');

db.close();
