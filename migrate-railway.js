#!/usr/bin/env node

const knex = require('knex');
const config = require('./dist/knexfile').default;

async function runMigrations() {
  const environment = process.env.NODE_ENV || 'production';
  console.log(`🔄 Running migrations in ${environment} environment...`);
  
  // Enhanced configuration for Railway
  const dbConfig = {
    ...config[environment],
    pool: {
      ...config[environment].pool,
      min: 0,
      max: 1, // Use single connection for migrations
      acquireTimeoutMillis: 300000, // 5 minutes
      createTimeoutMillis: 120000,  // 2 minutes
      destroyTimeoutMillis: 20000,
      idleTimeoutMillis: 300000,
    },
    acquireConnectionTimeout: 300000,
  };
  
  const db = knex(dbConfig);
  
  try {
    console.log('📡 Testing database connection...');
    await db.raw('SELECT 1');
    console.log('✅ Database connection successful');
    
    console.log('🔄 Running migrations...');
    const [batchNo, migrationsList] = await db.migrate.latest();
    
    if (migrationsList.length === 0) {
      console.log('✅ Database is already up to date');
    } else {
      console.log(`✅ Migrations completed successfully!`);
      console.log(`📊 Batch: ${batchNo}`);
      console.log(`📋 Applied migrations:`);
      migrationsList.forEach(migration => {
        console.log(`  - ${migration}`);
      });
    }
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.error('🔍 Error details:', error);
    process.exit(1);
  } finally {
    console.log('🔄 Closing database connection...');
    await db.destroy();
    console.log('✅ Database connection closed');
  }
}

runMigrations();
