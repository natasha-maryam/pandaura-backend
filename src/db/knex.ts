import knex, { Knex } from 'knex';
import config from '../../knexfile';

const environment = process.env.NODE_ENV || 'development';
const dbConfig = config[environment];

console.log(`🗄️  Initializing database connection for environment: ${environment}`);

// Create database instance
const db: Knex = knex(dbConfig);

// Test database connection
async function testConnection() {
  try {
    await db.raw('SELECT 1+1 as result');
    console.log('✅ Database connection successful');
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    throw error;
  }
}

// Test connection on startup
testConnection().catch(err => {
  console.error('Database connection test failed:', err);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('🔄 Closing database connection...');
  await db.destroy();
  console.log('✅ Database connection closed');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('🔄 Closing database connection...');
  await db.destroy();
  console.log('✅ Database connection closed');
  process.exit(0);
});

export default db;
