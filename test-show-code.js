const { SimpleCodeGovernor } = require('./dist/src/ai/code-governor/simple-governor');

async function testAndShowCode() {
  const testSpec = `
  PLC Functional Design Specification
  Vendor: Siemens S7-1500
  Language: SCL
  Requirements: Main control with Start/Stop, Conveyor control, Mode management
  `;
  
  const testPrompt = `Generate Siemens S7-1500 SCL code for conveyor control system.`;
  
  try {
    const result = await SimpleCodeGovernor.generateFromDocument(testSpec, testPrompt);
    
    // Show one of the generated files
    const mainControl = result.files['FB_MainControl.scl'];
    if (mainControl) {
      console.log('\n=== GENERATED SCL CODE ===');
      console.log(mainControl);
    }
    
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

testAndShowCode();
