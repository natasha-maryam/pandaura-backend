// Environment-aware database initialization
import { initializeTables as initSQLiteTables } from './tables';
import { db as postgresDB } from './postgres';

export async function initializeTables() {
  try {
    if (process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
      // Use PostgreSQL in production (Vercel or Railway)
      // console.log('Initializing PostgreSQL tables...');
      await postgresDB.initializeTables();
    } else {
      // Use SQLite for local development
      // console.log('Initializing SQLite tables...');
      initSQLiteTables();
    }
  } catch (error) {
    console.error('Failed to initialize database tables:', error);
    throw error;
  }
}

// Export the appropriate database instance
export const db = process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production' 
  ? postgresDB 
  : require('./index').default;
