const { SimpleCodeGovernor } = require('./dist/src/ai/code-governor/simple-governor');

async function testSimpleGovernor() {
  console.log("Testing Simple Governor with improved SCL validation...");
  
  try {
    const specText = `
    Schneider/Modicon M580 Hot-Standby and X80 I/O concepts into an equivalent Siemens S7-1500 design.
    Operating modes: Auto, Semi, Manual, Maintenance, E-Stop
    Conveyor accumulation & jam detection
    Barcode-based merge/divert
    Palletizer handshake: Ready → InPosition → CycleStart → Complete with timeouts/faults
    Alarms: critical/non-critical with ack/reset
    Communications/diagnostics exposed for SCADA
    `;
    
    const prompt = "Convert to Siemens S7-1500 SCL code with proper syntax and validation";
    
    const result = await SimpleCodeGovernor.generateFromDocument(specText, prompt);
    
    console.log("\n=== RESULT SUMMARY ===");
    console.log("Vendor:", result.vendor);
    console.log("Files generated:", Object.keys(result.files).length);
    console.log("Metadata:", result.metadata);
    
    console.log("\n=== FILE VALIDATION ===");
    for (const [filename, validation] of Object.entries(result.filesValidation || {})) {
      console.log(`${filename}: ${validation.compilable ? '✅ Compilable' : '❌ Not Compilable'}`);
      if (validation.errors.length > 0) {
        console.log(`  Errors: ${validation.errors.join(', ')}`);
      }
    }
    
    console.log("\n=== SAMPLE FILE ===");
    const firstFile = Object.entries(result.files)[0];
    if (firstFile) {
      console.log(`--- ${firstFile[0]} ---`);
      console.log(firstFile[1].substring(0, 500) + "...");
    }
    
  } catch (error) {
    console.error("Test failed:", error);
  }
}

testSimpleGovernor();
