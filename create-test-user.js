const Database = require('better-sqlite3');
const crypto = require('crypto');

// Connect to the database
const db = new Database('./pandaura.db');

// Hash function (matching the backend implementation)
function hashPassword(password) {
  return crypto.pbkdf2Sync(password, 'pandaura-salt', 1000, 64, 'sha512').toString('hex');
}

// Create a test user for frontend authentication
const testEmail = 'test@pandaura.com';
const testPassword = 'test123';
const hashedPassword = hashPassword(testPassword);

// Insert test user
try {
  const userId = 'test-user-frontend';
  
  // Create user
  db.prepare(`
    INSERT OR REPLACE INTO users (id, full_name, email, password_hash, is_active) 
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, 'Test Frontend User', testEmail, hashedPassword, 1);
  
  // Create organization 
  const orgId = 'test-org-frontend';
  db.prepare(`
    INSERT OR REPLACE INTO organizations (id, name, industry, size) 
    VALUES (?, ?, ?, ?)
  `).run(orgId, 'Test Organization', 'Technology', 'Small');
  
  // Add user to organization
  db.prepare(`
    INSERT OR REPLACE INTO team_members (user_id, org_id, role) 
    VALUES (?, ?, ?)
  `).run(userId, orgId, 'Admin');
  
  console.log('✅ Test user created successfully!');
  console.log('📧 Email:', testEmail);
  console.log('🔑 Password:', testPassword);
  console.log('👤 User ID:', userId);
  console.log('🏢 Organization ID:', orgId);
  console.log('');
  console.log('🔗 You can now log in to the frontend using these credentials:');
  console.log(`   Email: ${testEmail}`);
  console.log(`   Password: ${testPassword}`);
  
} catch (error) {
  console.error('❌ Error creating test user:', error.message);
}

db.close();
