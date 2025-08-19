import db from './knex';

export class DatabaseManager {
  
  /**
   * Test the database connection
   */
  static async testConnection(): Promise<boolean> {
    try {
      await db.raw('SELECT 1+1 as result');
      console.log('✅ Database connection test passed');
      return true;
    } catch (error) {
      console.error('❌ Database connection test failed:', error);
      return false;
    }
  }

  /**
   * Get database connection info (without credentials)
   */
  static async getConnectionInfo() {
    try {
      const result = await db.raw(`
        SELECT 
          current_database() as database_name,
          current_user as current_user,
          version() as version,
          inet_server_addr() as server_address,
          inet_server_port() as server_port
      `);
      
      return result.rows[0];
    } catch (error) {
      console.error('Failed to get connection info:', error);
      throw error;
    }
  }

  /**
   * Check if migrations are up to date
   */
  static async checkMigrations() {
    try {
      const [currentBatch] = await db.migrate.currentVersion();
      const migrations = await db.migrate.list();
      
      return {
        currentVersion: currentBatch,
        pendingMigrations: migrations[1], // Pending migrations
        completedMigrations: migrations[0] // Completed migrations
      };
    } catch (error) {
      console.error('Failed to check migrations:', error);
      throw error;
    }
  }

  /**
   * Run pending migrations
   */
  static async runMigrations() {
    try {
      const [batchNo, log] = await db.migrate.latest();
      
      if (log.length === 0) {
        console.log('✅ Database is already up to date');
      } else {
        console.log(`✅ Ran ${log.length} migrations:`);
        log.forEach((migration: string) => console.log(`  - ${migration}`));
      }
      
      return { batchNo, migrations: log };
    } catch (error) {
      console.error('❌ Migration failed:', error);
      throw error;
    }
  }

  /**
   * Check database health
   */
  static async healthCheck() {
    try {
      const connectionTest = await this.testConnection();
      const connectionInfo = await this.getConnectionInfo();
      const migrationStatus = await this.checkMigrations();
      
      return {
        status: connectionTest ? 'healthy' : 'unhealthy',
        connection: connectionTest,
        database: connectionInfo,
        migrations: migrationStatus,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        connection: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Gracefully close database connection
   */
  static async closeConnection() {
    try {
      await db.destroy();
      console.log('✅ Database connection closed gracefully');
    } catch (error) {
      console.error('❌ Error closing database connection:', error);
      throw error;
    }
  }
}

export default DatabaseManager;
