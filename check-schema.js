const Database = require('better-sqlite3');

// Connect to the database
const db = new Database('./pandaura.db');

console.log('📊 Database Schema Information:');

// Get all table names
const tables = db.prepare(`
  SELECT name FROM sqlite_master 
  WHERE type='table' AND name NOT LIKE 'sqlite_%'
  ORDER BY name
`).all();

console.log('\n🗂️ Available Tables:');
tables.forEach(table => {
  console.log(`- ${table.name}`);
});

// Get schema for each table
tables.forEach(table => {
  console.log(`\n📋 Schema for ${table.name}:`);
  const schema = db.prepare(`PRAGMA table_info(${table.name})`).all();
  schema.forEach(col => {
    console.log(`  - ${col.name}: ${col.type} ${col.notnull ? 'NOT NULL' : ''} ${col.pk ? 'PRIMARY KEY' : ''} ${col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''}`);
  });
});

db.close();
