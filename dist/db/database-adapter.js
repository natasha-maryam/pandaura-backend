"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.initializeTables = initializeTables;
// Environment-aware database initialization
const tables_1 = require("./tables");
const postgres_1 = require("./postgres");
async function initializeTables() {
    try {
        if (process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
            // Use PostgreSQL in production (Vercel or Railway)
            // console.log('Initializing PostgreSQL tables...');
            await postgres_1.db.initializeTables();
        }
        else {
            // Use SQLite for local development
            // console.log('Initializing SQLite tables...');
            (0, tables_1.initializeTables)();
        }
    }
    catch (error) {
        console.error('Failed to initialize database tables:', error);
        throw error;
    }
}
// Export the appropriate database instance
exports.db = process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production'
    ? postgres_1.db
    : require('./index').default;
