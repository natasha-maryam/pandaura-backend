// Test PDF document analysis with Wrapper B
const FormData = require('form-data');
const fs = require('fs');
const { default: fetch } = require('node-fetch');

async function testPDFAnalysis() {
  try {
    console.log('📄 Testing PDF document analysis with Wrapper B...');
    console.log('');
    
    // Check what PDF files are available
    const testFilesDir = './test-files/';
    const files = fs.readdirSync(testFilesDir);
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    
    if (pdfFiles.length === 0) {
      console.log('❌ No PDF files found in test-files directory');
      console.log('');
      console.log('📋 RECOMMENDED PDF TYPES FOR TESTING:');
      console.log('');
      console.log('1. 📄 TECHNICAL SPECIFICATIONS');
      console.log('   • Motor control specifications');
      console.log('   • System requirements documents');
      console.log('   • Safety procedures');
      console.log('   • I/O lists and tag databases');
      console.log('');
      console.log('2. 📊 ENGINEERING DRAWINGS');
      console.log('   • P&ID diagrams');
      console.log('   • Electrical schematics');
      console.log('   • Control panel layouts');
      console.log('   • Wiring diagrams');
      console.log('');
      console.log('3. 📋 MAINTENANCE DOCUMENTS');
      console.log('   • Preventive maintenance procedures');
      console.log('   • Troubleshooting guides');
      console.log('   • Spare parts lists');
      console.log('   • Calibration procedures');
      console.log('');
      console.log('4. 🔧 PLC DOCUMENTATION');
      console.log('   • Program documentation');
      console.log('   • Function block descriptions');
      console.log('   • Tag database exports');
      console.log('   • Alarm lists');
      console.log('');
      
      // Create a sample text-based PDF content suggestion
      console.log('📝 SAMPLE PDF CONTENT TO CREATE:');
      console.log('');
      console.log('=== MOTOR CONTROL SPECIFICATION ===');
      console.log('');
      console.log('System: Conveyor Motor Control');
      console.log('Motor: 5HP, 480V, 3-phase');
      console.log('');
      console.log('I/O List:');
      console.log('I:0/0 - Start Button (BOOL)');
      console.log('I:0/1 - Stop Button (BOOL)');
      console.log('I:0/2 - Emergency Stop (BOOL)');
      console.log('O:0/0 - Motor Contactor (BOOL)');
      console.log('O:0/1 - Run Lamp (BOOL)');
      console.log('');
      console.log('Safety Requirements:');
      console.log('- Emergency stop response < 500ms');
      console.log('- SIL 2 safety function');
      console.log('- Dual-channel emergency stop');
      console.log('');
      console.log('💡 Save this content as a PDF and test with Wrapper B!');
      
      return;
    }
    
    console.log(`📁 Found ${pdfFiles.length} PDF file(s):`);
    pdfFiles.forEach(file => console.log(`   • ${file}`));
    console.log('');
    
    // Test with the first PDF found
    const testFile = pdfFiles[0];
    console.log(`🧪 Testing with: ${testFile}`);
    
    const filePath = `${testFilesDir}${testFile}`;
    const fileBuffer = fs.readFileSync(filePath);
    const fileStats = fs.statSync(filePath);
    
    console.log(`📏 File size: ${(fileStats.size / 1024).toFixed(1)} KB`);
    
    // Create form data
    const form = new FormData();
    form.append('files', fileBuffer, {
      filename: testFile,
      contentType: 'application/pdf'
    });
    
    form.append('prompt', 'Analyze this technical document and extract key information about the control system, I/O requirements, safety features, and any maintenance procedures.');
    form.append('projectId', 'pdf-test-project');
    form.append('vendor_selection', 'Generic');
    
    console.log('📤 Sending to Wrapper B...');
    
    // Send request
    const response = await fetch('http://localhost:5000/api/assistant/wrapperB', {
      method: 'POST',
      body: form,
      headers: form.getHeaders()
    });
    
    const responseText = await response.text();
    let data;
    
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.log('❌ Failed to parse response as JSON');
      console.log('📄 Raw response:', responseText.substring(0, 500) + '...');
      return;
    }
    
    console.log('📊 Response Status:', response.status);
    console.log('📊 Analysis Status:', data.status);
    
    if (data.status === 'ok') {
      console.log('✅ PDF analysis successful!');
      console.log('');
      console.log('📝 ANALYSIS RESULTS:');
      console.log(data.answer_md);
      console.log('');
      
      if (data.artifacts.tables.length > 0) {
        console.log('📊 EXTRACTED TABLES:');
        data.artifacts.tables.forEach((table, index) => {
          console.log(`   Table ${index + 1}: ${table.title}`);
          console.log(`   Columns: ${table.schema.join(', ')}`);
          console.log(`   Rows: ${table.rows.length}`);
        });
        console.log('');
      }
      
      if (data.artifacts.reports.length > 0) {
        console.log('📋 GENERATED REPORTS:');
        data.artifacts.reports.forEach((report, index) => {
          console.log(`   Report ${index + 1}: ${report.title}`);
        });
        console.log('');
      }
      
      if (data.next_actions.length > 0) {
        console.log('⏭️ SUGGESTED NEXT ACTIONS:');
        data.next_actions.forEach(action => {
          console.log(`   • ${action}`);
        });
        console.log('');
      }
      
      if (data.processed_files.length > 0) {
        console.log('📁 PROCESSED FILES:');
        data.processed_files.forEach(file => {
          console.log(`   • ${file.filename} (${file.type})`);
          console.log(`     Size: ${(file.size / 1024).toFixed(1)} KB`);
          console.log(`     Data extracted: ${file.extracted_data_available ? 'Yes' : 'No'}`);
        });
      }
      
    } else {
      console.log('❌ PDF analysis failed');
      console.log('📄 Error details:', data.errors);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

console.log('🎯 PDF TESTING GUIDE FOR WRAPPER B');
console.log('=====================================');
console.log('');

testPDFAnalysis();
