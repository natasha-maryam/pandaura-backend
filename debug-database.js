#!/usr/bin/env node

/**
 * Database Debug Script
 * Tests which database is being used and verifies connectivity
 */

// Load environment variables
require('dotenv').config();

const { db } = require('./src/db/database-adapter');

async function debugDatabase() {
  console.log('🔍 Database Debug Information\n');
  
  // Environment check
  console.log('Environment Variables:');
  console.log('- NODE_ENV:', process.env.NODE_ENV || 'undefined');
  console.log('- VERCEL:', process.env.VERCEL || 'undefined');
  console.log('- RAILWAY_ENVIRONMENT:', process.env.RAILWAY_ENVIRONMENT || 'undefined');
  console.log('- POSTGRES_URL:', process.env.POSTGRES_URL ? '[CONFIGURED]' : 'undefined');
  console.log('- DB_PATH:', process.env.DB_PATH || 'default');
  console.log('');
  
  // Determine database type
  const isProduction = process.env.VERCEL || process.env.RAILWAY_ENVIRONMENT || process.env.NODE_ENV === 'production';
  const databaseType = isProduction ? 'PostgreSQL' : 'SQLite';
  
  console.log(`🗄️ Database Type: ${databaseType}`);
  console.log('');
  
  // Test connection
  try {
    console.log('Testing database connection...');
    
    if (isProduction) {
      // PostgreSQL test
      const users = await db.getAllUsers();
      console.log('✅ PostgreSQL Connection: SUCCESS');
      console.log(`📊 Users in database: ${users.length}`);
      
      if (users.length > 0) {
        console.log('👥 Sample users:');
        users.slice(0, 3).forEach((user, index) => {
          console.log(`   ${index + 1}. ${user.email} (${user.first_name} ${user.last_name})`);
        });
      }
    } else {
      // SQLite test
      const result = db.prepare('SELECT COUNT(*) as count FROM users').get();
      console.log('✅ SQLite Connection: SUCCESS');
      console.log(`📊 Users in database: ${result.count}`);
      
      if (result.count > 0) {
        const users = db.prepare('SELECT email, first_name, last_name FROM users LIMIT 3').all();
        console.log('👥 Sample users:');
        users.forEach((user, index) => {
          console.log(`   ${index + 1}. ${user.email} (${user.first_name} ${user.last_name})`);
        });
      }
    }
  } catch (error) {
    console.log('❌ Database Connection: FAILED');
    console.error('Error:', error.message);
  }
  
  console.log('\n🎯 Next Steps:');
  if (!isProduction && process.env.NODE_ENV !== 'production') {
    console.log('- Currently using SQLite for development');
    console.log('- To test PostgreSQL locally, set: NODE_ENV=production POSTGRES_URL=your_railway_url');
  } else if (!process.env.POSTGRES_URL) {
    console.log('- PostgreSQL URL is missing');
    console.log('- Set POSTGRES_URL environment variable in Vercel/Railway');
  } else {
    console.log('- Production environment detected');
    console.log('- Using PostgreSQL database');
  }
}

debugDatabase().catch(console.error);
