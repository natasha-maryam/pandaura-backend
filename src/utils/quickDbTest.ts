import db from '../db';

// Simple queries to test data
console.log('=== QUICK DATABASE TESTS ===\n');

// Test 1: Count all records
console.log('📊 Record Counts:');
const tables = ['users', 'organizations', 'team_members', 'invites', 'audit_logs', 'device_bindings'];

tables.forEach(table => {
  try {
    const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
    console.log(`   ${table}: ${result.count} records`);
  } catch (error) {
    console.log(`   ${table}: ERROR - ${(error as Error).message}`);
  }
});

console.log('\n📋 Latest Activity:');

// Test 2: Latest user
try {
  const latestUser = db.prepare(`
    SELECT full_name, email, created_at 
    FROM users 
    ORDER BY created_at DESC 
    LIMIT 1
  `).get();
  console.log('   Latest user:', latestUser);
} catch (error) {
  console.log('   Latest user: ERROR');
}

// Test 3: Latest organization
try {
  const latestOrg = db.prepare(`
    SELECT name, industry, created_at 
    FROM organizations 
    ORDER BY created_at DESC 
    LIMIT 1
  `).get();
  console.log('   Latest org:', latestOrg);
} catch (error) {
  console.log('   Latest org: ERROR');
}

// Test 4: Latest audit log
try {
  const latestAudit = db.prepare(`
    SELECT action, created_at 
    FROM audit_logs 
    ORDER BY created_at DESC 
    LIMIT 1
  `).get();
  console.log('   Latest audit:', latestAudit);
} catch (error) {
  console.log('   Latest audit: ERROR');
}

console.log('\n✅ Database tests completed!');
