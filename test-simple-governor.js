const { SimpleCodeGovernor } = require('./dist/src/ai/code-governor/simple-governor');

async function testSimpleGovernor() {
  console.log('🧪 Testing Simple Governor with SCL generation...');
  
  const testSpec = `
  PLC Functional Design Specification
  
  System: Conveyor Control System
  Vendor: Siemens S7-1500
  Language: SCL (Structured Control Language)
  
  Requirements:
  1. Main control with Start/Stop functionality
  2. Conveyor control with jam detection
  3. Mode management (Auto, Semi, Manual, E-Stop)
  4. Alarm management system
  5. Diagnostics and status reporting
  `;
  
  const testPrompt = `
  Generate complete Siemens S7-1500 SCL code for a conveyor control system.
  Include proper function blocks for:
  - Main control logic
  - Conveyor control with jam detection
  - Mode management
  - Alarm handling
  - Diagnostics
  
  Use proper SCL syntax and ensure all code is compilable.
  `;
  
  try {
    const result = await SimpleCodeGovernor.generateFromDocument(testSpec, testPrompt);
    
    console.log('📊 Generation Results:');
    console.log(`Files generated: ${Object.keys(result.files).length}`);
    
    Object.entries(result.files).forEach(([filename, content]) => {
      console.log(`\n📁 ${filename} (${content.split('\n').length} lines):`);
      
      // Check for SCL syntax validation
      if (filename.endsWith('.scl')) {
        const hasProperStructure = content.includes('FUNCTION_BLOCK') && content.includes('END_FUNCTION_BLOCK');
        const hasProperVars = content.includes('VAR_INPUT') && content.includes('END_VAR');
        const hasProperAssignment = content.includes(':=') && !content.includes(' = ');
        
        console.log(`  ✅ Proper FUNCTION_BLOCK structure: ${hasProperStructure}`);
        console.log(`  ✅ Proper variable declarations: ${hasProperVars}`);
        console.log(`  ✅ Proper SCL assignments: ${hasProperAssignment}`);
      }
    });
    
    console.log('\n📋 Summary:');
    console.log(result.summary);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testSimpleGovernor();
