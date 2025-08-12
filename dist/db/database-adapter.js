"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rawDb = exports.db = void 0;
exports.initializeTables = initializeTables;
// Environment-aware database initialization with abstraction layer
const tables_1 = require("./tables");
const postgres_1 = require("./postgres");
const database_abstraction_1 = require("./database-abstraction");
async function initializeTables() {
    try {
        if (process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production') {
            // Use PostgreSQL in production (Vercel or Railway)
            console.log('Initializing PostgreSQL tables...');
            await postgres_1.db.initializeTables();
        }
        else {
            // Use SQLite for local development
            console.log('Initializing SQLite tables...');
            (0, tables_1.initializeTables)();
        }
    }
    catch (error) {
        console.error('Failed to initialize database tables:', error);
        throw error;
    }
}
// Determine which database to use
const isProduction = process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
// Log which database is being used
if (isProduction) {
    console.log('🐘 Using PostgreSQL database for production environment');
    console.log('Environment flags:', {
        VERCEL: !!process.env.VERCEL,
        RAILWAY_ENVIRONMENT: !!process.env.RAILWAY_ENVIRONMENT,
        NODE_ENV: process.env.NODE_ENV
    });
}
else {
    console.log('🗄️ Using SQLite database for development environment');
    console.log('Database path:', process.env.DB_PATH || 'default');
}
// Export the unified database adapter that works for both SQLite and PostgreSQL
exports.db = database_abstraction_1.dbAdapter;
// Keep the raw database exports for any legacy code that might need them
exports.rawDb = isProduction ? postgres_1.db : require('./index').default;
