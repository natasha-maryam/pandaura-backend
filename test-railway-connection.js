const knex = require('knex');
require('dotenv').config();

// Railway specific configuration
const config = {
  client: 'postgresql',
  connection: process.env.DATABASE_URL || process.env.POSTGRES_URL || 'postgresql://postgres:nqvmfspKeGFgvUcgiSMSfRvXfcXQxEva@postgres.railway.internal:5432/railway',
  pool: {
    min: 0,
    max: 1,
    acquireTimeoutMillis: 120000,
    createTimeoutMillis: 60000,
    destroyTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    reapIntervalMillis: 10000,
    createRetryIntervalMillis: 2000,
    propagateCreateError: false
  },
  acquireConnectionTimeout: 120000,
  asyncStackTraces: true
};

console.log('Testing Railway database connection...');
console.log('Environment:', process.env.NODE_ENV);
console.log('Connection string:', process.env.DATABASE_URL ? 'DATABASE_URL is set' : 'Using fallback connection');

const db = knex(config);

async function testConnection() {
  try {
    console.log('Attempting to connect...');
    const result = await db.raw('SELECT 1+1 as result');
    console.log('✅ Connection successful!', result.rows);
    
    // Test table existence
    console.log('Checking if migrations table exists...');
    const tableExists = await db.schema.hasTable('knex_migrations');
    console.log('Migrations table exists:', tableExists);
    
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error('Error details:', error);
  } finally {
    await db.destroy();
    console.log('Connection closed.');
  }
}

testConnection();
