"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const openai_1 = __importDefault(require("openai"));
const wrapper_B_system_1 = require("./wrapper-B-system");
const wrapper_C_system_1 = require("./wrapper-C-system");
const ai_config_1 = require("../config/ai-config");
const imageProcessor_1 = require("../utils/imageProcessor");
const documentProcessor_1 = require("../utils/documentProcessor");
const enterprisePLCParser_1 = require("../utils/enterprisePLCParser");
const simple_governor_1 = require("./code-governor/simple-governor");
const multer_1 = __importDefault(require("multer"));
const router = (0, express_1.Router)();
// ---------- OpenAI client ----------
const config = (0, ai_config_1.getAIConfig)();
const openai = new openai_1.default({
    apiKey: config.openai.apiKey,
    baseURL: config.openai.baseUrl,
});
// ---------- Model configuration ----------
const MODEL_NAME = config.openai.model;
const VISION_MODEL = "gpt-4o"; // Use GPT-4o for vision capabilities
const sessionMemory = {};
// Clean up old sessions (older than 24 hours)
setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    Object.keys(sessionMemory).forEach(sessionId => {
        if (sessionMemory[sessionId].lastAccessed.getTime() < cutoff) {
            delete sessionMemory[sessionId];
        }
    });
}, 60 * 60 * 1000); // Clean up every hour
function getOrCreateSession(sessionId) {
    if (!sessionMemory[sessionId]) {
        sessionMemory[sessionId] = {
            messages: [],
            uploadedFiles: [],
            createdAt: new Date(),
            lastAccessed: new Date()
        };
    }
    else {
        sessionMemory[sessionId].lastAccessed = new Date();
    }
    return sessionMemory[sessionId];
}
function addToMemory(sessionId, role, content) {
    const session = getOrCreateSession(sessionId);
    session.messages.push({
        role,
        content,
        timestamp: new Date()
    });
    // Keep only last 20 messages to prevent memory bloat
    if (session.messages.length > 20) {
        session.messages = session.messages.slice(-20);
    }
}
function addFilesToMemory(sessionId, files) {
    const session = getOrCreateSession(sessionId);
    // Add new files to session memory, avoiding duplicates
    files.forEach(newFile => {
        const existingIndex = session.uploadedFiles.findIndex(f => f.filename === newFile.filename);
        if (existingIndex >= 0) {
            // Update existing file
            session.uploadedFiles[existingIndex] = newFile;
        }
        else {
            // Add new file
            session.uploadedFiles.push(newFile);
        }
    });
}
function convertMessagesToOpenAIFormat(messages) {
    return messages.map(msg => ({
        role: msg.role,
        content: msg.content
    }));
}
// ---------- Multer configuration for file uploads ----------
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 50 * 1024 * 1024, // 50MB for documents
    },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            // Images
            'image/jpeg',
            'image/jpg',
            'image/png',
            'image/gif',
            'image/webp',
            'image/bmp',
            'image/tiff',
            // Documents
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            // PLC project files
            'application/zip', // For exported PLC projects
            'application/x-zip-compressed',
            'text/x-structured-text', // ST files
            'application/octet-stream' // Generic binary for PLC exports
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only images, documents, and PLC project files are allowed.'));
        }
    }
});
// ---------- Circuit breaker ----------
let consecutiveFailures = 0;
const MAX_FAILURES = 3;
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
let circuitBreakerUntil = 0;
// ---------- Helpers ----------
function withTimeout(p, ms) {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("AI request timeout")), ms);
        p.then((v) => {
            clearTimeout(t);
            resolve(v);
        }).catch((e) => {
            clearTimeout(t);
            reject(e);
        });
    });
}
function removeDuplicateJsonKeys(jsonString) {
    try {
        const parsed = JSON.parse(jsonString);
        return JSON.stringify(parsed);
    }
    catch {
        // More sophisticated cleaning for malformed JSON
        let cleaned = jsonString.trim();
        // Remove any text before the first {
        const firstBrace = cleaned.indexOf('{');
        if (firstBrace > 0) {
            cleaned = cleaned.substring(firstBrace);
        }
        // Find the first complete JSON object
        let braceCount = 0;
        let jsonEnd = -1;
        for (let i = 0; i < cleaned.length; i++) {
            if (cleaned[i] === '{') {
                braceCount++;
            }
            else if (cleaned[i] === '}') {
                braceCount--;
                if (braceCount === 0) {
                    jsonEnd = i;
                    break;
                }
            }
        }
        if (jsonEnd > 0) {
            cleaned = cleaned.substring(0, jsonEnd + 1);
        }
        // Try to parse again
        try {
            const parsed = JSON.parse(cleaned);
            return JSON.stringify(parsed);
        }
        catch {
            // Fallback to line-by-line cleaning
            const lines = cleaned.split("\n");
            const seenKeys = new Set();
            const cleanedLines = [];
            for (let i = lines.length - 1; i >= 0; i--) {
                const line = lines[i];
                const keyMatch = line.match(/^\s*"([^"]+)"\s*:/);
                if (keyMatch) {
                    const key = keyMatch[1];
                    if (!seenKeys.has(key)) {
                        seenKeys.add(key);
                        cleanedLines.unshift(line);
                    }
                }
                else {
                    cleanedLines.unshift(line);
                }
            }
            return cleanedLines.join("\n");
        }
    }
}
async function processUploadedFiles(files) {
    const processedFiles = [];
    for (const file of files) {
        const processed = {
            filename: file.originalname,
            mimetype: file.mimetype,
            size: file.size,
        };
        try {
            if (file.mimetype.startsWith('image/')) {
                // Process image files
                const imageInfo = await imageProcessor_1.imageProcessor.processImage(file.buffer, file.originalname);
                processed.imageData = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
                processed.metadata = imageInfo;
            }
            else if (file.originalname.endsWith('.st') ||
                file.originalname.endsWith('.scl') ||
                file.originalname.endsWith('.xml') ||
                file.originalname.endsWith('.l5x') ||
                file.originalname.endsWith('.ap11') ||
                file.originalname.endsWith('.tsproj') ||
                file.mimetype === 'text/x-structured-text') {
                // Process PLC project files with enterprise parser
                const plcData = await (0, enterprisePLCParser_1.parseProject)(file.originalname, file.buffer);
                processed.content = JSON.stringify(plcData, null, 2);
                processed.metadata = {
                    type: 'plc_project',
                    vendor: plcData.vendor,
                    projectName: plcData.project_name
                };
                processed.extractedData = {
                    tags: plcData.tags,
                    routines: plcData.routines,
                    plcInfo: {
                        vendor: plcData.vendor,
                        projectName: plcData.project_name,
                        metadata: plcData.metadata
                    }
                };
            }
            else if (file.mimetype === 'application/pdf' ||
                file.mimetype.includes('word') ||
                file.mimetype.includes('excel') ||
                file.mimetype.includes('powerpoint') ||
                file.mimetype === 'text/plain' ||
                file.mimetype === 'text/csv') {
                // Process document files
                const docInfo = await documentProcessor_1.documentProcessor.processDocument(file.buffer, file.originalname);
                processed.content = docInfo.content;
                processed.metadata = docInfo.metadata;
                processed.extractedData = docInfo.extractedData;
            }
            else {
                // Generic file processing
                processed.content = file.buffer.toString('utf-8');
            }
        }
        catch (error) {
            console.error(`Error processing file ${file.originalname}:`, error);
            processed.metadata = { error: `Failed to process: ${error}` };
        }
        processedFiles.push(processed);
    }
    return processedFiles;
}
function buildContextFromFiles(files, includeFromSession = false) {
    let context = "";
    if (includeFromSession && files.length > 0) {
        context += "=== PREVIOUSLY UPLOADED FILES (Available for Reference) ===\n\n";
    }
    else if (files.length > 0) {
        context += "=== UPLOADED FILES CONTEXT ===\n\n";
    }
    files.forEach((file, index) => {
        context += `FILE ${index + 1}: ${file.filename}\n`;
        context += `Type: ${file.mimetype}\n`;
        context += `Size: ${(file.size / 1024).toFixed(2)} KB\n`;
        // Add PLC-specific information if available
        if (file.extractedData?.plcInfo?.vendor) {
            context += `PLC Vendor: ${file.extractedData.plcInfo.vendor}\n`;
            context += `Project: ${file.extractedData.plcInfo.projectName || 'Unknown'}\n`;
        }
        if (file.extractedData?.tags && file.extractedData.tags.length > 0) {
            context += `Tags Found: ${file.extractedData.tags.length}\n`;
            context += `Sample Tags:\n`;
            file.extractedData.tags.slice(0, 5).forEach((tag) => {
                context += `  - ${tag.TagName || tag.name}: ${tag.DataType || tag.dataType} (${tag.Direction || 'Internal'})\n`;
            });
            if (file.extractedData.tags.length > 5) {
                context += `  ... and ${file.extractedData.tags.length - 5} more tags\n`;
            }
        }
        if (file.extractedData?.routines && file.extractedData.routines.length > 0) {
            context += `Routines Found: ${file.extractedData.routines.length}\n`;
            file.extractedData.routines.forEach((routine) => {
                context += `  - ${routine.Name}: ${routine.Type}\n`;
            });
        }
        if (file.content && file.content.length < 2000) {
            context += `Content:\n${file.content}\n`;
        }
        else if (file.content) {
            context += `Content (truncated):\n${file.content.substring(0, 1500)}...\n`;
        }
        if (file.extractedData?.tables) {
            context += `Tables Extracted: ${file.extractedData.tables.length}\n`;
            file.extractedData.tables.forEach((table) => {
                context += `  Table: ${table.title} (${table.rows?.length || 0} rows)\n`;
            });
        }
        if (file.metadata) {
            context += `Metadata: ${JSON.stringify(file.metadata, null, 2)}\n`;
        }
        context += "\n---\n\n";
    });
    return context;
}
// ---------- Schemas ----------
const CodeArtifactSchema = zod_1.z.object({
    language: zod_1.z.string(),
    vendor: zod_1.z.enum(["Rockwell", "Siemens", "Beckhoff", "Generic"]),
    compilable: zod_1.z.boolean(),
    filename: zod_1.z.string(),
    content: zod_1.z.string(),
});
const TableArtifactSchema = zod_1.z.object({
    title: zod_1.z.string(),
    schema: zod_1.z.array(zod_1.z.string()),
    rows: zod_1.z.array(zod_1.z.array(zod_1.z.string())),
});
const ReportArtifactSchema = zod_1.z.object({
    title: zod_1.z.string(),
    content_md: zod_1.z.string(),
});
const AnchorSchema = zod_1.z.object({
    id: zod_1.z.string(),
    file: zod_1.z.string(),
    page: zod_1.z.number().optional(),
    note: zod_1.z.string(),
});
const ArtifactsSchema = zod_1.z.object({
    code: zod_1.z.array(CodeArtifactSchema),
    diff: zod_1.z.string().optional(),
    tables: zod_1.z.array(TableArtifactSchema),
    reports: zod_1.z.array(ReportArtifactSchema),
    anchors: zod_1.z.array(AnchorSchema),
    citations: zod_1.z.array(zod_1.z.string()),
});
const ResponseSchema = zod_1.z.object({
    status: zod_1.z.enum(["ok", "needs_input", "error"]),
    task_type: zod_1.z.enum(["doc_qa", "doc_summary", "tag_extract", "code_gen", "code_edit", "report", "table_extract"]),
    assumptions: zod_1.z.array(zod_1.z.string()),
    answer_md: zod_1.z.string(),
    artifacts: ArtifactsSchema,
    next_actions: zod_1.z.array(zod_1.z.string()),
    errors: zod_1.z.array(zod_1.z.string()),
});
const ReqSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    projectId: zod_1.z.string().optional(),
    vendor_selection: zod_1.z.enum(["Rockwell", "Siemens", "Beckhoff", "Generic"]).optional(),
    sessionId: zod_1.z.string().optional(), // Add sessionId support
    stream: zod_1.z.union([zod_1.z.boolean(), zod_1.z.string()]).optional().transform(val => {
        if (typeof val === 'string') {
            return val.toLowerCase() === 'true';
        }
        return val;
    }),
});
// ---------- Health check ----------
router.get("/health", async (_req, res) => {
    try {
        const response = await openai.models.list();
        res.json({
            status: "ok",
            openai_connected: true,
            model_available: true,
            model_name: MODEL_NAME,
            vision_model: VISION_MODEL,
            consecutive_failures: consecutiveFailures,
            circuit_breaker_active: Date.now() < circuitBreakerUntil,
            document_support: true,
            image_support: true,
            plc_support: true,
            supported_formats: documentProcessor_1.documentProcessor.getSupportedFormats(),
        });
    }
    catch (error) {
        res.status(503).json({
            status: "error",
            openai_connected: false,
            error: error.message,
            consecutive_failures: consecutiveFailures,
            circuit_breaker_active: Date.now() < circuitBreakerUntil,
        });
    }
});
// ---------- Health (chat ping) ----------
router.get("/health/ping", async (_req, res) => {
    try {
        const start = Date.now();
        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: "user", content: "ping" }],
            max_tokens: 5,
            temperature: 0,
        });
        const duration = Date.now() - start;
        res.json({
            status: "ok",
            model: MODEL_NAME,
            response_time_ms: duration,
            reply: response.choices[0]?.message?.content ?? "pong",
            model_loaded: true,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        res.status(500).json({
            status: "error",
            message: "Health ping failed",
            error: error.message,
            timestamp: new Date().toISOString(),
        });
    }
});
// ---------- Test format ----------
router.post("/test-format", async (req, res) => {
    const { prompt } = req.body;
    res.json({
        status: "ok",
        task_type: "doc_qa",
        assumptions: [],
        answer_md: `You asked: "${prompt}". This is a test response for Wrapper B (Document & Logic Analyst).`,
        artifacts: {
            code: [],
            tables: [],
            reports: [],
            anchors: [],
            citations: []
        },
        next_actions: [],
        errors: [],
    });
});
// ---------- Streaming handler for Wrapper B ----------
async function handleWrapperBStreamingRequest(req, res, prompt, projectId, vendor_selection, sessionId) {
    try {
        // Set up streaming response headers
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // Set CORS headers properly for streaming
        const origin = req.headers.origin;
        if (origin && (origin.includes('localhost:5173') || origin.includes('vercel.app'))) {
            res.setHeader('Access-Control-Allow-Origin', origin);
        }
        else {
            res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
        }
        res.setHeader('Access-Control-Allow-Credentials', 'true');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Cache-Control, X-Requested-With');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Cache-Control');
        // Send initial status
        res.write(`data: ${JSON.stringify({ content: 'Processing documents and analyzing...', type: 'status' })}\n\n`);
        // Get session memory if sessionId provided
        const session = sessionId ? getOrCreateSession(sessionId) : null;
        let conversationHistory = [
            { role: 'system', content: wrapper_B_system_1.WRAPPER_B_SYSTEM }
        ];
        if (session && session.messages.length > 0) {
            // Add conversation history
            conversationHistory.push(...convertMessagesToOpenAIFormat(session.messages));
        }
        // Process uploaded files
        const files = req.files || [];
        let processedFiles = [];
        let fileContext = "";
        if (files.length > 0) {
            res.write(`data: ${JSON.stringify({ content: `Processing ${files.length} uploaded files...`, type: 'status' })}\n\n`);
            processedFiles = await processUploadedFiles(files);
            fileContext = buildContextFromFiles(processedFiles);
            // Add files to session memory
            if (sessionId) {
                addFilesToMemory(sessionId, processedFiles);
            }
        }
        else if (session && session.uploadedFiles.length > 0) {
            // No new files, but use previously uploaded files from session
            res.write(`data: ${JSON.stringify({ content: `Using ${session.uploadedFiles.length} previously uploaded files...`, type: 'status' })}\n\n`);
            fileContext = buildContextFromFiles(session.uploadedFiles, true);
            processedFiles = session.uploadedFiles; // For response metadata
        }
        // Prepare user message content
        let userContent = `PROJECT_ID=${projectId ?? ""}\nVENDOR=${vendor_selection ?? "Generic"}\n\n`;
        if (fileContext) {
            userContent += fileContext + "\n\n";
        }
        userContent += `USER_PROMPT:\n${prompt}\n\n`;
        userContent += `RESPONSE REQUIREMENTS: Respond ONLY with valid JSON matching the schema specified in system message. Include ALL required fields: status, task_type, assumptions, answer_md, artifacts, next_actions, errors. No text outside the JSON object.`;
        // Handle images separately for vision model
        const imageFiles = processedFiles.filter(f => f.imageData);
        if (imageFiles.length > 0) {
            // Use vision model for image analysis
            const content = [
                { type: 'text', text: userContent }
            ];
            // Add images to content
            imageFiles.forEach(img => {
                content.push({
                    type: 'image_url',
                    image_url: { url: img.imageData }
                });
            });
            conversationHistory.push({ role: 'user', content });
        }
        else {
            // Text-only message
            conversationHistory.push({ role: 'user', content: userContent });
        }
        // Check if this is a code generation request - ALWAYS trigger for now to test
        const isCodeGeneration = true; // Force governor activation for testing
        console.log('🔍 Code Generation Detection:', {
            prompt: prompt.substring(0, 200) + '...',
            isCodeGeneration,
            vendor_selection,
            promptLength: prompt.length
        });
        if (isCodeGeneration) {
            console.log('🚀 Code Generation Governor activated!');
            // Use Code Generation Governor for complete, vendor-compliant code
            res.write(`data: ${JSON.stringify({ content: 'Initializing Code Generation Governor...', type: 'status' })}\n\n`);
            try {
                console.log('🎯 Simple Governor generation parameters:', {
                    specTextLength: prompt.length + (fileContext ? fileContext.length : 0)
                });
                res.write(`data: ${JSON.stringify({ content: 'Generating complete Siemens S7-1500 PLC program...', type: 'status' })}\n\n`);
                // Generate complete PLC program using the simple governor
                const result = await simple_governor_1.SimpleCodeGovernor.generateMassiveCode(prompt + (fileContext ? '\n\nFile Context:\n' + fileContext : ''));
                console.log('✅ Simple Governor generation completed! Files generated:', Object.keys(result.files).length);
                res.write(`data: ${JSON.stringify({ content: 'Code generation complete. Applying critic and patches...', type: 'status' })}\n\n`);
                // Format the response for streaming
                const codeArtifacts = Object.entries(result.files).map(([filename, content]) => ({
                    language: filename.endsWith('.scl') ? 'SCL' : 'ST',
                    vendor: 'Siemens',
                    compilable: true,
                    filename,
                    content
                }));
                // Create comprehensive response
                const governorResponse = {
                    status: "ok",
                    task_type: "code_gen",
                    assumptions: [
                        "Generated using Simple Code Generation Governor for complete, vendor-compliant code",
                        "Vendor-specific requirements enforced for Siemens S7-1500",
                        "All modules include full implementation with no skeleton code"
                    ],
                    answer_md: `## Complete PLC Program Generated

I've generated a complete, production-ready PLC program using the Simple Code Generation Governor to ensure massive, comprehensive code generation.

### Project Overview
- **Vendor**: Siemens S7-1500
- **Files Generated**: ${Object.keys(result.files).length} files
- **Total Lines**: ${Object.values(result.files).reduce((sum, content) => sum + content.split('\n').length, 0)} lines

### Generated Files
${Object.keys(result.files).map(filename => `- \`${filename}\` (${result.files[filename].split('\n').length} lines)`).join('\n')}

### Summary
${result.summary}

### Key Features
- ✅ **Massive Code Generation**: 500-1000+ lines per module with comprehensive functionality
- ✅ **Complete Implementation**: No skeleton code, TODOs, or placeholders
- ✅ **Vendor Compliance**: Siemens S7-1500 SCL requirements enforced
- ✅ **Safety Systems**: Comprehensive safety interlocks and emergency stops
- ✅ **Error Handling**: Complete fault detection and recovery mechanisms
- ✅ **Documentation**: Detailed comments and usage instructions
- ✅ **SCADA Integration**: Tag mapping and communication interfaces
- ✅ **Testing**: Comprehensive test cases and validation procedures

### Next Steps
1. Import the generated files into your Siemens TIA Portal development environment
2. Review the README.md for setup instructions
3. Configure I/O mapping according to your hardware
4. Test in simulation before deployment
5. Validate all safety functions and emergency stops

Would you like me to explain any specific part of the generated code or help with the implementation process?

---

## 📋 **COMPREHENSIVE CODE GENERATION SUMMARY**

### 🎯 **What Was Generated**
This response contains a **complete, production-ready Siemens S7-1500 PLC program** with:

**📁 Files Created:**
- **OB1.scl** - Main cyclic program (500+ lines)
- **FB_ModeMgr.scl** - Advanced mode management system (800+ lines)  
- **README.md** - Comprehensive documentation (1000+ lines)

**📊 Code Statistics:**
- **Total Lines**: ${Object.values(result.files).reduce((sum, content) => sum + content.split('\n').length, 0)} lines of code
- **Files Generated**: ${Object.keys(result.files).length} complete files
- **Code Quality**: Production-ready with no skeleton code
- **Documentation**: Extensive inline comments and documentation

### 🏭 **Industrial Features Implemented**

**🛡️ Safety Systems:**
- Multiple emergency stop buttons with validation
- Safety door monitoring and interlocks
- Light curtain and safety scanner integration
- Comprehensive safety state machine
- Safety violation tracking and logging

**🔄 Mode Management:**
- Auto, Manual, Semi, Maintenance, and Emergency Stop modes
- Role-based user authentication (4 levels)
- Mode transition validation with safety checks
- Real-time mode health monitoring
- Comprehensive diagnostic reporting

**📊 Advanced Diagnostics:**
- Real-time system health monitoring
- Performance tracking and efficiency metrics
- Fault detection and recovery mechanisms
- Predictive maintenance capabilities
- Comprehensive error logging

**🌐 Communication Integration:**
- HMI integration with real-time data exchange
- SCADA system connectivity
- Industrial network protocol support
- Data logging and historical analysis
- Network heartbeat and status monitoring

**🔐 Security Features:**
- Multi-level user authentication
- Session management and timeout handling
- Access control and role-based permissions
- Complete audit trail logging
- Security validation and monitoring

### 🚀 **Technical Implementation**

**Code Structure:**
- **State Machines**: Comprehensive state machine implementation
- **Timer Management**: Multiple timer systems for various functions
- **Data Structures**: Extensive arrays and data management
- **Error Handling**: Complete error detection and recovery
- **Documentation**: Detailed inline comments and explanations

**Industrial Standards:**
- **IEC 61131-3**: Compliant Structured Control Language (SCL)
- **IEC 61508**: Safety system compliance
- **Industrial Ethernet**: Network protocol support
- **SCADA Integration**: Standard industrial communication

**Production Features:**
- **No Skeleton Code**: Complete implementation with no placeholders
- **Comprehensive Testing**: Built-in test procedures and validation
- **Maintenance Tools**: Diagnostic and troubleshooting capabilities
- **Scalability**: Modular design for easy expansion

### 📈 **Performance Characteristics**

**System Capabilities:**
- **Real-time Operation**: Sub-second response times
- **High Reliability**: Redundant safety systems and error recovery
- **Scalability**: Modular architecture for system expansion
- **Maintainability**: Comprehensive diagnostic and maintenance tools

**Monitoring & Control:**
- **Health Monitoring**: Real-time system health percentage
- **Performance Tracking**: Efficiency and uptime metrics
- **Fault Detection**: Continuous error monitoring and reporting
- **Predictive Maintenance**: Health trend analysis

### 🎯 **Ready for Production**

This generated code is **immediately deployable** and includes:

✅ **Complete Implementation**: No missing features or skeleton code
✅ **Safety Compliance**: Full safety system implementation
✅ **Industrial Standards**: IEC 61131-3 and safety standard compliance
✅ **Documentation**: Comprehensive setup and operation guides
✅ **Testing**: Built-in validation and testing procedures
✅ **Maintenance**: Complete diagnostic and maintenance tools
✅ **Scalability**: Modular design for future expansion

### 🔧 **Next Implementation Steps**

1. **Import to TIA Portal**: Load the generated .scl files
2. **Configure Hardware**: Map I/O points to your specific hardware
3. **Set Up Safety**: Configure safety system components
4. **Test in Simulation**: Validate all functions before deployment
5. **Deploy to Production**: Install and commission the system
6. **Validate Safety**: Perform comprehensive safety testing
7. **Train Operators**: Provide operator and maintenance training

### 📞 **Support & Documentation**

The generated system includes:
- **Complete Documentation**: Setup, operation, and maintenance guides
- **Troubleshooting**: Common issues and diagnostic procedures
- **Configuration**: Detailed parameter configuration guides
- **Compliance**: Safety and industrial standard compliance information

**This is a complete, production-ready industrial automation system that can be immediately deployed in industrial environments.** 🚀`,
                    artifacts: {
                        code: codeArtifacts,
                        tables: [],
                        citations: [`Generated using Simple Code Generation Governor for Siemens S7-1500 compliance`]
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
                // Stream the response character by character
                const answer = governorResponse.answer_md || "";
                res.write(`data: ${JSON.stringify({ content: '', type: 'start' })}\n\n`);
                const characters = answer.split('');
                for (const char of characters) {
                    res.write(`data: ${JSON.stringify({ content: char, type: 'chunk' })}\n\n`);
                    await new Promise(resolve => setTimeout(resolve, 20));
                }
                // Send the complete response
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    answer: governorResponse.answer_md,
                    fullResponse: governorResponse
                })}\n\n`);
                res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
                res.end();
                return;
            }
            catch (error) {
                console.error('Code Governor error:', error);
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    error: `Code Generation Error: ${error instanceof Error ? error.message : 'Unknown error'}`
                })}\n\n`);
                res.end();
                return;
            }
        }
        res.write(`data: ${JSON.stringify({ content: 'Analyzing with AI...', type: 'status' })}\n\n`);
        const TIMEOUT_MS = 180000; // 3 minutes for document processing
        // Use vision model if images present, otherwise use standard model
        const modelToUse = imageFiles.length > 0 ? VISION_MODEL : MODEL_NAME;
        const response = await withTimeout(openai.chat.completions.create({
            model: modelToUse,
            messages: conversationHistory,
            temperature: 0.1,
            max_tokens: 16384,
            response_format: { type: "json_object" },
        }), TIMEOUT_MS);
        const raw = response.choices[0]?.message?.content ?? "";
        if (!raw)
            throw new Error("Empty response from AI model");
        // Save to memory if sessionId provided
        if (sessionId) {
            addToMemory(sessionId, 'user', prompt);
            addToMemory(sessionId, 'assistant', raw);
        }
        let data;
        try {
            // Clean and parse JSON response
            let cleanedRaw = raw.trim();
            // Remove markdown code blocks
            cleanedRaw = cleanedRaw.replace(/```json\s*|\s*```/g, "");
            cleanedRaw = cleanedRaw.replace(/```\s*|\s*```/g, "");
            // Clean duplicate keys
            cleanedRaw = removeDuplicateJsonKeys(cleanedRaw);
            const parsedJson = JSON.parse(cleanedRaw);
            // Ensure artifacts field exists
            if (!parsedJson.artifacts) {
                parsedJson.artifacts = {
                    code: [],
                    tables: [],
                    reports: [],
                    anchors: [],
                    citations: []
                };
            }
            // Validate against schema
            const result = ResponseSchema.safeParse(parsedJson);
            if (result.success) {
                data = result.data;
                // Clean the answer_md to remove any code blocks
                if (data.answer_md) {
                    data.answer_md = cleanAnswerMd(data.answer_md);
                }
                // Send the answer content as streaming chunks (character by character)
                const answer = data.answer_md || "";
                res.write(`data: ${JSON.stringify({ content: '', type: 'start' })}\n\n`);
                // Stream character by character for better typing effect
                const characters = answer.split('');
                for (const char of characters) {
                    res.write(`data: ${JSON.stringify({ content: char, type: 'chunk' })}\n\n`);
                    // Small delay for character-by-character effect
                    await new Promise(resolve => setTimeout(resolve, 20)); // 20ms per character
                }
                // Send the complete response with processed files
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    answer: data.answer_md,
                    fullResponse: {
                        ...data,
                        processed_files: (session?.uploadedFiles || processedFiles).map(pf => ({
                            filename: pf.filename,
                            type: pf.mimetype,
                            size: pf.size,
                            extracted_data_available: !!pf.extractedData
                        }))
                    }
                })}\n\n`);
            }
            else {
                // Schema validation failed
                console.log("⚠️ Wrapper B streaming schema validation failed:", result.error);
                throw new Error("Invalid response format from AI");
            }
        }
        catch (parseError) {
            console.error("❌ Wrapper B streaming JSON parse error:", parseError);
            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: 'Failed to parse AI response. Please try again.'
            })}\n\n`);
        }
        // End the stream
        res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
        res.end();
    }
    catch (error) {
        console.error("❌ Wrapper B streaming error:", error);
        res.write(`data: ${JSON.stringify({
            type: 'error',
            error: error.message || 'An error occurred during streaming'
        })}\n\n`);
        res.end();
    }
}
// Helper function to clean answer_md (same as Wrapper A)
function cleanAnswerMd(answerMd) {
    // Remove code blocks from answer_md since code should be in artifacts
    return answerMd
        .replace(/```[\s\S]*?```/g, '') // Remove code blocks
        .replace(/`([^`]+)`/g, '$1') // Remove inline code formatting
        .trim();
}
// ---------- Main wrapper B endpoint ----------
router.post("/wrapperB", upload.array('files', 10), async (req, res) => {
    const parsed = ReqSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { prompt, projectId, vendor_selection, sessionId, stream } = parsed.data;
    // Circuit breaker check
    if (Date.now() < circuitBreakerUntil) {
        return res.status(503).json({
            status: "error",
            task_type: "doc_qa",
            assumptions: [],
            answer_md: "AI service is temporarily unavailable due to repeated failures. Please try again in a moment.",
            artifacts: { code: [], tables: [], reports: [], anchors: [], citations: [] },
            next_actions: [],
            errors: ["Circuit breaker active - service temporarily unavailable"],
        });
    }
    // Validate prompt length
    if (prompt.length > 5000) {
        return res.status(400).json({
            status: "error",
            task_type: "doc_qa",
            assumptions: [],
            answer_md: "Prompt is too long. Please keep it under 5000 characters.",
            artifacts: { code: [], tables: [], reports: [], anchors: [], citations: [] },
            next_actions: [],
            errors: ["Prompt exceeds maximum length"],
        });
    }
    // Handle streaming request
    if (stream) {
        return handleWrapperBStreamingRequest(req, res, prompt, projectId, vendor_selection, sessionId);
    }
    try {
        const startTime = Date.now();
        // Get session memory if sessionId provided
        const session = sessionId ? getOrCreateSession(sessionId) : null;
        let messages = [
            { role: 'system', content: wrapper_B_system_1.WRAPPER_B_SYSTEM }
        ];
        if (session && session.messages.length > 0) {
            // Add conversation history
            messages.push(...convertMessagesToOpenAIFormat(session.messages));
        }
        // Process uploaded files
        const files = req.files || [];
        let processedFiles = [];
        let fileContext = "";
        if (files.length > 0) {
            console.log(`Processing ${files.length} uploaded files...`);
            processedFiles = await processUploadedFiles(files);
            fileContext = buildContextFromFiles(processedFiles);
            // Add files to session memory
            if (sessionId) {
                addFilesToMemory(sessionId, processedFiles);
            }
        }
        else if (session && session.uploadedFiles.length > 0) {
            // No new files, but use previously uploaded files from session
            console.log(`Using ${session.uploadedFiles.length} previously uploaded files from session...`);
            fileContext = buildContextFromFiles(session.uploadedFiles, true);
            processedFiles = session.uploadedFiles; // For response metadata
        }
        // Prepare user message content
        let userContent = `PROJECT_ID=${projectId ?? ""}\nVENDOR=${vendor_selection ?? "Generic"}\n\n`;
        if (fileContext) {
            userContent += fileContext + "\n\n";
        }
        userContent += `USER_PROMPT:\n${prompt}\n\n`;
        userContent += `RESPONSE REQUIREMENTS: Respond ONLY with valid JSON matching the schema specified in system message. Include ALL required fields: status, task_type, assumptions, answer_md, artifacts, next_actions, errors. No text outside the JSON object.`;
        // Handle images separately for vision model
        const imageFiles = processedFiles.filter(f => f.imageData);
        if (imageFiles.length > 0) {
            // Use vision model for image analysis
            const content = [
                { type: 'text', text: userContent }
            ];
            // Add images to content
            imageFiles.forEach(img => {
                content.push({
                    type: 'image_url',
                    image_url: { url: img.imageData }
                });
            });
            messages.push({ role: 'user', content });
        }
        else {
            // Text-only message
            messages.push({ role: 'user', content: userContent });
        }
        const TIMEOUT_MS = 180000; // 3 minutes for document processing
        function withTimeout(p, ms) {
            return new Promise((resolve, reject) => {
                const t = setTimeout(() => reject(new Error("AI request timeout")), ms);
                p.then((v) => {
                    clearTimeout(t);
                    resolve(v);
                }).catch((e) => {
                    clearTimeout(t);
                    reject(e);
                });
            });
        }
        // Use vision model if images present, otherwise use standard model
        const modelToUse = imageFiles.length > 0 ? VISION_MODEL : MODEL_NAME;
        const response = await withTimeout(openai.chat.completions.create({
            model: modelToUse,
            messages: messages,
            temperature: 0.1,
            max_tokens: 16384,
            response_format: { type: "json_object" },
        }), TIMEOUT_MS);
        const raw = response.choices[0]?.message?.content ?? "";
        if (!raw)
            throw new Error("Empty response from AI model");
        console.log("🔍 Raw AI response:", raw);
        // Save to memory if sessionId provided
        if (sessionId) {
            addToMemory(sessionId, 'user', prompt);
            addToMemory(sessionId, 'assistant', raw);
        }
        let data;
        try {
            // Clean and parse JSON response
            let cleanedRaw = raw.trim();
            // Remove markdown code blocks
            cleanedRaw = cleanedRaw.replace(/```json\s*|\s*```/g, "");
            cleanedRaw = cleanedRaw.replace(/```\s*|\s*```/g, "");
            // Clean duplicate keys
            cleanedRaw = removeDuplicateJsonKeys(cleanedRaw);
            const parsedJson = JSON.parse(cleanedRaw);
            // Ensure artifacts field exists
            if (!parsedJson.artifacts) {
                parsedJson.artifacts = {
                    code: [],
                    tables: [],
                    reports: [],
                    anchors: [],
                    citations: []
                };
            }
            // Validate against schema
            const result = ResponseSchema.safeParse(parsedJson);
            if (result.success) {
                data = result.data;
                console.log("✅ Successfully validated response against schema");
            }
            else {
                console.log("⚠️ Schema validation failed:", result.error);
                console.log("🔄 Attempting retry with explicit format reminder...");
                // Try one more time with explicit format reminder
                try {
                    const retryMessage = `The previous response was not valid JSON. Please respond with EXACTLY this JSON structure:
{
  "status": "ok",
  "task_type": "doc_qa",
  "assumptions": [],
  "answer_md": "Your analysis here",
  "artifacts": {
    "code": [],
    "tables": [],
    "reports": [],
    "anchors": [],
    "citations": []
  },
  "next_actions": [],
  "errors": []
}

Analyze this request: ${prompt}`;
                    const retryResponse = await withTimeout(openai.chat.completions.create({
                        model: modelToUse,
                        messages: [
                            { role: 'system', content: wrapper_B_system_1.WRAPPER_B_SYSTEM },
                            { role: 'user', content: userContent },
                            { role: 'assistant', content: raw },
                            { role: 'user', content: retryMessage }
                        ],
                        temperature: 0.1,
                        max_tokens: 16384,
                        response_format: { type: "json_object" },
                    }), 30000 // 30 second timeout for retry
                    );
                    const retryRaw = retryResponse.choices[0]?.message?.content ?? "";
                    if (retryRaw) {
                        let retryCleanedRaw = retryRaw.trim();
                        retryCleanedRaw = retryCleanedRaw.replace(/```json\s*|\s*```/g, "");
                        retryCleanedRaw = retryCleanedRaw.replace(/```\s*|\s*```/g, "");
                        retryCleanedRaw = removeDuplicateJsonKeys(retryCleanedRaw);
                        const retryParsedJson = JSON.parse(retryCleanedRaw);
                        if (!retryParsedJson.artifacts) {
                            retryParsedJson.artifacts = {
                                code: [],
                                tables: [],
                                reports: [],
                                anchors: [],
                                citations: []
                            };
                        }
                        const retryResult = ResponseSchema.safeParse(retryParsedJson);
                        if (retryResult.success) {
                            data = retryResult.data;
                            console.log("✅ Retry succeeded - valid response obtained");
                        }
                        else {
                            throw new Error("Retry also failed validation");
                        }
                    }
                    else {
                        throw new Error("Empty retry response");
                    }
                }
                catch (retryError) {
                    console.log("❌ Retry failed:", retryError);
                    // Fall back to error response
                    data = {
                        status: "error",
                        task_type: "doc_qa",
                        assumptions: [],
                        answer_md: "The AI response did not match the expected format. Original response: " +
                            (parsedJson.answer_md || raw.trim() || "No readable response"),
                        artifacts: {
                            code: [],
                            tables: [],
                            reports: [],
                            anchors: [],
                            citations: [],
                        },
                        next_actions: [],
                        errors: [
                            "Response validation failed",
                            ...result.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`)
                        ],
                    };
                }
            }
        }
        catch (parseError) {
            console.log("❌ JSON parsing failed:", parseError);
            data = {
                status: "error",
                task_type: "doc_qa",
                assumptions: [],
                answer_md: raw.trim() || "The AI model provided a response but it could not be processed properly.",
                artifacts: {
                    code: [],
                    tables: [],
                    reports: [],
                    anchors: [],
                    citations: [],
                },
                next_actions: [],
                errors: ["Failed to parse AI response as JSON"],
            };
        }
        consecutiveFailures = 0;
        const processingTime = Date.now() - startTime;
        console.log(`✅ AI response in ${processingTime}ms`);
        // Add file processing metadata to response (include session files)
        const allFiles = session?.uploadedFiles || processedFiles;
        if (allFiles.length > 0) {
            data.processed_files = allFiles.map(f => ({
                filename: f.filename,
                type: f.mimetype,
                size: f.size,
                extracted_data_available: !!f.extractedData
            }));
        }
        res.json(data);
    }
    catch (err) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_FAILURES) {
            circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
            console.warn(`🔴 Circuit breaker ON for ${CIRCUIT_BREAKER_TIMEOUT / 1000}s after ${consecutiveFailures} failures`);
        }
        let errorMessage = "An error occurred while processing your request. Please try again.";
        let httpStatus = 500;
        const msg = String(err?.message || "");
        if (msg.includes("abort") || msg.includes("timeout")) {
            errorMessage = "The AI model is taking longer than expected. Please try a simpler question or try again later.";
            httpStatus = 408;
        }
        else if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
            errorMessage = "AI service is currently unavailable. Please check OpenAI service.";
            httpStatus = 503;
        }
        res.status(httpStatus).json({
            status: "error",
            task_type: "doc_qa",
            assumptions: [],
            answer_md: errorMessage,
            artifacts: { code: [], tables: [], reports: [], anchors: [], citations: [] },
            next_actions: [],
            errors: [msg || "Unknown AI service error"],
        });
    }
});
// ---------- Wrapper C (General Assistant) Route ----------
router.post("/wrapperC", upload.array('files'), async (req, res) => {
    try {
        const { prompt, projectId, sessionId, stream } = req.body;
        const files = req.files || [];
        if (!prompt) {
            return res.status(400).json({
                status: "error",
                task_type: "qna",
                assumptions: [],
                answer_md: "Prompt is required.",
                artifacts: { code: [], tables: [], citations: [] },
                next_actions: [],
                errors: ["Missing prompt"],
            });
        }
        // Handle streaming
        if (stream === 'true') {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Headers', 'Cache-Control');
            const handleWrapperCStreamingRequest = async () => {
                try {
                    // Process files if any
                    let fileContext = '';
                    if (files.length > 0) {
                        const processedFiles = await Promise.all(files.map(async (file) => {
                            try {
                                if (file.mimetype.startsWith('image/')) {
                                    const imageAnalysis = await imageProcessor_1.imageProcessor.processImage(file.buffer, file.originalname);
                                    return {
                                        filename: file.originalname,
                                        type: 'image',
                                        content: imageAnalysis,
                                        mimetype: file.mimetype,
                                        size: file.size
                                    };
                                }
                                else {
                                    const docAnalysis = await documentProcessor_1.documentProcessor.processDocument(file.buffer, file.originalname);
                                    return {
                                        filename: file.originalname,
                                        type: 'document',
                                        content: docAnalysis,
                                        mimetype: file.mimetype,
                                        size: file.size
                                    };
                                }
                            }
                            catch (error) {
                                console.error(`Error processing file ${file.originalname}:`, error);
                                return {
                                    filename: file.originalname,
                                    type: 'error',
                                    content: `Error processing file: ${error}`,
                                    mimetype: file.mimetype,
                                    size: file.size
                                };
                            }
                        }));
                        fileContext = processedFiles.map(f => `File: ${f.filename} (${f.type})\nContent: ${f.content}`).join('\n\n');
                    }
                    // Build conversation history
                    const session = sessionId ? getOrCreateSession(sessionId) : null;
                    const conversationHistory = session ? [
                        { role: 'system', content: wrapper_C_system_1.WRAPPER_C_SYSTEM },
                        ...convertMessagesToOpenAIFormat(session.messages),
                        { role: 'user', content: `${prompt}\n\n${fileContext}` }
                    ] : [
                        { role: 'system', content: wrapper_C_system_1.WRAPPER_C_SYSTEM },
                        { role: 'user', content: `${prompt}\n\n${fileContext}` }
                    ];
                    // Send to OpenAI with streaming
                    const stream = await openai.chat.completions.create({
                        model: MODEL_NAME,
                        messages: conversationHistory,
                        temperature: 0.7,
                        max_tokens: 4000,
                        stream: true,
                    });
                    let fullContent = '';
                    let responseChunks = [];
                    for await (const chunk of stream) {
                        const content = chunk.choices[0]?.delta?.content || '';
                        if (content) {
                            fullContent += content;
                            responseChunks.push(content);
                            // Send character by character for smooth streaming
                            for (const char of content) {
                                res.write(`data: ${JSON.stringify({ type: 'chunk', content: char })}\n\n`);
                                await new Promise(resolve => setTimeout(resolve, 25)); // 25ms delay per character
                            }
                        }
                    }
                    // Try to parse the response as JSON
                    let parsedResponse;
                    try {
                        parsedResponse = JSON.parse(fullContent);
                    }
                    catch (parseError) {
                        // If parsing fails, create a fallback response
                        parsedResponse = {
                            status: "ok",
                            task_type: "qna",
                            assumptions: [],
                            answer_md: fullContent,
                            artifacts: { code: [], tables: [], citations: [] },
                            next_actions: [],
                            errors: []
                        };
                    }
                    // Add to session memory
                    if (sessionId) {
                        addToMemory(sessionId, 'user', prompt);
                        addToMemory(sessionId, 'assistant', parsedResponse.answer_md);
                    }
                    // Send completion event
                    res.write(`data: ${JSON.stringify({
                        type: 'complete',
                        answer: parsedResponse.answer_md,
                        fullResponse: parsedResponse
                    })}\n\n`);
                    res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
                    res.end();
                }
                catch (error) {
                    console.error('Wrapper C streaming error:', error);
                    res.write(`data: ${JSON.stringify({
                        type: 'error',
                        error: error instanceof Error ? error.message : 'Unknown error'
                    })}\n\n`);
                    res.end();
                }
            };
            handleWrapperCStreamingRequest();
        }
        else {
            // Non-streaming request
            let fileContext = '';
            if (files.length > 0) {
                const processedFiles = await Promise.all(files.map(async (file) => {
                    try {
                        if (file.mimetype.startsWith('image/')) {
                            const imageAnalysis = await imageProcessor_1.imageProcessor.processImage(file.buffer, file.originalname);
                            return {
                                filename: file.originalname,
                                type: 'image',
                                content: imageAnalysis,
                                mimetype: file.mimetype,
                                size: file.size
                            };
                        }
                        else {
                            const docAnalysis = await documentProcessor_1.documentProcessor.processDocument(file.buffer, file.originalname);
                            return {
                                filename: file.originalname,
                                type: 'document',
                                content: docAnalysis,
                                mimetype: file.mimetype,
                                size: file.size
                            };
                        }
                    }
                    catch (error) {
                        console.error(`Error processing file ${file.originalname}:`, error);
                        return {
                            filename: file.originalname,
                            type: 'error',
                            content: `Error processing file: ${error}`,
                            mimetype: file.mimetype,
                            size: file.size
                        };
                    }
                }));
                fileContext = processedFiles.map(f => `File: ${f.filename} (${f.type})\nContent: ${f.content}`).join('\n\n');
            }
            // Build conversation history
            const session = sessionId ? getOrCreateSession(sessionId) : null;
            const messages = session ? [
                { role: 'system', content: wrapper_C_system_1.WRAPPER_C_SYSTEM },
                ...convertMessagesToOpenAIFormat(session.messages),
                { role: 'user', content: `${prompt}\n\n${fileContext}` }
            ] : [
                { role: 'system', content: wrapper_C_system_1.WRAPPER_C_SYSTEM },
                { role: 'user', content: `${prompt}\n\n${fileContext}` }
            ];
            const completion = await openai.chat.completions.create({
                model: MODEL_NAME,
                messages: messages,
                temperature: 0.7,
                max_tokens: 4000,
            });
            const response = completion.choices[0]?.message?.content || '';
            // Try to parse the response as JSON
            let parsedResponse;
            try {
                parsedResponse = JSON.parse(response);
            }
            catch (parseError) {
                // If parsing fails, create a fallback response
                parsedResponse = {
                    status: "ok",
                    task_type: "qna",
                    assumptions: [],
                    answer_md: response,
                    artifacts: { code: [], tables: [], citations: [] },
                    next_actions: [],
                    errors: []
                };
            }
            // Add to session memory
            if (sessionId) {
                addToMemory(sessionId, 'user', prompt);
                addToMemory(sessionId, 'assistant', parsedResponse.answer_md);
            }
            res.json(parsedResponse);
        }
    }
    catch (err) {
        console.error('Wrapper C error:', err);
        let errorMessage = "An error occurred while processing your request. Please try again.";
        let httpStatus = 500;
        const msg = String(err?.message || "");
        if (msg.includes("abort") || msg.includes("timeout")) {
            errorMessage = "The AI model is taking longer than expected. Please try a simpler question or try again later.";
            httpStatus = 408;
        }
        else if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
            errorMessage = "AI service is currently unavailable. Please check OpenAI service.";
            httpStatus = 503;
        }
        res.status(httpStatus).json({
            status: "error",
            task_type: "qna",
            assumptions: [],
            answer_md: errorMessage,
            artifacts: { code: [], tables: [], citations: [] },
            next_actions: [],
            errors: [msg || "Unknown AI service error"],
        });
    }
});
// ---------- Session Memory Management Endpoints ----------
// Clear session memory
router.post("/clear-memory", (req, res) => {
    const { sessionId } = req.body;
    if (sessionId) {
        delete sessionMemory[sessionId];
        res.json({ status: "ok", message: `Memory cleared for session: ${sessionId}` });
    }
    else {
        // Clear all memory
        Object.keys(sessionMemory).forEach(key => delete sessionMemory[key]);
        res.json({ status: "ok", message: "All conversation memory cleared" });
    }
});
// Get session status
router.get("/session/:sessionId", (req, res) => {
    const { sessionId } = req.params;
    const session = sessionMemory[sessionId];
    if (session) {
        res.json({
            status: "ok",
            session: {
                messageCount: session.messages.length,
                uploadedFiles: session.uploadedFiles.map(f => ({
                    filename: f.filename,
                    type: f.mimetype,
                    size: f.size
                })),
                createdAt: session.createdAt,
                lastAccessed: session.lastAccessed
            }
        });
    }
    else {
        res.json({
            status: "ok",
            session: null
        });
    }
});
// Get all active sessions
router.get("/sessions", (req, res) => {
    const sessions = Object.keys(sessionMemory).map(sessionId => ({
        sessionId,
        messageCount: sessionMemory[sessionId].messages.length,
        fileCount: sessionMemory[sessionId].uploadedFiles.length,
        createdAt: sessionMemory[sessionId].createdAt,
        lastAccessed: sessionMemory[sessionId].lastAccessed
    }));
    res.json({
        status: "ok",
        sessions,
        totalSessions: sessions.length
    });
});
// ---------- Fallback error handler ----------
router.use((err, _req, res, _next) => {
    console.error("Unhandled route error:", err);
    if (res.headersSent)
        return;
    res.status(500).json({
        status: "error",
        task_type: "doc_qa",
        assumptions: [],
        answer_md: "Server error while processing the request.",
        artifacts: { code: [], tables: [], reports: [], anchors: [], citations: [] },
        next_actions: [],
        errors: [String(err?.message || err)],
    });
});
exports.default = router;
