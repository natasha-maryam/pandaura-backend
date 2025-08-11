import db from '../db/index';

/**
 * Delete all data from all tables in the database
 * This will preserve the table structure but remove all records
 */
export function clearAllTables() {
  console.log('🗑️  Starting to clear all tables...');
  
  try {
    // Start transaction
    const transaction = db.transaction(() => {
      // Disable foreign key constraints temporarily
      db.pragma('foreign_keys = OFF');
      
      // Delete data from all tables in the correct order (considering foreign keys)
      const tables = [
        'audit_logs',
        'temp_device_bindings', 
        'device_bindings',
        'invites',
        'team_members',
        'users',
        'organizations',
        'session_policy'
      ];
      
      let totalDeleted = 0;
      
      for (const table of tables) {
        const result = db.prepare(`DELETE FROM ${table}`).run();
        console.log(`✅ Deleted ${result.changes} rows from ${table}`);
        totalDeleted += result.changes;
      }
      
      // Re-enable foreign key constraints
      db.pragma('foreign_keys = ON');
      
      console.log(`🎉 Successfully cleared all tables. Total rows deleted: ${totalDeleted}`);
      return totalDeleted;
    });
    
    return transaction();
  } catch (error) {
    console.error('❌ Error clearing tables:', error);
    throw error;
  }
}

/**
 * Delete all data and reset auto-increment counters
 */
export function clearAllTablesWithReset() {
  console.log('🗑️  Starting to clear all tables and reset counters...');
  
  try {
    const transaction = db.transaction(() => {
      // Disable foreign key constraints
      db.pragma('foreign_keys = OFF');
      
      // For SQLite, we use DELETE instead of TRUNCATE
      const tables = [
        'audit_logs',
        'temp_device_bindings',
        'device_bindings', 
        'invites',
        'team_members',
        'users',
        'organizations',
        'session_policy'
      ];
      
      let totalDeleted = 0;
      
      for (const table of tables) {
        const result = db.prepare(`DELETE FROM ${table}`).run();
        console.log(`✅ Deleted ${result.changes} rows from ${table}`);
        totalDeleted += result.changes;
      }
      
      // Reset sqlite_sequence for tables with AUTOINCREMENT (only session_policy in your case)
      db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'session_policy'`).run();
      console.log('🔄 Reset auto-increment counters');
      
      // Re-enable foreign key constraints
      db.pragma('foreign_keys = ON');
      
      console.log(`🎉 Successfully cleared all tables and reset counters. Total rows deleted: ${totalDeleted}`);
      return totalDeleted;
    });
    
    return transaction();
  } catch (error) {
    console.error('❌ Error clearing tables:', error);
    throw error;
  }
}

/**
 * Delete data from specific tables
 */
export function clearSpecificTables(tableNames: string[]) {
  console.log(`🗑️  Starting to clear tables: ${tableNames.join(', ')}`);
  
  try {
    const transaction = db.transaction(() => {
      db.pragma('foreign_keys = OFF');
      
      let totalDeleted = 0;
      
      for (const table of tableNames) {
        const result = db.prepare(`DELETE FROM ${table}`).run();
        console.log(`✅ Deleted ${result.changes} rows from ${table}`);
        totalDeleted += result.changes;
      }
      
      db.pragma('foreign_keys = ON');
      
      console.log(`🎉 Successfully cleared specified tables. Total rows deleted: ${totalDeleted}`);
      return totalDeleted;
    });
    
    return transaction();
  } catch (error) {
    console.error('❌ Error clearing specified tables:', error);
    throw error;
  }
}

/**
 * Get count of records in all tables
 */
export function getTableCounts() {
  const tables = [
    'organizations',
    'users', 
    'team_members',
    'invites',
    'device_bindings',
    'audit_logs',
    'session_policy',
    'temp_device_bindings'
  ];
  
  const counts: Record<string, number> = {};
  
  for (const table of tables) {
    try {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
      counts[table] = result.count;
    } catch (error) {
      console.warn(`⚠️  Could not get count for table ${table}:`, error);
      counts[table] = -1;
    }
  }
  
  return counts;
}

// CLI usage - check if this file is being run directly
if (require.main === module) {
  const command = process.argv[2];
  
  switch (command) {
    case 'clear':
      clearAllTables();
      break;
    case 'clear-reset':
      clearAllTablesWithReset();
      break;
    case 'counts':
      console.log('📊 Table counts:');
      const counts = getTableCounts();
      Object.entries(counts).forEach(([table, count]) => {
        console.log(`  ${table}: ${count >= 0 ? count : 'Error'}`);
      });
      break;
    default:
      console.log('Usage:');
      console.log('  npx ts-node src/utils/clearDatabase.ts clear        - Delete all data');
      console.log('  npx ts-node src/utils/clearDatabase.ts clear-reset  - Delete all data and reset counters');
      console.log('  npx ts-node src/utils/clearDatabase.ts counts       - Show record counts');
  }
}
