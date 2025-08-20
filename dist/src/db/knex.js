"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const knex_1 = __importDefault(require("knex"));
const knexfile_1 = __importDefault(require("../knexfile"));
const environment = process.env.NODE_ENV || 'development';
const dbConfig = knexfile_1.default[environment];
console.log(`🗄️  Initializing database connection for environment: ${environment}`);
// Create database instance
const db = (0, knex_1.default)(dbConfig);
// Test database connection
async function testConnection() {
    try {
        await db.raw('SELECT 1+1 as result');
        console.log('✅ Database connection successful');
    }
    catch (error) {
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
exports.default = db;
