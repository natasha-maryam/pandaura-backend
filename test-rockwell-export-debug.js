const fs = require('fs');
const path = require('path');

// Load the compiled export function
const { exportRockwellCsv } = require('./dist/utils/rockwellTagIO.js');

async function testRockwellExport() {
  console.log('🧪 Testing Rockwell CSV export function...');
  
  const projectId = 11; // Project with Rockwell tags
  const outputPath = path.join(__dirname, 'test-rockwell-debug-output.csv');
  const writeStream = fs.createWriteStream(outputPath);
  
  try {
    console.log(`📝 Exporting Rockwell tags for project ${projectId}...`);
    const success = await exportRockwellCsv(projectId, writeStream);
    
    console.log('Export completed successfully:', success);
    
    // Wait for the stream to finish
    await new Promise((resolve) => {
      writeStream.on('finish', resolve);
    });
    
    // Read and display the result
    console.log('\n📄 Generated CSV content:');
    const content = fs.readFileSync(outputPath, 'utf8');
    console.log(content);
    
    // Analyze the content
    const lines = content.trim().split('\n');
    console.log(`\n📊 Analysis:`);
    console.log(`- Total lines: ${lines.length}`);
    console.log(`- Header line: ${lines[0]}`);
    console.log(`- Data lines: ${lines.length - 1}`);
    
    if (lines.length > 1) {
      lines.slice(1).forEach((line, index) => {
        const columns = line.split(',');
        console.log(`- Row ${index + 1}: Tag "${columns[0]}" (${columns.length} columns)`);
      });
    }
    
  } catch (error) {
    console.error('❌ Error during export:', error);
  } finally {
    writeStream.end();
  }
}

testRockwellExport().catch(console.error);
