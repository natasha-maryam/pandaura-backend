#!/usr/bin/env node

require('dotenv').config();
const knex = require('knex');
const config = require('./dist/knexfile').default;

async function resetDatabase() {
  const environment = process.env.NODE_ENV || 'production';
  console.log(`🗑️  Resetting database in ${environment} environment...`);
  
  const dbConfig = {
    ...config[environment],
    pool: {
      min: 0,
      max: 1,
      acquireTimeoutMillis: 60000,
      createTimeoutMillis: 30000,
      destroyTimeoutMillis: 10000,
      idleTimeoutMillis: 60000,
    },
    acquireConnectionTimeout: 60000,
  };
  
  const db = knex(dbConfig);
  
  try {
    console.log('📡 Connecting to database...');
    await db.raw('SELECT 1');
    console.log('✅ Connected successfully');
    
    console.log('\n🔍 Finding all tables...');
    const result = await db.raw(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%' 
      AND tablename NOT LIKE 'sql_%'
    `);
    
    const tables = result.rows.map(row => row.tablename);
    console.log('📋 Found tables:', tables);
    
    if (tables.length === 0) {
      console.log('✅ Database is already empty');
      return;
    }
    
    console.log('\n⚠️  WARNING: This will delete ALL data in the database!');
    console.log('Tables to be dropped:', tables.join(', '));
    
    // Drop all tables
    console.log('\n🗑️  Dropping all tables...');
    
    // Disable foreign key checks temporarily
    await db.raw('SET session_replication_role = replica;');
    
    for (const table of tables) {
      try {
        await db.schema.dropTableIfExists(table);
        console.log(`  ✅ Dropped table: ${table}`);
      } catch (error) {
        console.log(`  ⚠️  Could not drop ${table}:`, error.message);
      }
    }
    
    // Re-enable foreign key checks
    await db.raw('SET session_replication_role = DEFAULT;');
    
    console.log('\n✅ Database reset complete!');
    console.log('💡 You can now run: npm run migrate:railway');
    
  } catch (error) {
    console.error('❌ Database reset failed:', error.message);
    console.error('Full error:', error);
    process.exit(1);
  } finally {
    await db.destroy();
    console.log('🔄 Database connection closed');
  }
}

resetDatabase();
