const Database = require('better-sqlite3');
const path = require('path');

// Initialize database connection
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'pandaura.db');
const db = new Database(DB_PATH);

// Set pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Add test invite codes to the database
 */
function addTestInvites() {
  console.log('📧 Adding test invite codes...');
  
  try {
    const addInvites = db.transaction(() => {
      // First, create a test organization if it doesn't exist
      const orgId = 'test-org-' + Date.now();
      const insertOrg = db.prepare(`
        INSERT INTO organizations (id, name, industry, size, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      
      insertOrg.run(
        orgId,
        'Test Organization',
        'Technology',
        'Small',
        Math.floor(Date.now() / 1000),
        Math.floor(Date.now() / 1000)
      );
      
      console.log(`✅ Created test organization: ${orgId}`);
      
      // Prepare the invite insertion statement
      const insertInvite = db.prepare(`
        INSERT INTO invites (id, org_id, email, code, role, expires_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      
      // Calculate expiry time (30 days from now)
      const expiresAt = Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60);
      const createdAt = Math.floor(Date.now() / 1000);
      
      // Add the three test invites
      const invites = [
        {
          id: 'invite-viewer-' + Date.now(),
          email: 'test@example.com',
          code: 'TESTCODE123',
          role: 'Viewer'
        },
        {
          id: 'invite-admin-' + Date.now(),
          email: 'admin@example.com', 
          code: 'ADMINCODE456',
          role: 'Admin'
        },
        {
          id: 'invite-editor-' + Date.now(),
          email: 'editor@example.com',
          code: 'EDITORCODE789', 
          role: 'Editor'
        }
      ];
      
      for (const invite of invites) {
        insertInvite.run(
          invite.id,
          orgId,
          invite.email,
          invite.code,
          invite.role,
          expiresAt,
          createdAt
        );
        
        console.log(`✅ Added invite: ${invite.code} (${invite.role}) for ${invite.email}`);
      }
      
      return invites.length;
    });
    
    const count = addInvites();
    console.log(`🎉 Successfully added ${count} test invite codes!`);
    
  } catch (error) {
    console.error('❌ Error adding test invites:', error);
    throw error;
  } finally {
    db.close();
  }
}

/**
 * Show all current invites
 */
function showInvites() {
  console.log('📋 Current invites in database:');
  
  try {
    const invites = db.prepare(`
      SELECT 
        i.code,
        i.email,
        i.role,
        o.name as org_name,
        datetime(i.expires_at, 'unixepoch') as expires_at,
        datetime(i.created_at, 'unixepoch') as created_at
      FROM invites i
      JOIN organizations o ON i.org_id = o.id
      ORDER BY i.created_at DESC
    `).all();
    
    if (invites.length === 0) {
      console.log('  No invites found.');
    } else {
      console.log('  Code           | Role   | Email              | Organization     | Expires At');
      console.log('  ---------------|--------|--------------------|-----------------|-----------------');
      
      for (const invite of invites) {
        const code = invite.code.padEnd(14);
        const role = invite.role.padEnd(6);
        const email = invite.email.padEnd(18);
        const org = invite.org_name.padEnd(15);
        
        console.log(`  ${code} | ${role} | ${email} | ${org} | ${invite.expires_at}`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error showing invites:', error);
  } finally {
    db.close();
  }
}

// CLI usage
const command = process.argv[2];

switch (command) {
  case 'add':
    addTestInvites();
    break;
  case 'show':
    showInvites();
    break;
  default:
    console.log('📧 Invite Management Utility');
    console.log('=============================');
    console.log('Usage:');
    console.log('  node add-test-invites.js add   - Add test invite codes');
    console.log('  node add-test-invites.js show  - Show all current invites');
    console.log('');
    console.log('Test invites to be added:');
    console.log('  TESTCODE123   - Viewer role  • test@example.com');
    console.log('  ADMINCODE456  - Admin role   • admin@example.com'); 
    console.log('  EDITORCODE789 - Editor role  • editor@example.com');
}
