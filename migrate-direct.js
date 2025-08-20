#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigrationsDirectly() {
  console.log('🔄 Running migrations with direct PostgreSQL connection...');
  
  // Get connection string
  const connectionString = process.env.DATABASE_URL || 
                          process.env.POSTGRES_URL || 
                          'postgresql://postgres:nqvmfspKeGFgvUcgiSMSfRvXfcXQxEva@postgres.railway.internal:5432/railway';
  
  console.log('🔍 Connection string format:', connectionString.replace(/:[^:@]*@/, ':***@'));
  
  // Create direct PostgreSQL connection
  const pool = new Pool({
    connectionString,
    ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
    max: 1,
    connectionTimeoutMillis: 30000,
    idleTimeoutMillis: 30000,
    query_timeout: 30000,
  });
  
  let client;
  
  try {
    console.log('📡 Testing direct connection...');
    client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time');
    console.log('✅ Direct connection successful:', result.rows[0].current_time);
    
    // Check if migrations table exists
    console.log('🔍 Checking migrations table...');
    const tableCheck = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'knex_migrations'
      );
    `);
    
    if (!tableCheck.rows[0].exists) {
      console.log('📋 Creating migrations table...');
      await client.query(`
        CREATE TABLE knex_migrations (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255),
          batch INTEGER,
          migration_time TIMESTAMPTZ DEFAULT NOW()
        );
      `);
      console.log('✅ Migrations table created');
    } else {
      console.log('✅ Migrations table exists');
    }
    
    // Get list of applied migrations
    const appliedMigrations = await client.query(
      'SELECT name FROM knex_migrations ORDER BY id'
    );
    console.log('📋 Applied migrations:', appliedMigrations.rows.length);
    
    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'knex-migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.ts') || file.endsWith('.js'))
      .sort();
    
    console.log('📁 Available migration files:', migrationFiles.length);
    
    const appliedNames = appliedMigrations.rows.map(row => row.name);
    const pendingMigrations = migrationFiles.filter(file => !appliedNames.includes(file));
    
    if (pendingMigrations.length === 0) {
      console.log('✅ Database is up to date');
      return;
    }
    
    console.log(`🔄 Found ${pendingMigrations.length} pending migrations`);
    
    // Note: This is a simplified approach - for full migration support,
    // you'd need to compile and execute the TypeScript migration files
    console.log('⚠️  Manual migration execution required for TypeScript files');
    console.log('📋 Pending migrations:');
    pendingMigrations.forEach(migration => {
      console.log(`  - ${migration}`);
    });
    
  } catch (error) {
    console.error('❌ Direct connection failed:', error.message);
    console.error('🔍 Error code:', error.code);
    console.error('🔍 Error details:', error);
    process.exit(1);
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
    console.log('✅ Connection closed');
  }
}

runMigrationsDirectly();
