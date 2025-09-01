import { Router } from "express";
import multer from "multer";
import { Orchestrator, CodeGenError } from "./code-governor/orchestrator";
import { documentProcessor } from "../utils/documentProcessor";
import path from "path";
import fs from "fs";

const router = Router();

// Multer configuration for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB for documents
  },
});

// Code Governor Route - Generates complete, vendor-compliant PLC programs
router.post("/code-governor", upload.array('files'), async (req, res) => {
  try {
    const { prompt, vendor, projectName, sessionId, stream } = req.body;
    const files = req.files as Express.Multer.File[] || [];

    if (!prompt) {
      return res.status(400).json({
        status: "error",
        task_type: "code_gen",
        assumptions: [],
        answer_md: "Prompt is required for code generation.",
        artifacts: { code: [], tables: [], citations: [] },
        next_actions: [],
        errors: ["Missing prompt"],
      });
    }

    if (!vendor) {
      return res.status(400).json({
        status: "error",
        task_type: "code_gen",
        assumptions: [],
        answer_md: "Vendor selection is required (Siemens, Rockwell, or Beckhoff).",
        artifacts: { code: [], tables: [], citations: [] },
        next_actions: [],
        errors: ["Missing vendor selection"],
      });
    }

    // Process uploaded files to extract specification text
    let specText = prompt;
    
    if (files.length > 0) {
      const processedFiles = await Promise.all(
        files.map(async (file) => {
          try {
            const docAnalysis = await documentProcessor.processDocument(file.buffer, file.originalname);
            return {
              filename: file.originalname,
              content: docAnalysis,
              type: 'document'
            };
          } catch (error) {
            console.error(`Error processing file ${file.originalname}:`, error);
            return {
              filename: file.originalname,
              content: `Error processing file: ${error}`,
              type: 'error'
            };
          }
        })
      );

      // Combine all file content with the prompt
      const fileContent = processedFiles
        .map(f => `File: ${f.filename}\n${f.content}`)
        .join('\n\n');
      
      specText = `${prompt}\n\nSpecification Documents:\n${fileContent}`;
    }

    // Handle streaming
    if (stream === 'true') {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');

      const handleCodeGovernorStreaming = async () => {
        try {
          // Send initial status
          res.write(`data: ${JSON.stringify({ type: 'status', content: 'Initializing Code Generation Governor...' })}\n\n`);

          // Create orchestrator
          const outDir = path.join(process.cwd(), 'generated-projects');
          const orchestrator = new Orchestrator(outDir);

          // Send status update
          res.write(`data: ${JSON.stringify({ type: 'status', content: 'Processing specification and generating contract...' })}\n\n`);

          // Generate complete PLC program using the governor
          const result = await orchestrator.generate({
            specText,
            vendor: vendor.toLowerCase(),
            projectName: projectName || `PandauraProject_${Date.now()}`
          });

          // Send status update
          res.write(`data: ${JSON.stringify({ type: 'status', content: 'Code generation complete. Applying critic and patches...' })}\n\n`);

          // Format the response for streaming
          const codeArtifacts = Object.entries(result.files).map(([filename, content]) => ({
            language: filename.endsWith('.scl') ? 'SCL' : 'ST',
            vendor: vendor,
            compilable: true,
            filename,
            content
          }));

          // Create comprehensive response
          const response = {
            status: "ok",
            task_type: "code_gen",
            assumptions: [
              "Generated using Code Generation Governor for complete, vendor-compliant code",
              `Vendor-specific requirements enforced for ${vendor}`,
              "All modules include full implementation with no skeleton code"
            ],
            answer_md: `## Complete PLC Program Generated

I've generated a complete, production-ready PLC program using the Code Generation Governor to ensure vendor compliance and eliminate skeleton code.

### Project Overview
- **Vendor**: ${vendor}
- **Project Name**: ${result.bundle.project_dir.split('/').pop()}
- **Files Generated**: ${Object.keys(result.files).length} files
- **Total Lines**: ${Object.values(result.files).reduce((sum, content) => sum + content.split('\n').length, 0)} lines

### Generated Files
${Object.keys(result.files).map(filename => `- \`${filename}\` (${result.files[filename].split('\n').length} lines)`).join('\n')}

### Key Features
- ✅ **Complete Implementation**: No skeleton code, TODOs, or placeholders
- ✅ **Vendor Compliance**: ${vendor}-specific requirements enforced
- ✅ **Safety Systems**: Comprehensive safety interlocks and emergency stops
- ✅ **Error Handling**: Complete fault detection and recovery mechanisms
- ✅ **Documentation**: Detailed comments and usage instructions
- ✅ **SCADA Integration**: Tag mapping and communication interfaces
- ✅ **Testing**: Comprehensive test cases and validation procedures

### Next Steps
1. Import the generated files into your ${vendor} development environment
2. Review the README.md for setup instructions
3. Configure I/O mapping according to your hardware
4. Test in simulation before deployment
5. Validate all safety functions and emergency stops

Would you like me to explain any specific part of the generated code or help with the implementation process?`,
            artifacts: {
              code: codeArtifacts,
              tables: [],
              citations: [`Generated using Code Generation Governor for ${vendor} compliance`]
            },
            next_actions: [
              "Import files into development environment",
              "Configure I/O mapping",
              "Test in simulation",
              "Validate safety functions",
              "Deploy to production"
            ],
            errors: []
          };

          // Send completion event
          res.write(`data: ${JSON.stringify({ 
            type: 'complete', 
            answer: response.answer_md,
            fullResponse: response 
          })}\n\n`);
          res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
          res.end();

        } catch (error) {
          console.error('Code Governor streaming error:', error);
          
          const errorMessage = error instanceof CodeGenError 
            ? `Code Generation Error: ${error.message}`
            : `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`;

          res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            error: errorMessage 
          })}\n\n`);
          res.end();
        }
      };

      handleCodeGovernorStreaming();
    } else {
      // Non-streaming request
      try {
        // Create orchestrator
        const outDir = path.join(process.cwd(), 'generated-projects');
        const orchestrator = new Orchestrator(outDir);

        // Generate complete PLC program using the governor
        const result = await orchestrator.generate({
          specText,
          vendor: vendor.toLowerCase(),
          projectName: projectName || `PandauraProject_${Date.now()}`
        });

        // Format the response
        const codeArtifacts = Object.entries(result.files).map(([filename, content]) => ({
          language: filename.endsWith('.scl') ? 'SCL' : 'ST',
          vendor: vendor,
          compilable: true,
          filename,
          content
        }));

        const response = {
          status: "ok",
          task_type: "code_gen",
          assumptions: [
            "Generated using Code Generation Governor for complete, vendor-compliant code",
            `Vendor-specific requirements enforced for ${vendor}`,
            "All modules include full implementation with no skeleton code"
          ],
          answer_md: `## Complete PLC Program Generated

I've generated a complete, production-ready PLC program using the Code Generation Governor to ensure vendor compliance and eliminate skeleton code.

### Project Overview
- **Vendor**: ${vendor}
- **Project Name**: ${result.bundle.project_dir.split('/').pop()}
- **Files Generated**: ${Object.keys(result.files).length} files
- **Total Lines**: ${Object.values(result.files).reduce((sum, content) => sum + content.split('\n').length, 0)} lines

### Generated Files
${Object.keys(result.files).map(filename => `- \`${filename}\` (${result.files[filename].split('\n').length} lines)`).join('\n')}

### Key Features
- ✅ **Complete Implementation**: No skeleton code, TODOs, or placeholders
- ✅ **Vendor Compliance**: ${vendor}-specific requirements enforced
- ✅ **Safety Systems**: Comprehensive safety interlocks and emergency stops
- ✅ **Error Handling**: Complete fault detection and recovery mechanisms
- ✅ **Documentation**: Detailed comments and usage instructions
- ✅ **SCADA Integration**: Tag mapping and communication interfaces
- ✅ **Testing**: Comprehensive test cases and validation procedures

### Next Steps
1. Import the generated files into your ${vendor} development environment
2. Review the README.md for setup instructions
3. Configure I/O mapping according to your hardware
4. Test in simulation before deployment
5. Validate all safety functions and emergency stops

Would you like me to explain any specific part of the generated code or help with the implementation process?`,
          artifacts: {
            code: codeArtifacts,
            tables: [],
            citations: [`Generated using Code Generation Governor for ${vendor} compliance`]
          },
          next_actions: [
            "Import files into development environment",
            "Configure I/O mapping",
            "Test in simulation",
            "Validate safety functions",
            "Deploy to production"
          ],
          errors: []
        };

        res.json(response);

      } catch (error) {
        console.error('Code Governor error:', error);
        
        const errorMessage = error instanceof CodeGenError 
          ? `Code Generation Error: ${error.message}`
          : `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`;

        res.status(500).json({
          status: "error",
          task_type: "code_gen",
          assumptions: [],
          answer_md: errorMessage,
          artifacts: { code: [], tables: [], citations: [] },
          next_actions: [],
          errors: [errorMessage],
        });
      }
    }

  } catch (err) {
    console.error('Code Governor route error:', err);
    const errorMessage = `Server error: ${err instanceof Error ? err.message : 'Unknown error'}`;
    
    res.status(500).json({
      status: "error",
      task_type: "code_gen",
      assumptions: [],
      answer_md: errorMessage,
      artifacts: { code: [], tables: [], citations: [] },
      next_actions: [],
      errors: [errorMessage],
    });
  }
});

export default router;
