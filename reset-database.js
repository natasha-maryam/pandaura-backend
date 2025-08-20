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
    console.log('\n🗑️  Dropping all tables with CASCADE...');
    
    // First, try to drop with CASCADE to handle dependencies
    for (const table of tables) {
      try {
        await db.raw(`DROP TABLE IF EXISTS "${table}" CASCADE`);
        console.log(`  ✅ Dropped table: ${table}`);
      } catch (error) {
        console.log(`  ⚠️  Could not drop ${table}:`, error.message);
      }
    }
    
    // Double-check: get remaining tables and force drop them
    const remainingResult = await db.raw(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename NOT LIKE 'pg_%' 
      AND tablename NOT LIKE 'sql_%'
    `);
    
    const remainingTables = remainingResult.rows.map(row => row.tablename);
    
    if (remainingTables.length > 0) {
      console.log('\n🔄 Force dropping remaining tables:', remainingTables.join(', '));
      
      // Drop all remaining tables in one command with CASCADE
      const tablesList = remainingTables.map(t => `"${t}"`).join(', ');
      try {
        await db.raw(`DROP TABLE IF EXISTS ${tablesList} CASCADE`);
        console.log('  ✅ Force dropped all remaining tables');
      } catch (error) {
        console.log('  ⚠️  Force drop failed:', error.message);
        
        // Last resort: drop schema and recreate
        console.log('\n🚨 Using nuclear option: dropping and recreating schema...');
        try {
          await db.raw('DROP SCHEMA public CASCADE');
          await db.raw('CREATE SCHEMA public');
          await db.raw('GRANT ALL ON SCHEMA public TO postgres');
          await db.raw('GRANT ALL ON SCHEMA public TO public');
          console.log('  ✅ Schema recreated successfully');
        } catch (schemaError) {
          console.log('  ❌ Schema recreation failed:', schemaError.message);
        }
      }
    }
    
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
