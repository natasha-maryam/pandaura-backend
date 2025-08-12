#!/usr/bin/env node
/**
 * Vercel PostgreSQL Schema Deployment
 * This script specifically handles Vercel's PostgreSQL deployment
 * Run as a Vercel build hook or manually with Vercel environment variables
 */

async function deployVercelSchema() {
  console.log('🚀 Vercel PostgreSQL Schema Deployment Starting...');
  
  // Import dynamically to handle Vercel's environment
  let sql;
  try {
    const vercel = await import('@vercel/postgres');
    sql = vercel.sql;
    console.log('✅ Using @vercel/postgres');
  } catch (error) {
    console.log('⚠️ @vercel/postgres not available, falling back to pg');
    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.POSTGRES_URL,
      ssl: { rejectUnauthorized: false }
    });
    sql = {
      query: (text, params) => pool.query(text, params)
    };
  }
  
  const { readFileSync } = require('fs');
  const { join } = require('path');
  
  try {
    // Test connection
    console.log('🔗 Testing Vercel PostgreSQL connection...');
    await sql`SELECT NOW() as current_time`;
    console.log('✅ Database connection successful');
    
    // Read and parse the schema file
    const schemaPath = join(__dirname, 'migrations', 'postgresql-setup.sql');
    console.log('📄 Reading schema from:', schemaPath);
    
    let schemaSql = readFileSync(schemaPath, 'utf-8');
    console.log('📝 Schema SQL loaded:', schemaSql.length, 'characters');
    
    // Remove transaction control statements as Vercel handles them
    schemaSql = schemaSql
      .replace(/BEGIN;/g, '')
      .replace(/COMMIT;/g, '')
      .replace(/ROLLBACK;/g, '');
    
    // Split into individual statements and execute
    const statements = schemaSql
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    console.log('🔧 Executing', statements.length, 'schema statements...');
    
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];
      if (statement.trim()) {
        console.log(`Executing statement ${i + 1}/${statements.length}`);
        try {
          await sql.query(statement);
        } catch (error) {
          if (error.message.includes('already exists')) {
            console.log(`⚠️ Skipping existing: ${statement.substring(0, 50)}...`);
          } else {
            console.error(`❌ Error in statement ${i + 1}:`, error.message);
            throw error;
          }
        }
      }
    }
    
    console.log('✅ All schema statements executed successfully');
    
    // Verify deployment
    console.log('🔍 Verifying schema deployment...');
    
    const tablesResult = await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    
    console.log('📊 Tables verified:');
    tablesResult.rows.forEach(row => {
      console.log(`  ✅ ${row.table_name}`);
    });
    
    // Verify critical columns
    const orgColumns = await sql`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'organizations'
      AND column_name IN ('industry', 'size')
    `;
    
    console.log('🏢 Organizations table critical columns:');
    orgColumns.rows.forEach(row => {
      console.log(`  ✅ ${row.column_name} (${row.data_type})`);
    });
    
    console.log('🎉 Vercel schema deployment completed successfully!');
    return true;
    
  } catch (error) {
    console.error('❌ Vercel schema deployment failed:', error.message);
    throw error;
  }
}

// Export for use in other scripts or run directly
if (require.main === module) {
  deployVercelSchema().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
} else {
  module.exports = { deployVercelSchema };
}
