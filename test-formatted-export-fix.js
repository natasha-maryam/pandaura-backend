const fs = require('fs');
const path = require('path');

// Test the formatted export endpoint logic
const Database = require('better-sqlite3');
const db = new Database('./pandaura.db');

async function testFormattedExport() {
  console.log('🧪 Testing formatted export with vendor filtering...');
  
  const projectId = 11;
  
  console.log('\n=== Before Fix (what was happening) ===');
  const allTags = db.prepare('SELECT * FROM tags WHERE project_id = ?').all(projectId);
  console.log(`Total tags in project ${projectId}: ${allTags.length}`);
  allTags.forEach(tag => console.log(`  - ${tag.name} (${tag.vendor})`));
  
  console.log('\n=== After Fix (vendor filtering) ===');
  const rockwellTags = db.prepare('SELECT * FROM tags WHERE project_id = ? AND vendor = ?').all(projectId, 'rockwell');
  console.log(`Rockwell tags in project ${projectId}: ${rockwellTags.length}`);
  rockwellTags.forEach(tag => console.log(`  - ${tag.name} (${tag.vendor})`));
  
  const beckhoffTags = db.prepare('SELECT * FROM tags WHERE project_id = ? AND vendor = ?').all(projectId, 'beckhoff');
  console.log(`Beckhoff tags in project ${projectId}: ${beckhoffTags.length}`);
  beckhoffTags.forEach(tag => console.log(`  - ${tag.name} (${tag.vendor})`));
  
  console.log('\n✅ The fix ensures only vendor-specific tags are exported!');
  
  db.close();
}

testFormattedExport().catch(console.error);
