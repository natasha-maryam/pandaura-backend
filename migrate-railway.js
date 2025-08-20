#!/usr/bin/env node

// Load environment variables from .env file
require('dotenv').config();

const knex = require('knex');
const config = require('./dist/knexfile').default;

async function runMigrations() {
  const environment = process.env.NODE_ENV || 'production';
  console.log(`🔄 Running migrations in ${environment} environment...`);
  
  // Debug connection info
  console.log('🔍 Connection details:');
  console.log('- DATABASE_URL set:', !!process.env.DATABASE_URL);
  console.log('- POSTGRES_URL set:', !!process.env.POSTGRES_URL);
  
  // Show what connection string is being used (masked for security)
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || 'fallback';
  if (connectionString !== 'fallback') {
    const maskedUrl = connectionString.replace(/:[^:@]+@/, ':****@');
    console.log('- Using connection string:', maskedUrl);
  } else {
    console.log('- Using fallback connection string (this might be the issue!)');
    console.log('- Please set DATABASE_URL or POSTGRES_URL environment variable');
  }
  
  // Enhanced configuration for Railway
  const dbConfig = {
    ...config[environment],
    pool: {
      ...config[environment].pool,
      min: 0,
      max: 1, // Use single connection for migrations
      acquireTimeoutMillis: 60000, // Reduced to 1 minute
      createTimeoutMillis: 30000,  // 30 seconds
      destroyTimeoutMillis: 10000,
      idleTimeoutMillis: 60000,
    },
    acquireConnectionTimeout: 60000, // 1 minute
    debug: true, // Enable debug logging
  };
  
  console.log('🔧 Database config:', {
    client: dbConfig.client,
    pool: dbConfig.pool,
    hasConnection: !!dbConfig.connection
  });
  
  const db = knex(dbConfig);
  
  try {
    console.log('📡 Testing database connection...');
    console.log('🔍 Using connection config:', {
      type: typeof dbConfig.connection,
      isString: typeof dbConfig.connection === 'string',
      hasConnectionString: !!(dbConfig.connection?.connectionString)
    });
    
    // Add a timeout wrapper for the connection test
    const connectionTest = async () => {
      const result = await db.raw('SELECT 1 as test');
      return result;
    };
    
    // Race between connection test and timeout (increased to 60 seconds)
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Connection test timeout after 60 seconds')), 60000);
    });
    
    await Promise.race([connectionTest(), timeoutPromise]);
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
