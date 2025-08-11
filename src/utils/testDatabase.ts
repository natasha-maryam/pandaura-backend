import db from '../db';

interface DatabaseStats {
  tableName: string;
  recordCount: number;
  sampleData?: any[];
}

export function testDatabaseConnection(): boolean {
  try {
    // Simple query to test connection
    const result = db.prepare('SELECT 1 as test').get() as { test: number } | undefined;
    return result?.test === 1;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}

export function getDatabaseStats(): DatabaseStats[] {
  const tables = [
    'users',
    'organizations', 
    'team_members',
    'invites',
    'audit_logs',
    'device_bindings'
  ];

  const stats: DatabaseStats[] = [];

  for (const tableName of tables) {
    try {
      // Get record count
      const countResult = db.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get() as { count: number };
      
      // Get sample data (first 3 records)
      const sampleData = db.prepare(`SELECT * FROM ${tableName} LIMIT 3`).all();
      
      stats.push({
        tableName,
        recordCount: countResult.count,
        sampleData: sampleData.length > 0 ? sampleData : undefined
      });
    } catch (error) {
      console.error(`Error querying table ${tableName}:`, error);
      stats.push({
        tableName,
        recordCount: -1, // -1 indicates error
        sampleData: undefined
      });
    }
  }

  return stats;
}

export function testSpecificUserData(email: string): any {
  try {
    const user = db.prepare(`
      SELECT id, full_name, email, is_active, created_at, updated_at 
      FROM users 
      WHERE email = ?
    `).get(email);
    
    return user || null;
  } catch (error) {
    console.error('Error fetching user:', error);
    return null;
  }
}

export function testOrganizationData(userId: string): any {
  try {
    const orgData = db.prepare(`
      SELECT 
        o.id as org_id,
        o.name as org_name,
        o.industry,
        tm.role as user_role,
        tm.joined_at
      FROM organizations o
      JOIN team_members tm ON o.id = tm.org_id
      WHERE tm.user_id = ?
    `).all(userId);
    
    return orgData;
  } catch (error) {
    console.error('Error fetching organization data:', error);
    return [];
  }
}

// Main test function
export function runDatabaseTests(): void {
  console.log('=== DATABASE TESTS ===\n');
  
  // Test 1: Connection
  console.log('1. Testing database connection...');
  const isConnected = testDatabaseConnection();
  console.log(`   Connection: ${isConnected ? '✅ SUCCESS' : '❌ FAILED'}\n`);
  
  if (!isConnected) {
    return;
  }
  
  // Test 2: Database stats
  console.log('2. Database statistics:');
  const stats = getDatabaseStats();
  stats.forEach(stat => {
    console.log(`   ${stat.tableName}: ${stat.recordCount} records`);
    if (stat.sampleData && stat.sampleData.length > 0) {
      console.log(`     Sample: ${JSON.stringify(stat.sampleData[0], null, 2)}`);
    }
  });
  console.log();
  
  // Test 3: Specific user test
  console.log('3. Testing specific user data...');
  const testUser = testSpecificUserData('admin@gmail.com');
  if (testUser) {
    console.log('   ✅ User found:', testUser);
    
    // Test user's organization memberships
    console.log('4. Testing user organization memberships...');
    const userOrgs = testOrganizationData(testUser.id);
    console.log(`   User belongs to ${userOrgs.length} organization(s):`, userOrgs);
  } else {
    console.log('   ❌ User not found');
  }
  
  console.log('\n=== TESTS COMPLETE ===');
}

// Export for direct execution
if (require.main === module) {
  runDatabaseTests();
}
