"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const uuid_1 = require("uuid");
const crypto_1 = __importDefault(require("crypto"));
const db_1 = __importDefault(require("../db"));
const router = express_1.default.Router();
// Deployment test endpoints
router.get('/cors-test', (req, res) => {
    res.json({
        message: 'CORS is working correctly',
        origin: req.get('Origin'),
        timestamp: new Date().toISOString()
    });
});
router.get('/db-connection', async (req, res) => {
    try {
        if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
            // Test PostgreSQL connection
            const { sql } = require('@vercel/postgres');
            const result = await sql `SELECT 1 as test`;
            res.json({
                status: 'healthy',
                database: 'postgresql',
                connection: true,
                timestamp: new Date().toISOString()
            });
        }
        else {
            // Test SQLite connection
            const connectionTest = db_1.default.prepare('SELECT 1 as test').get();
            res.json({
                status: 'healthy',
                database: 'sqlite',
                connection: connectionTest.test === 1,
                timestamp: new Date().toISOString()
            });
        }
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            database: process.env.VERCEL ? 'postgresql' : 'sqlite',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
router.get('/env-check', (req, res) => {
    res.json({
        nodeEnv: process.env.NODE_ENV,
        isVercel: !!process.env.VERCEL,
        port: process.env.PORT,
        frontendUrl: process.env.FRONTEND_URL,
        hasJwtSecret: !!process.env.JWT_SECRET,
        timestamp: new Date().toISOString()
    });
});
// GET /test/db - Basic database health check
router.get('/db', (req, res) => {
    try {
        // Test connection
        const connectionTest = db_1.default.prepare('SELECT 1 as test').get();
        // Get table counts
        const tables = ['users', 'organizations', 'team_members', 'invites', 'audit_logs', 'device_bindings', 'projects', 'tags', 'project_tags'];
        const tableCounts = {};
        tables.forEach(table => {
            try {
                const result = db_1.default.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
                tableCounts[table] = result.count;
            }
            catch (error) {
                tableCounts[table] = -1; // -1 indicates error
            }
        });
        res.json({
            status: 'healthy',
            connection: connectionTest.test === 1,
            timestamp: new Date().toISOString(),
            tableCounts
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
// GET /test/db/tables - Get detailed table information
router.get('/db/tables', (req, res) => {
    try {
        const tablesInfo = db_1.default.prepare(`
      SELECT name, type 
      FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
        const detailedInfo = tablesInfo.map((table) => {
            try {
                // Get column info
                const columns = db_1.default.prepare(`PRAGMA table_info(${table.name})`).all();
                // Get row count
                const rowCount = db_1.default.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get();
                return {
                    name: table.name,
                    type: table.type,
                    columns: columns.length,
                    rows: rowCount.count,
                    columnDetails: columns
                };
            }
            catch (error) {
                return {
                    name: table.name,
                    type: table.type,
                    error: error.message
                };
            }
        });
        res.json({
            status: 'success',
            tables: detailedInfo,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
// GET /test/db/sample/:table - Get sample data from a specific table
router.get('/db/sample/:table', (req, res) => {
    const { table } = req.params;
    const limit = parseInt(req.query.limit) || 5;
    // Security: only allow specific tables
    const allowedTables = ['users', 'organizations', 'team_members', 'invites', 'audit_logs', 'device_bindings', 'projects', 'tags', 'project_tags'];
    if (!allowedTables.includes(table)) {
        return res.status(400).json({
            status: 'error',
            message: 'Table not allowed'
        });
    }
    try {
        const sampleData = db_1.default.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT ?`).all(limit);
        res.json({
            status: 'success',
            table,
            count: sampleData.length,
            data: sampleData,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
// GET /test/table-check - Simple test endpoint to verify table access
router.get('/table-check/:table', (req, res) => {
    const { table } = req.params;
    const allowedTables = ['users', 'organizations', 'team_members', 'invites', 'audit_logs', 'device_bindings', 'projects', 'tags', 'project_tags'];
    try {
        if (!allowedTables.includes(table)) {
            return res.json({
                status: 'error',
                message: `Table '${table}' not in allowed list`,
                allowedTables,
                requestedTable: table
            });
        }
        const count = db_1.default.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        const sample = db_1.default.prepare(`SELECT * FROM ${table} LIMIT 3`).all();
        res.json({
            status: 'success',
            table,
            count: count.count,
            sample,
            allowedTables,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        res.json({
            status: 'error',
            table,
            error: error.message,
            allowedTables,
            timestamp: new Date().toISOString()
        });
    }
});
// POST /test/generate-invite - Generate test invite codes
router.post('/generate-invite', async (req, res) => {
    const { orgId, email, role = 'Viewer', expiresInDays = 7 } = req.body;
    if (!orgId || !email) {
        return res.status(400).json({ error: 'Organization ID and email are required' });
    }
    try {
        // Verify organization exists
        const orgStmt = db_1.default.prepare('SELECT name FROM organizations WHERE id = ?');
        const org = orgStmt.get(orgId);
        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        // Generate invite code and calculate expiration
        const code = crypto_1.default.randomBytes(16).toString('hex').toUpperCase();
        const expiresAt = Math.floor(Date.now() / 1000) + (expiresInDays * 24 * 60 * 60);
        // Create invite
        const inviteStmt = db_1.default.prepare(`
      INSERT INTO invites (id, org_id, email, code, role, expires_at) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
        const inviteId = (0, uuid_1.v4)();
        inviteStmt.run(inviteId, orgId, email.toLowerCase(), code, role, expiresAt);
        res.json({
            message: 'Invite generated successfully',
            inviteCode: code,
            orgName: org.name,
            email: email.toLowerCase(),
            role,
            expiresAt,
            inviteLink: `${req.protocol}://${req.get('host')}/signup?invite=${code}`
        });
    }
    catch (err) {
        console.error('Error generating invite:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// GET /test/debug-data - Enhanced debug data endpoint for comprehensive table inspection (list all tables)
router.get('/debug-data', async (req, res) => {
    try {
        // Security: define allowed tables for debugging
        const allowedTables = [
            'users',
            'organizations',
            'team_members',
            'invites',
            'audit_logs',
            'device_bindings',
            'projects',
            'tags',
            'project_tags'
        ];
        const tableInfo = {};
        for (const tableName of allowedTables) {
            try {
                const countResult = db_1.default.prepare(`SELECT COUNT(*) as count FROM ${tableName}`).get();
                const sampleResult = db_1.default.prepare(`SELECT * FROM ${tableName} LIMIT 1`).get();
                tableInfo[tableName] = {
                    count: countResult.count,
                    hasData: countResult.count > 0,
                    sampleFields: sampleResult ? Object.keys(sampleResult) : []
                };
            }
            catch (error) {
                tableInfo[tableName] = {
                    count: 0,
                    hasData: false,
                    error: error.message,
                    sampleFields: []
                };
            }
        }
        return res.json({
            status: 'success',
            message: 'Available tables for debugging',
            tables: tableInfo,
            usage: 'Use /api/v1/test/debug-data/{table-name} to get specific table data',
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Debug data error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
// GET /test/debug-data/:table - Enhanced debug data endpoint for specific table
router.get('/debug-data/:table', async (req, res) => {
    try {
        const { table } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        const offset = parseInt(req.query.offset) || 0;
        // Security: define allowed tables for debugging
        const allowedTables = [
            'users',
            'organizations',
            'team_members',
            'invites',
            'audit_logs',
            'device_bindings',
            'projects',
            'tags',
            'project_tags'
        ];
        // Validate table name
        if (!allowedTables.includes(table)) {
            return res.status(400).json({
                status: 'error',
                message: `Table '${table}' not allowed. Available tables: ${allowedTables.join(', ')}`,
                allowedTables,
                timestamp: new Date().toISOString()
            });
        }
        // Get total count
        const countResult = db_1.default.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
        const totalCount = countResult.count;
        // Get paginated data
        const rows = db_1.default.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(limit, offset);
        // Get table schema information
        const schemaInfo = db_1.default.prepare(`PRAGMA table_info(${table})`).all();
        res.json({
            status: 'success',
            table,
            totalCount,
            returnedCount: rows.length,
            limit,
            offset,
            hasMore: (offset + limit) < totalCount,
            schema: schemaInfo,
            data: rows,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Debug data error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
// GET /test/debug-data-all - Get all data from all tables (use with caution)
router.get('/debug-data-all', async (req, res) => {
    try {
        const limitPerTable = parseInt(req.query.limit) || 5;
        const allowedTables = [
            'users',
            'organizations',
            'team_members',
            'invites',
            'audit_logs',
            'device_bindings',
            'projects',
            'tags',
            'project_tags'
        ];
        const allData = {};
        for (const table of allowedTables) {
            try {
                const rows = db_1.default.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT ?`).all(limitPerTable);
                const countResult = db_1.default.prepare(`SELECT COUNT(*) as count FROM ${table}`).get();
                allData[table] = {
                    count: countResult.count,
                    sample: rows
                };
            }
            catch (error) {
                allData[table] = {
                    count: 0,
                    error: error.message,
                    sample: []
                };
            }
        }
        res.json({
            status: 'success',
            message: `Debug data from all tables (${limitPerTable} records per table)`,
            database: 'sqlite',
            dbPath: process.env.DB_PATH || './pandaura.db',
            tables: allData,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('Debug data all error:', error);
        res.status(500).json({
            status: 'error',
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
exports.default = router;
