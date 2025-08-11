const Database = require('better-sqlite3');
const path = require('path');

// Initialize database connection
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'pandaura.db');
const db = new Database(DB_PATH);

// Set pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Delete all data from all tables
 */
function clearAllTables() {
  console.log('🗑️  Starting to clear all tables...');
  
  try {
    // Start transaction
    const clearData = db.transaction(() => {
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
        try {
          const result = db.prepare(`DELETE FROM ${table}`).run();
          console.log(`✅ Deleted ${result.changes} rows from ${table}`);
          totalDeleted += result.changes;
        } catch (error) {
          console.log(`⚠️  Table ${table} might not exist or is empty: ${error.message}`);
        }
      }
      
      // Reset auto-increment for session_policy
      try {
        db.prepare(`DELETE FROM sqlite_sequence WHERE name = 'session_policy'`).run();
        console.log('🔄 Reset auto-increment counters');
      } catch (error) {
        console.log('ℹ️  No auto-increment counters to reset');
      }
      
      // Re-enable foreign key constraints
      db.pragma('foreign_keys = ON');
      
      console.log(`🎉 Successfully cleared all tables. Total rows deleted: ${totalDeleted}`);
      return totalDeleted;
    });
    
    return clearData();
  } catch (error) {
    console.error('❌ Error clearing tables:', error);
    throw error;
  } finally {
    db.close();
  }
}

/**
 * Get count of records in all tables
 */
function getTableCounts() {
  console.log('📊 Getting table counts...');
  
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
  
  for (const table of tables) {
    try {
      const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
      console.log(`  ${table}: ${result.count}`);
    } catch (error) {
      console.log(`  ${table}: Table doesn't exist or error - ${error.message}`);
    }
  }
}

// CLI usage
const command = process.argv[2];

switch (command) {
  case 'clear':
    clearAllTables();
    break;
  case 'counts':
    getTableCounts();
    db.close();
    break;
  default:
    console.log('🗃️  Database Management Utility');
    console.log('================================');
    console.log('Usage:');
    console.log('  node clear-database.js clear   - Delete all data from all tables');
    console.log('  node clear-database.js counts  - Show record counts for all tables');
    console.log('');
    console.log('⚠️  WARNING: The clear command will permanently delete all data!');
    db.close();
}
