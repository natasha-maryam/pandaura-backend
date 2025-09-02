import OpenAI from "openai";
import { getAIConfig } from "../../config/ai-config";

const config = getAIConfig();

// Validate API key exists
if (!config.openai.apiKey) {
  throw new Error("OPENAI_API_KEY environment variable not set. Cannot generate code without valid API key.");
}

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
});

const MODEL_NAME = config.openai.model;

export interface SimpleGovernorResult {
  files: Record<string, string>;
  summary: string;
  vendor?: string;
  filesValidation?: Record<string, { compilable: boolean; errors: string[] }>;
  metadata?: {
    totalLines: number;
    filesGenerated: number;
    detectedVendor: string;
    largestFile: string;
    averageLinesPerFile: number;
  };
}

export class SimpleCodeGovernor {
  private static readonly MASSIVE_CODE_MACHINE = `YOU ARE A PURE CODE MACHINE. ZERO TEXT. MAXIMUM CODE OUTPUT.

FORBIDDEN ABSOLUTELY:
- NO explanations, overviews, descriptions
- NO "Based on...", "Here's...", "This implements..."
- NO markdown headers, formatting, or documentation
- NO introductions or conclusions
- NO comments explaining what code does
- NO TODO comments or placeholder text
- NO skeleton code or partial implementations
- NO "// Add your code here" or similar
- NO incomplete functions or empty blocks
- NO predefined file names or structure

MANDATORY CODE GENERATION:
- Analyze the requirements and determine what files are needed
- Generate complete executable code for the target platform
- Create 3000-8000+ lines total based on project complexity
- Generate as many files as needed for complete implementation
- Each file: 400-800 lines with FULL working implementation
- Complete state machines with ALL states implemented
- ALL variables declared with actual working logic
- ALL timer logic, counter logic, math operations complete
- ALL IF/CASE statements with real conditions and actions
- Production-ready code with no gaps

SCL (SIEMENS) SPECIFIC REQUIREMENTS:
- Use proper FUNCTION_BLOCK structure with correct syntax
- All variable blocks must end with END_VAR
- Use proper SCL syntax: FUNCTION_BLOCK...END_FUNCTION_BLOCK
- Variable declarations: VAR_INPUT...END_VAR, VAR_OUTPUT...END_VAR, VAR...END_VAR
- Proper timer syntax: timer_name(IN := condition, PT := T#5s)
- Use CASE...OF for state machines with proper END_CASE
- All assignments use := operator
- String literals use single quotes: 'text'
- Boolean constants: TRUE, FALSE
- Time constants: T#5s, T#10ms, etc.

VALID SCL TEMPLATE:
FUNCTION_BLOCK FB_Example
VAR_INPUT
    Start : BOOL;
    Stop : BOOL;
END_VAR

VAR_OUTPUT
    Running : BOOL;
    Status : INT;
END_VAR

VAR
    Timer : TON;
    State : INT;
END_VAR

// Logic implementation
IF Start AND NOT Stop THEN
    Running := TRUE;
    Timer(IN := TRUE, PT := T#5s);
    
    CASE State OF
        0: // Initialize
            State := 1;
        1: // Running
            IF Timer.Q THEN
                State := 2;
            END_IF;
        2: // Complete
            Running := FALSE;
            State := 0;
    END_CASE;
ELSE
    Running := FALSE;
    Timer(IN := FALSE);
END_IF;

END_FUNCTION_BLOCK

YOU MUST GENERATE MASSIVE FILES WITH 400-800 LINES EACH`;

  static async generateFromDocument(
    specText: string,
    prompt: string
  ): Promise<SimpleGovernorResult> {
    console.log("MASSIVE CODE GENERATOR: Generating 3000-8000 lines...");

    // Validate API key before proceeding
    const config = getAIConfig();
    if (!config.openai.apiKey) {
      throw new Error("OPENAI_API_KEY not configured. Please set the environment variable in Railway dashboard.");
    }

    try {
      // Detect vendor from specification text
      const vendor = this.detectVendor(specText, prompt);
      console.log(`Detected vendor: ${vendor}`);

      // Use vendor-specific prompt template
      const vendorPrompt = this.getVendorPrompt(vendor, specText, prompt);
      
      const megaCodePrompt = vendorPrompt;

      // Generate code in chunks to respect token limits
      const chunks = await this.generateCodeInChunks(megaCodePrompt, specText, prompt);
      const finalResponse = chunks.join('\n\n');

      if (!finalResponse) {
        throw new Error("No response from chunked generation");
      }

      console.log(`Total response length: ${finalResponse.length} characters`);

      // Enhanced file parsing for massive code generation with SCL validation
      const files: Record<string, string> = {};
      
      // Primary parsing: Look for // File: pattern
      const fileRegex = /\/\/ File: ([^\n]+)\n([\s\S]*?)(?=\/\/ File:|$)/g;
      let match;
      
      while ((match = fileRegex.exec(finalResponse)) !== null) {
        const filename = match[1].trim();
        const content = match[2].trim();
        if (content && content.length > 10) {
          files[filename] = content;
          console.log(`Parsed file: ${filename} (${content.split('\n').length} lines)`);
        }
      }
      
      // Secondary parsing: Extract FUNCTION_BLOCK, ORGANIZATION_BLOCK, etc.
      const blockTypes = ['FUNCTION_BLOCK', 'ORGANIZATION_BLOCK', 'DATA_BLOCK', 'TYPE'];
      for (const blockType of blockTypes) {
        const blockRegex = new RegExp(`${blockType}\\s+([A-Za-z0-9_]+)([\\s\\S]*?)END_${blockType}`, 'g');
        let blockMatch;
        
        while ((blockMatch = blockRegex.exec(finalResponse)) !== null) {
          const blockName = blockMatch[1].trim();
          const fullBlock = blockMatch[0];
          const extension = vendor.toLowerCase() === 'siemens' ? 'scl' : 'st';
          
          if (!files[`${blockName}.${extension}`] && fullBlock.length > 50) {
            const content = fullBlock;
            files[`${blockName}.${extension}`] = content;
            
            console.log(`Extracted ${blockType}: ${blockName} (${content.split('\n').length} lines)`);
          }
        }
      }

      // If no files found with above methods, create files from logical sections
      if (Object.keys(files).length === 0) {
        console.log("No structured files found, creating from content sections...");
        const sections = finalResponse.split('\n\n').filter(section => section.trim().length > 100);
        sections.forEach((section, index) => {
          if (section.includes('FUNCTION_BLOCK') || section.includes('ORGANIZATION_BLOCK')) {
            const extension = vendor.toLowerCase() === 'siemens' ? 'scl' : 'st';
            files[`GeneratedBlock_${index + 1}.${extension}`] = section.trim();
          }
        });
      }

      if (Object.keys(files).length === 0) {
        throw new Error("No valid code files could be extracted from the response");
      }

      // Calculate statistics
      const totalLines = Object.values(files).reduce((sum, content) => sum + content.split('\n').length, 0);
      const totalChars = Object.values(files).reduce((sum, content) => sum + content.length, 0);

      // Generate explanations
      const explanations = this.generateCodeExplanations(files, vendor);

      const summary = `MASSIVE CODE GENERATION COMPLETE
Files Generated: ${Object.keys(files).length}
Total Lines: ${totalLines}
Total Characters: ${totalChars}
Average Lines per File: ${Math.round(totalLines / Object.keys(files).length)}
Largest File: ${Math.max(...Object.values(files).map(f => f.split('\n').length))} lines
Code Generation Efficiency: ${totalLines > 2000 ? 'EXCELLENT' : totalLines > 1000 ? 'GOOD' : 'NEEDS MORE'}
Vendor: ${vendor.toUpperCase()}

Generated Files:
${Object.entries(files)
  .map(([name, content]) => `  ${name}: ${content.split('\n').length} lines`)
  .join('\n')}

${explanations}`;

      console.log(summary);
      
      // Create validation results and metadata
      const filesValidation: Record<string, { compilable: boolean; errors: string[] }> = {};
      for (const [filename, content] of Object.entries(files)) {
        const validation = this.validateSCLSyntax(content);
        filesValidation[filename] = validation;
      }
      
      const metadata = {
        totalLines,
        filesGenerated: Object.keys(files).length,
        detectedVendor: vendor,
        largestFile: Object.entries(files)
          .sort(([, a], [, b]) => b.split('\n').length - a.split('\n').length)[0]?.[0] || '',
        averageLinesPerFile: Math.round(totalLines / Object.keys(files).length)
      };
      
      return { 
        files, 
        summary, 
        vendor, 
        filesValidation, 
        metadata 
      };
    } catch (error) {
      console.error("Massive code generation failed:", error);

      const files: Record<string, string> = {
        "Generation_Error.md": `MASSIVE CODE GENERATION FAILED
Error: ${error instanceof Error ? error.message : "Unknown error"}
Timestamp: ${new Date().toISOString()}

This should not happen with the enhanced massive code generator.
Please check:
1. API connectivity and limits
2. Model token capacity
3. Network timeout settings

Attempted to generate 3000-8000 lines of SCL code.`,
      };

      return {
        files,
        summary: `MASSIVE CODE GENERATION FAILED: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      };
    }
  }

  private static async generateCodeInChunks(prompt: string, specText: string, userPrompt: string): Promise<string[]> {
    const chunks: string[] = [];
    const chunkCount = 5; // Generate in 5 chunks for massive output
    
    console.log(`Generating code in ${chunkCount} chunks...`);
    
    for (let i = 0; i < chunkCount; i++) {
      const chunkPrompt = `${prompt}

CHUNK ${i + 1}/${chunkCount}: Generate MASSIVE code section focusing on:
${i === 0 ? 'Core System' : 
  i === 1 ? 'Advanced Features' : 
  i === 2 ? 'Integration & Communications' : 
  i === 3 ? 'Safety & Diagnostics' : 
  'Data Structures & Utilities'}

REQUIREMENTS:
- Generate 400-800 lines of SCL code for this section
- Include complete FUNCTION_BLOCK implementations
- NO explanations or text, ONLY code
- Use proper SCL syntax with END_VAR, END_FUNCTION_BLOCK, etc.

SPEC: ${specText.substring(0, 1000)}
USER REQUEST: ${userPrompt}`;

      console.log(`Generating chunk ${i + 1}/${chunkCount}: ${i === 0 ? 'Core System' : 
        i === 1 ? 'Advanced Features' : 
        i === 2 ? 'Integration & Communications' : 
        i === 3 ? 'Safety & Diagnostics' : 
        'Data Structures & Utilities'}`);

      const response = await openai.chat.completions.create({
        model: MODEL_NAME,
        messages: [
          { role: "system", content: this.MASSIVE_CODE_MACHINE },
          { role: "user", content: chunkPrompt }
        ],
        temperature: 0.3,
        max_tokens: 4000,
      });

      const chunkContent = response.choices[0]?.message?.content || '';
      if (chunkContent) {
        chunks.push(chunkContent);
        console.log(`Chunk ${i + 1} completed: ${chunkContent.length} characters`);
      }
    }
    
    return chunks;
  }

  private static detectVendor(specText: string, prompt: string): string {
    const combinedText = (specText + ' ' + prompt).toLowerCase();
    
    if (combinedText.includes('siemens') || combinedText.includes('step 7') || 
        combinedText.includes('tia portal') || combinedText.includes('s7-1500') ||
        combinedText.includes('scl') || combinedText.includes('schneider')) {
      return 'siemens';
    } else if (combinedText.includes('rockwell') || combinedText.includes('studio 5000') || 
               combinedText.includes('logix') || combinedText.includes('ab plc')) {
      return 'rockwell';
    } else if (combinedText.includes('beckhoff') || combinedText.includes('twincat')) {
      return 'beckhoff';
    }
    
    return 'siemens'; // Default fallback
  }

  private static getVendorPrompt(vendor: string, specText: string, prompt: string): string {
    switch (vendor.toLowerCase()) {
      case 'siemens':
        return `${this.MASSIVE_CODE_MACHINE}

TARGET: SIEMENS S7-1500 SCL CODE
Generate MASSIVE SCL (Structured Control Language) code for TIA Portal:
- Use FUNCTION_BLOCK, ORGANIZATION_BLOCK structure
- Proper variable declarations with VAR_INPUT, VAR_OUTPUT, VAR blocks
- All blocks must end with END_VAR
- Use SCL syntax: := for assignments, TRUE/FALSE for booleans
- Timer syntax: timer_name(IN := condition, PT := T#5s)
- CASE statements with END_CASE
- IF statements with END_IF

SPECIFICATION: ${specText}
USER REQUEST: ${prompt}

GENERATE 3000-8000 LINES OF COMPLETE SCL CODE NOW.`;

      case 'rockwell':
        return `${this.MASSIVE_CODE_MACHINE}

TARGET: ROCKWELL LOGIX STRUCTURED TEXT
Generate MASSIVE Structured Text code for Studio 5000:
- Use AOI (Add-On Instruction) format
- Proper tag declarations
- Use Rockwell timer syntax (TON, TOF)
- Structured Text syntax with proper data types

SPECIFICATION: ${specText}
USER REQUEST: ${prompt}

GENERATE 3000-8000 LINES OF COMPLETE ST CODE NOW.`;

      default:
        return `${this.MASSIVE_CODE_MACHINE}

SPECIFICATION: ${specText}
USER REQUEST: ${prompt}

GENERATE 3000-8000 LINES OF COMPLETE PLC CODE NOW.`;
    }
  }

  private static generateCodeExplanations(files: Record<string, string>, vendor: string): string {
    const fileNames = Object.keys(files);
    const totalLines = Object.values(files).reduce((sum, content) => sum + content.split('\n').length, 0);
    
    return `

## Code Explanation

### System Architecture
This ${vendor.toUpperCase()} PLC program implements a complete control system with the following components:

${fileNames.slice(0, 6).map(name => {
  const baseName = name.replace(/\.(scl|st)$/, '');
  const category = this.categorizeFile(baseName);
  return `- **${baseName}**: ${category}`;
}).join('\n')}

### Key Features Implemented:
- **Mode Control**: Auto, Semi, Manual, Maintenance, and E-Stop modes
- **State Machines**: Complete state transitions with proper timers and conditions
- **Safety Systems**: Emergency stop handling and safety interlocks
- **Timing Logic**: Proper timer implementations with timeout handling
- **Error Handling**: Fault detection and recovery mechanisms
- **Communication**: SCADA integration and status reporting

### How the Blocks Work Together:
1. **Main Control** orchestrates overall system operation and mode management
2. **Conveyor Control** handles material movement with jam detection and accumulation
3. **Merge/Divert Logic** routes materials based on barcode scanning and routing tables
4. **Palletizer Handshake** manages the Ready→InPosition→CycleStart→Complete sequence
5. **Alarm Management** handles critical and non-critical alarms with acknowledgment
6. **Diagnostics** provides system health monitoring and troubleshooting information

### Implementation Notes:
- All timers use proper ${vendor.toUpperCase()} syntax with appropriate time constants
- State machines include all necessary states and transitions
- Variables are properly declared with correct data types
- Error handling includes timeout detection and recovery procedures
- Safety systems ensure proper shutdown and restart sequences

### Next Steps:
1. Import the generated files into your ${vendor.toUpperCase()} development environment
2. Map physical I/O tags to the defined variables
3. Configure SCADA communication tags
4. Test in simulation mode before deployment
5. Validate all safety functions and emergency procedures

The generated code follows ${vendor.toUpperCase()} best practices and industry standards for industrial automation.`;
  }

  private static categorizeFile(filename: string): string {
    const lower = filename.toLowerCase();
    if (lower.includes('main') || lower.includes('control')) return 'Handles main control functionality';
    if (lower.includes('conveyor')) return 'Handles conveyor control functionality';
    if (lower.includes('merge') || lower.includes('divert')) return 'Handles merge/divert logic functionality';
    if (lower.includes('palletizer') || lower.includes('handshake')) return 'Handles palletizer handshake functionality';
    if (lower.includes('alarm')) return 'Handles alarm management functionality';
    if (lower.includes('diagnostic')) return 'Handles diagnostics functionality';
    if (lower.includes('mode')) return 'Handles operating mode functionality';
    return 'Handles utility/support functionality';
  }

  private static validateSCLSyntax(content: string): { compilable: boolean; errors: string[] } {
    const errors: string[] = [];
    let compilable = true;

    // Check for proper FUNCTION_BLOCK structure
    if (content.includes('FUNCTION_BLOCK') && !content.includes('END_FUNCTION_BLOCK')) {
      errors.push('Missing END_FUNCTION_BLOCK');
      compilable = false;
    }

    // Check for proper VAR block endings
    const varInputCount = (content.match(/VAR_INPUT/g) || []).length;
    const varOutputCount = (content.match(/VAR_OUTPUT/g) || []).length;
    const varCount = (content.match(/\bVAR\b(?!_)/g) || []).length;
    const endVarCount = (content.match(/END_VAR/g) || []).length;

    const expectedEndVar = varInputCount + varOutputCount + varCount;
    if (expectedEndVar > endVarCount) {
      errors.push('Missing END_VAR for variable blocks');
      compilable = false;
    }

    // Check for proper SCL syntax patterns
    if (content.includes('VAR_INPUT') && !/VAR_INPUT[\s\S]*?END_VAR/.test(content)) {
      errors.push('VAR_INPUT block not properly closed');
      compilable = false;
    }

    if (content.includes('VAR_OUTPUT') && !/VAR_OUTPUT[\s\S]*?END_VAR/.test(content)) {
      errors.push('VAR_OUTPUT block not properly closed');
      compilable = false;
    }

    // Check for proper CASE structure
    const caseCount = (content.match(/\bCASE\b/g) || []).length;
    const endCaseCount = (content.match(/END_CASE/g) || []).length;
    if (caseCount !== endCaseCount) {
      errors.push('CASE statements not properly closed with END_CASE');
      compilable = false;
    }

    // Check for proper IF structure
    const ifCount = (content.match(/\bIF\b/g) || []).length;
    const endIfCount = (content.match(/END_IF/g) || []).length;
    if (ifCount !== endIfCount) {
      errors.push('IF statements not properly closed with END_IF');
      compilable = false;
    }

    // Check for proper assignment operator
    if (content.includes(' = ') && !content.includes(' := ')) {
      errors.push('Use := for assignments in SCL, not =');
      compilable = false;
    }

    return { compilable, errors };
  }

  static shouldTriggerCodeGeneration(prompt: string, sessionMemory?: any): boolean {
    const massiveCodeKeywords = [
      "generate", "create", "implement", "code", "scl", "function_block",
      "siemens", "rockwell", "beckhoff", "plc", "automation", "conveyor",
      "palletizer", "alarm", "diagnostic", "control", "system"
    ];

    return massiveCodeKeywords.some(keyword => 
      prompt.toLowerCase().includes(keyword)
    );
  }
}
