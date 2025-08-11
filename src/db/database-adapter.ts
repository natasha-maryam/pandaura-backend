// Environment-aware database initialization
import { initializeTables as initSQLiteTables } from './tables';
import { db as vercelDB } from './vercel-postgres';

export async function initializeTables() {
  try {
    if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
      // Use Vercel Postgres in production
      console.log('Initializing Vercel Postgres tables...');
      await vercelDB.initializeTables();
    } else {
      // Use SQLite for local development
      console.log('Initializing SQLite tables...');
      initSQLiteTables();
    }
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
    throw error;
  }
}

// Export the appropriate database instance
export const db = process.env.VERCEL || process.env.NODE_ENV === 'production' 
  ? vercelDB 
  : require('./index').default;
