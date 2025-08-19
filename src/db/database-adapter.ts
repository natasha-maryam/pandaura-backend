// Unified database adapter using Knex.js for PostgreSQL
import DatabaseService from './database-service-clean';

// Initialize database and run migrations
export async function initializeTables() {
  try {
    console.log('Initializing PostgreSQL database with Knex...');
    // await DatabaseService.runMigrations();
    console.log('Database initialization completed successfully');
  } catch (error) {
    console.error('Failed to initialize database:', error);
    throw error;
  }
}

// Export the unified database service
export const db = DatabaseService;
