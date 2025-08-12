#!/usr/bin/env node
/**
 * Production Schema Deployment Script
 * This script forces the PostgreSQL schema update in production
 * Run with: NODE_ENV=production POSTGRES_URL=your_db_url node deploy-schema.js
 */

const { Pool } = require('pg');
const { readFileSync } = require('fs');
const { join } = require('path');

async function deploySchema() {
  console.log('🚀 Starting PostgreSQL schema deployment...');
  
  if (!process.env.POSTGRES_URL) {
    console.error('❌ POSTGRES_URL environment variable is required');
    process.exit(1);
  }
  
  const pool = new Pool({
    connectionString: process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    console.log('🔗 Connecting to PostgreSQL database...');
    
    // Test connection
    await pool.query('SELECT NOW()');
    console.log('✅ Database connection successful');
    
    // Read the schema file
    const schemaPath = join(__dirname, 'migrations/postgresql-setup.sql');
    console.log('📄 Reading schema from:', schemaPath);
    
    const schemaSql = readFileSync(schemaPath, 'utf-8');
    console.log('📝 Schema SQL loaded:', schemaSql.length, 'characters');
    
    // Execute the schema deployment
    console.log('🔧 Executing schema deployment...');
    await pool.query('BEGIN');
    
    try {
      await pool.query(schemaSql);
      await pool.query('COMMIT');
      console.log('✅ Schema deployment successful');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
    
    // Verify tables
    console.log('🔍 Verifying table structure...');
    
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);
    
    console.log('📊 Tables in database:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_name}`);
    });
    
    // Verify organizations table columns
    const orgColumns = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'organizations'
      ORDER BY ordinal_position
    `);
    
    console.log('🏢 Organizations table columns:');
    orgColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type}) ${row.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
    });
    
    // Verify temp_device_bindings constraints
    const constraints = await pool.query(`
      SELECT constraint_name, constraint_type
      FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'temp_device_bindings'
    `);
    
    console.log('🔒 temp_device_bindings constraints:');
    constraints.rows.forEach(row => {
      console.log(`  - ${row.constraint_name} (${row.constraint_type})`);
    });
    
    console.log('🎉 Schema deployment completed successfully!');
    console.log('✅ Production database is now ready for deployment');
    
  } catch (error) {
    console.error('❌ Schema deployment failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Check if running directly
if (require.main === module) {
  deploySchema();
} else {
  module.exports = { deploySchema };
}
