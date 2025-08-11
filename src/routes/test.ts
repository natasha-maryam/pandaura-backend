import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import db from '../db';

const router = express.Router();

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
      // Test Vercel Postgres connection
      const { sql } = require('@vercel/postgres');
      const result = await sql`SELECT 1 as test`;
      res.json({
        status: 'healthy',
        database: 'vercel-postgres',
        connection: true,
        timestamp: new Date().toISOString()
      });
    } else {
      // Test SQLite connection
      const connectionTest = db.prepare('SELECT 1 as test').get() as { test: number };
      res.json({
        status: 'healthy',
        database: 'sqlite',
        connection: connectionTest.test === 1,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.status(500).json({
      status: 'error',
      database: process.env.VERCEL ? 'vercel-postgres' : 'sqlite',
      message: (error as Error).message,
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
    const connectionTest = db.prepare('SELECT 1 as test').get() as { test: number };
    
    // Get table counts
    const tables = ['users', 'organizations', 'team_members', 'invites', 'audit_logs', 'device_bindings'];
    const tableCounts: Record<string, number> = {};
    
    tables.forEach(table => {
      try {
        const result = db.prepare(`SELECT COUNT(*) as count FROM ${table}`).get() as { count: number };
        tableCounts[table] = result.count;
      } catch (error) {
        tableCounts[table] = -1; // -1 indicates error
      }
    });
    
    res.json({
      status: 'healthy',
      connection: connectionTest.test === 1,
      timestamp: new Date().toISOString(),
      tableCounts
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: (error as Error).message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /test/db/tables - Get detailed table information
router.get('/db/tables', (req, res) => {
  try {
    const tablesInfo = db.prepare(`
      SELECT name, type 
      FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all();
    
    const detailedInfo = tablesInfo.map((table: any) => {
      try {
        // Get column info
        const columns = db.prepare(`PRAGMA table_info(${table.name})`).all();
        
        // Get row count
        const rowCount = db.prepare(`SELECT COUNT(*) as count FROM ${table.name}`).get() as { count: number };
        
        return {
          name: table.name,
          type: table.type,
          columns: columns.length,
          rows: rowCount.count,
          columnDetails: columns
        };
      } catch (error) {
        return {
          name: table.name,
          type: table.type,
          error: (error as Error).message
        };
      }
    });
    
    res.json({
      status: 'success',
      tables: detailedInfo,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: (error as Error).message,
      timestamp: new Date().toISOString()
    });
  }
});

// GET /test/db/sample/:table - Get sample data from a specific table
router.get('/db/sample/:table', (req, res) => {
  const { table } = req.params;
  const limit = parseInt(req.query.limit as string) || 5;
  
  // Security: only allow specific tables
  const allowedTables = ['users', 'organizations', 'team_members', 'invites', 'audit_logs', 'device_bindings'];
  
  if (!allowedTables.includes(table)) {
    return res.status(400).json({
      status: 'error',
      message: 'Table not allowed'
    });
  }
  
  try {
    const sampleData = db.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC LIMIT ?`).all(limit);
    
    res.json({
      status: 'success',
      table,
      count: sampleData.length,
      data: sampleData,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: (error as Error).message,
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
    const orgStmt = db.prepare('SELECT name FROM organizations WHERE id = ?');
    const org = orgStmt.get(orgId) as any;
    
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Generate invite code and calculate expiration
    const code = crypto.randomBytes(16).toString('hex').toUpperCase();
    const expiresAt = Math.floor(Date.now() / 1000) + (expiresInDays * 24 * 60 * 60);

    // Create invite
    const inviteStmt = db.prepare(`
      INSERT INTO invites (id, org_id, email, code, role, expires_at) 
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const inviteId = uuidv4();
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
  } catch (err) {
    console.error('Error generating invite:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
