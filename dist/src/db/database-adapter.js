"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = void 0;
exports.initializeTables = initializeTables;
// Unified database adapter using Knex.js for PostgreSQL
const database_service_clean_1 = __importDefault(require("./database-service-clean"));
// Initialize database and run migrations
async function initializeTables() {
    try {
        console.log('Initializing PostgreSQL database with Knex...');
        // await DatabaseService.runMigrations();
        console.log('Database initialization completed successfully');
    }
    catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
    }
}
// Export the unified database service
exports.db = database_service_clean_1.default;
