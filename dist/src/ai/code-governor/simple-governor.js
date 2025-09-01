"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleCodeGovernor = void 0;
const openai_1 = __importDefault(require("openai"));
const ai_config_1 = require("../../config/ai-config");
// Use the same OpenAI setup as Wrapper B
const config = (0, ai_config_1.getAIConfig)();
const openai = new openai_1.default({
    apiKey: config.openai.apiKey,
    baseURL: config.openai.baseUrl,
});
const MODEL_NAME = config.openai.model;
class SimpleCodeGovernor {
    static async generateMassiveCode(specText) {
        console.log('🚀 Simple Code Governor: Starting massive code generation...');
        console.log('📋 Spec text length:', specText.length);
        try {
            const userPrompt = `Generate a complete Siemens S7-1500 PLC program based on this specification:

${specText}

Generate ALL the required files with MASSIVE, COMPLETE implementations. Each file must be 200-500+ lines with comprehensive functionality. Include every possible feature, safety system, diagnostic, and optimization.

Return the code in this exact format:
\`\`\`
// File: OB100.scl
[Complete OB100 code here - 200+ lines]

// File: OB1.scl  
[Complete OB1 code here - 200+ lines]

// File: FB_ModeMgr.scl
[Complete FB_ModeMgr code here - 200+ lines]
\`\`\`

Make sure each file is MASSIVE and COMPLETE with no skeleton code, TODOs, or placeholders.`;
            console.log('🤖 Calling LLM for massive code generation...');
            console.log('📋 Model:', MODEL_NAME);
            const completion = await Promise.race([
                openai.chat.completions.create({
                    model: MODEL_NAME,
                    messages: [
                        { role: "system", content: this.MASSIVE_CODE_SYSTEM },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.2,
                    max_tokens: 16384
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('LLM call timeout after 180 seconds')), 180000))
            ]);
            console.log('✅ LLM call completed successfully');
            const response = completion.choices[0]?.message?.content;
            if (!response) {
                throw new Error('No response from LLM');
            }
            console.log('📄 Response length:', response.length);
            console.log('📄 Response preview:', response.substring(0, 500) + '...');
            // Parse the response to extract individual files
            const files = {};
            const fileRegex = /\/\/ File: ([^\n]+)\n([\s\S]*?)(?=\/\/ File:|$)/g;
            let match;
            while ((match = fileRegex.exec(response)) !== null) {
                const filename = match[1].trim();
                const content = match[2].trim();
                if (content.length > 50) { // Only include files with substantial content
                    files[filename] = content;
                }
            }
            console.log('📁 Files extracted:', Object.keys(files).length);
            // If no files were extracted, include the full response as a single file
            if (Object.keys(files).length === 0) {
                files['Complete_Response.md'] = response;
            }
            const totalLines = Object.values(files).reduce((sum, content) => sum + content.split('\n').length, 0);
            const summary = `Generated complete PLC program with ${Object.keys(files).length} files and ${totalLines} lines of production-ready code.`;
            return { files, summary };
        }
        catch (error) {
            console.error('❌ Simple Code Governor failed:', error);
            console.log('🔄 Creating error response without skeleton code...');
            // Return error response without skeleton code
            const errorFiles = {
                'Generation_Error.md': `# Code Generation Failed

## Error Details
${error instanceof Error ? error.message : 'Unknown error occurred'}

## Request Information
- Specification Length: ${specText.length} characters
- Timestamp: ${new Date().toISOString()}

## What Happened
The code generation process encountered an error and could not complete successfully.

## Next Steps
1. Try a more specific request
2. Ensure the specification contains clear technical requirements
3. Try again in a moment if this was a timeout
4. Contact support if the issue persists

**Note:** No skeleton code was generated to avoid misleading implementations.
`
            };
            return {
                files: errorFiles,
                summary: `Code generation failed: ${error instanceof Error ? error.message : 'Unknown error'}. No skeleton code generated.`
            };
        }
    }
    static async generateFromDocument(specText, prompt) {
        console.log('🚀 Simple Code Governor: Starting document-based code generation...');
        console.log('📋 Document text length:', specText.length);
        console.log('📋 User prompt:', prompt.substring(0, 200) + '...');
        try {
            const userPrompt = `Based on the following technical document and user request, generate a complete, production-ready PLC program.

DOCUMENT CONTENT:
${specText}

USER REQUEST:
${prompt}

ANALYSIS REQUIREMENTS:
1. Thoroughly analyze the document to extract all technical requirements
2. Identify all control systems, safety requirements, and operational procedures
3. Extract equipment specifications, I/O requirements, and control logic
4. Generate complete, working PLC code based on the document specifications
5. Include all safety systems, error handling, and diagnostics mentioned in the document

Generate a complete Siemens S7-1500 SCL program with the following structure:
- Main program modules (OB100, OB1, and relevant Function Blocks)
- All required User Defined Types (UDTs)
- Complete safety systems and interlocks
- Comprehensive error handling and diagnostics
- Documentation and setup instructions

Return the code in this format:
\`\`\`
// File: [filename]
[Complete implementation here]

// File: [filename]
[Complete implementation here]
\`\`\`

Focus on the actual requirements from the document rather than generating generic templates.`;
            console.log('🤖 Calling LLM for document-based code generation...');
            console.log('📋 Model:', MODEL_NAME);
            const completion = await Promise.race([
                openai.chat.completions.create({
                    model: MODEL_NAME,
                    messages: [
                        { role: "system", content: this.DOCUMENT_ANALYSIS_SYSTEM },
                        { role: "user", content: userPrompt }
                    ],
                    temperature: 0.3,
                    max_tokens: 16384
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('LLM call timeout after 180 seconds')), 180000))
            ]);
            console.log('✅ LLM call completed successfully');
            const response = completion.choices[0]?.message?.content;
            if (!response) {
                throw new Error('No response from LLM');
            }
            console.log('📄 Response length:', response.length);
            console.log('📄 Response preview:', response.substring(0, 500) + '...');
            // Parse the response to extract individual files
            const files = {};
            const fileRegex = /\/\/ File: ([^\n]+)\n([\s\S]*?)(?=\/\/ File:|$)/g;
            let match;
            while ((match = fileRegex.exec(response)) !== null) {
                const filename = match[1].trim();
                const content = match[2].trim();
                if (content.length > 50) { // Only include files with substantial content
                    files[filename] = content;
                }
            }
            console.log('📁 Files extracted:', Object.keys(files).length);
            // If no files were extracted, try a different parsing approach
            if (Object.keys(files).length === 0) {
                console.log('⚠️ No files extracted with primary regex, trying alternative parsing...');
                // Try to extract code blocks
                const codeBlockRegex = /```(?:scl|st|sql)?\n([\s\S]*?)```/g;
                let blockMatch;
                let blockIndex = 1;
                while ((blockMatch = codeBlockRegex.exec(response)) !== null) {
                    const content = blockMatch[1].trim();
                    if (content.length > 50) {
                        files[`Generated_Module_${blockIndex}.scl`] = content;
                        blockIndex++;
                    }
                }
                // If still no files, include the full response as a single file
                if (Object.keys(files).length === 0) {
                    files['Complete_Analysis.md'] = response;
                }
            }
            console.log('📁 Final files count:', Object.keys(files).length);
            const totalLines = Object.values(files).reduce((sum, content) => sum + content.split('\n').length, 0);
            const summary = `Generated document-based PLC program with ${Object.keys(files).length} files and ${totalLines} lines of code based on the provided technical document.`;
            return { files, summary };
        }
        catch (error) {
            console.error('❌ Document-based Code Governor failed:', error);
            console.log('🔄 Creating document-analysis fallback response...');
            // Create a fallback response with only document analysis, no skeleton code
            const files = {
                'Document_Analysis_Error.md': `# Document Analysis Failed

## Error Details
${error instanceof Error ? error.message : 'Unknown error occurred'}

## Request Information
- Document Length: ${specText.length} characters
- User Request: ${prompt}
- Timestamp: ${new Date().toISOString()}

## Document Content Summary
The document appears to contain technical specifications but could not be processed due to the error above.

**First 500 characters of document:**
${specText.substring(0, 500)}...

## Next Steps
1. Try with a simpler request
2. Check if the document format is supported
3. Verify the document content is readable
4. Contact support if the issue persists

**Note:** No skeleton code was generated to avoid misleading implementations.
`
            };
            const summary = `Document analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}. No code generated to avoid skeleton implementations.`;
            return { files, summary };
        }
    }
}
exports.SimpleCodeGovernor = SimpleCodeGovernor;
SimpleCodeGovernor.DOCUMENT_ANALYSIS_SYSTEM = `You are a comprehensive PLC system analyzer and code generator.

**CRITICAL REQUIREMENTS:**
- **ANALYZE THE PROVIDED DOCUMENT**: Extract all technical requirements, specifications, and system details
- **GENERATE FOCUSED, COMPLETE CODE**: Create production-ready PLC code based on the document content
- **NO SKELETON CODE**: Generate complete, working implementations with proper logic
- **DOCUMENT-DRIVEN GENERATION**: Base all code on the actual specifications provided in the document
- **VENDOR-SPECIFIC**: Follow vendor conventions (Siemens S7-1500 SCL by default)
- **COMPREHENSIVE COVERAGE**: Address all systems, alarms, safety, and operational requirements found in the document

**ANALYSIS APPROACH:**
1. Thoroughly analyze the provided document content
2. Extract all system requirements, components, and specifications
3. Identify control logic, safety systems, and operational procedures
4. Generate complete, working code that implements all identified requirements
5. Include proper error handling, diagnostics, and safety interlocks
6. Create comprehensive documentation and setup instructions

**OUTPUT FORMAT**: Generate production-ready PLC code files based on the document analysis.`;
SimpleCodeGovernor.MASSIVE_CODE_SYSTEM = `You are a Siemens S7-1500 SCL code generator that generates MASSIVE, COMPLETE, PRODUCTION-READY code.

**CRITICAL REQUIREMENTS:**
- **GENERATE MASSIVE CODE**: Each module must be 500-1000+ lines with comprehensive functionality
- **COMPLETE IMPLEMENTATION**: Include every possible feature, safety system, diagnostic, and optimization
- **NO SKELETON CODE**: Generate complete, production-ready code with no placeholders, TODOs, or incomplete implementations.

**TECHNICAL REQUIREMENTS:**
- Use SCL with TIA Portal conventions
- OB100 for cold start, OB1 cyclic
- Each FB has an Instance DB; name DBs explicitly (DB_Conveyor1, etc.)
- Provide UDTs for Devices, Alarms, States
- Implement sequences as CASE state machines with explicit timeouts
- Use TON/TOF timers for jam detection and handshake watchdogs
- Comment every public I/O tag and delineate safety behavior
- Include VAR_INPUT/VAR_OUTPUT/VAR and CLEAR/INIT routines when needed

**OUTPUT FORMAT**: Generate a complete Siemens S7-1500 project with multiple files.
Each file must be 200-500+ lines with complete implementation.`;
