"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const openai_1 = __importDefault(require("openai"));
const wrapper_A_system_1 = require("./wrapper-A-system");
const ai_config_1 = require("../config/ai-config");
const imageProcessor_1 = require("../utils/imageProcessor");
const documentProcessor_1 = require("../utils/documentProcessor");
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
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only images and documents are allowed.'));
        }
    }
});
const conversationMemory = {};
const MEMORY_EXPIRY = 30 * 60 * 1000; // 30 minutes
function getOrCreateSession(sessionId) {
    const now = Date.now();
    if (!conversationMemory[sessionId] ||
        (now - conversationMemory[sessionId].lastUpdated) > MEMORY_EXPIRY) {
        conversationMemory[sessionId] = {
            messages: [{ role: 'system', content: wrapper_A_system_1.WRAPPER_A_SYSTEM }],
            lastUpdated: now
        };
    }
    return conversationMemory[sessionId];
}
function addToMemory(sessionId, role, content) {
    const session = getOrCreateSession(sessionId);
    session.messages.push({ role, content });
    session.lastUpdated = Date.now();
    // Keep only last 20 messages to prevent context overflow
    if (session.messages.length > 20) {
        session.messages = [
            session.messages[0], // Keep system message
            ...session.messages.slice(-19) // Keep last 19 messages
        ];
    }
}
// Convert memory messages to OpenAI format
function convertMessagesToOpenAIFormat(messages) {
    return messages.map(msg => ({
        role: msg.role,
        content: msg.content
    }));
}
// ---------- Circuit breaker ----------
let consecutiveFailures = 0;
const MAX_FAILURES = 3;
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
let circuitBreakerUntil = 0;
// ---------- Helpers ----------
// Helper function to clean answer_md by removing code blocks
function cleanAnswerMd(answerMd) {
    // Remove code blocks (```...```)
    let cleaned = answerMd.replace(/```[\s\S]*?```/g, '');
    // Remove inline code blocks (`...`)
    cleaned = cleaned.replace(/`[^`]*`/g, '');
    // Remove "Next step →" sentences
    cleaned = cleaned.replace(/Next step → .*/gi, '');
    // Clean up extra whitespace
    cleaned = cleaned.replace(/\n\s*\n\s*\n/g, '\n\n');
    return cleaned.trim();
}
function removeDuplicateJsonKeys(jsonString) {
    try {
        const parsed = JSON.parse(jsonString);
        return JSON.stringify(parsed);
    }
    catch {
        const lines = jsonString.split("\n");
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
// ---------- Schemas ----------
const CodeArtifactSchema = zod_1.z.object({
    language: zod_1.z.string().optional(),
    vendor: zod_1.z.enum(["Rockwell", "Siemens", "Beckhoff", "Generic"]).optional(),
    compilable: zod_1.z.boolean().optional(),
    filename: zod_1.z.string().optional(),
    content: zod_1.z.string().optional(),
    code: zod_1.z.string().optional(),
});
const TableArtifactSchema = zod_1.z.object({
    title: zod_1.z.string(),
    schema: zod_1.z.array(zod_1.z.string()),
    rows: zod_1.z.array(zod_1.z.array(zod_1.z.string())),
});
const ArtifactsSchema = zod_1.z.object({
    code: zod_1.z.array(CodeArtifactSchema),
    tables: zod_1.z.array(TableArtifactSchema),
    citations: zod_1.z.array(zod_1.z.string()),
    diff: zod_1.z.string().optional(),
});
const ResponseSchema = zod_1.z.object({
    status: zod_1.z.enum(["ok", "needs_input", "error"]),
    task_type: zod_1.z.enum(["qna", "code_gen", "code_edit", "debug", "optimize", "calc", "checklist", "report", "image_analysis", "document_analysis"]),
    assumptions: zod_1.z.array(zod_1.z.string()),
    answer_md: zod_1.z.string(),
    artifacts: ArtifactsSchema.optional(),
    next_actions: zod_1.z.array(zod_1.z.string()),
    errors: zod_1.z.array(zod_1.z.string()),
});
const ReqSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    projectId: zod_1.z.string().optional(),
    vendor_selection: zod_1.z.enum(["Rockwell", "Siemens", "Beckhoff", "Generic"]).optional(),
    sessionId: zod_1.z.string().optional(),
    stream: zod_1.z.boolean().optional(),
});
// ---------- Health check ----------
router.get("/health", async (_req, res) => {
    try {
        // Test OpenAI API connection
        const response = await openai.models.list();
        res.json({
            status: "ok",
            openai_connected: true,
            model_available: true,
            model_name: MODEL_NAME,
            vision_model: VISION_MODEL,
            consecutive_failures: consecutiveFailures,
            circuit_breaker_active: Date.now() < circuitBreakerUntil,
            memory_sessions: Object.keys(conversationMemory).length,
            image_support: true,
            document_support: true,
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
// ---------- Warmup ----------
router.post("/warmup", async (_req, res) => {
    try {
        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: "user", content: "Ready" }],
            max_tokens: 10,
            temperature: 0,
        });
        res.json({
            status: "ok",
            message: "Model warmed up successfully",
            model: MODEL_NAME,
            response: response.choices[0]?.message?.content || "Ready",
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ---------- Simple test ----------
router.post("/test", async (_req, res) => {
    try {
        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: [{ role: "user", content: 'Say "Hello"' }],
            max_tokens: 10,
            temperature: 0,
        });
        res.json({
            status: "ok",
            message: response.choices[0]?.message?.content || "No response",
            model: MODEL_NAME,
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// ---------- Test format ----------
router.post("/test-format", async (req, res) => {
    const { prompt } = req.body;
    res.json({
        status: "ok",
        task_type: "qna",
        assumptions: [],
        answer_md: `You asked: "${prompt}". This is a test response to verify the JSON format is working correctly.`,
        artifacts: { code: [], tables: [], citations: [] },
        next_actions: [],
        errors: [],
    });
});
// ---------- Clear memory ----------
router.post("/clear-memory", (req, res) => {
    const { sessionId } = req.body;
    if (sessionId) {
        delete conversationMemory[sessionId];
        res.json({ status: "ok", message: `Memory cleared for session: ${sessionId}` });
    }
    else {
        // Clear all memory
        Object.keys(conversationMemory).forEach(key => delete conversationMemory[key]);
        res.json({ status: "ok", message: "All conversation memory cleared" });
    }
});
// ---------- Image upload endpoint ----------
router.post("/upload-image", upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "No image file provided" });
        }
        // Validate image
        const validation = imageProcessor_1.imageProcessor.validateImage(req.file);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }
        // Save image
        const imageInfo = await imageProcessor_1.imageProcessor.saveImage(req.file);
        res.json({
            status: "ok",
            message: "Image uploaded successfully",
            image: {
                id: imageInfo.id,
                filename: imageInfo.filename,
                originalName: imageInfo.originalName,
                size: imageInfo.size,
                mimeType: imageInfo.mimeType,
                uploadedAt: imageInfo.uploadedAt
            }
        });
    }
    catch (error) {
        console.error('Image upload error:', error);
        res.status(500).json({ error: error.message });
    }
});
// ---------- Main wrapper with image support ----------
router.post("/wrapperA", async (req, res) => {
    console.log("🔔 /wrapperA OpenAI request received", req.body);
    // Check if this is a multipart form request (with images)
    if (req.headers['content-type']?.includes('multipart/form-data')) {
        return handleMultipartRequest(req, res);
    }
    // Handle regular JSON request
    const parsed = ReqSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { prompt, projectId, vendor_selection, sessionId, stream } = parsed.data;
    // Circuit breaker
    if (Date.now() < circuitBreakerUntil) {
        return res.status(503).json({
            status: "error",
            task_type: "qna",
            assumptions: [],
            answer_md: "AI service is temporarily unavailable due to repeated failures. Please try again in a moment.",
            artifacts: { code: [], tables: [], citations: [] },
            next_actions: [],
            errors: ["Circuit breaker active - service temporarily unavailable"],
        });
    }
    // Validate prompt length
    if (prompt.length > 4000) {
        return res.status(400).json({
            status: "error",
            task_type: "qna",
            assumptions: [],
            answer_md: "Prompt is too long. Please keep it under 4000 characters.",
            artifacts: { code: [], tables: [], citations: [] },
            next_actions: [],
            errors: ["Prompt exceeds maximum length"],
        });
    }
    // Handle streaming
    if (stream) {
        return handleStreamingRequest(req, res, prompt, projectId, vendor_selection, sessionId);
    }
    // Handle non-streaming request
    return handleNonStreamingRequest(req, res, prompt, projectId, vendor_selection, sessionId);
});
// ---------- Handle multipart form requests (from frontend) ----------
async function handleMultipartRequest(req, res) {
    try {
        // Use multer to handle the multipart form data
        upload.any()(req, res, async (err) => {
            if (err) {
                return res.status(400).json({ error: err.message });
            }
            const { prompt, projectId, vendor_selection, sessionId } = req.body;
            const files = req.files || [];
            if (!prompt) {
                return res.status(400).json({ error: "No prompt provided" });
            }
            // If no files, handle as regular text request
            if (files.length === 0) {
                return handleNonStreamingRequest(req, res, prompt, projectId, vendor_selection, sessionId);
            }
            // Separate images and documents
            const imageFiles = files.filter((file) => file.mimetype.startsWith('image/'));
            const documentFiles = files.filter((file) => !file.mimetype.startsWith('image/'));
            // Process images
            const imageInfos = [];
            for (const file of imageFiles) {
                const validation = imageProcessor_1.imageProcessor.validateImage(file);
                if (!validation.valid) {
                    return res.status(400).json({ error: validation.error });
                }
                const imageInfo = await imageProcessor_1.imageProcessor.saveImage(file);
                imageInfos.push(imageInfo);
            }
            // Process documents
            const documentInfos = [];
            let documentText = '';
            if (documentFiles.length > 0) {
                documentText = `\n\n=== MULTIPLE DOCUMENTS UPLOADED (${documentFiles.length} files) ===\n`;
                for (const file of documentFiles) {
                    const validation = documentProcessor_1.documentProcessor.validateDocument(file);
                    if (!validation.valid) {
                        return res.status(400).json({ error: validation.error });
                    }
                    const documentInfo = await documentProcessor_1.documentProcessor.saveDocument(file);
                    documentInfos.push(documentInfo);
                    // Extract text from document
                    const extractedText = await documentProcessor_1.documentProcessor.extractTextFromDocument(documentInfo);
                    documentText += extractedText;
                }
                documentText += `\n=== END OF DOCUMENTS ===\n`;
            }
            // Convert images to base64
            const imageBase64s = await Promise.all(imageInfos.map(img => imageProcessor_1.imageProcessor.getImageBase64(img.path)));
            // Prepare messages
            const session = sessionId ? getOrCreateSession(sessionId) : null;
            const messages = session ? convertMessagesToOpenAIFormat(session.messages) : [{ role: 'system', content: wrapper_A_system_1.WRAPPER_A_SYSTEM }];
            // Build the complete prompt with document text
            let fullPrompt = `PROJECT_ID=${projectId ?? ""}\nVENDOR=${vendor_selection ?? "Generic"}\nUSER_PROMPT:\n${prompt}`;
            if (documentText) {
                fullPrompt += `\n\nDOCUMENT CONTENT:\n${documentText}`;
            }
            // Add current user message with images and documents
            let userMessage;
            if (imageBase64s.length > 0) {
                // If there are images, use multimodal format
                userMessage = {
                    role: 'user',
                    content: [
                        { type: 'text', text: fullPrompt },
                        ...imageBase64s.map(base64 => ({ type: 'image_url', image_url: { url: base64 } }))
                    ]
                };
            }
            else {
                // If there are only documents, use text format
                userMessage = {
                    role: 'user',
                    content: fullPrompt
                };
            }
            messages.push(userMessage);
            // Call OpenAI with appropriate model
            const modelToUse = imageBase64s.length > 0 ? VISION_MODEL : MODEL_NAME;
            const response = await openai.chat.completions.create({
                model: modelToUse,
                messages: messages,
                response_format: { type: "json_object" },
                max_tokens: 2000,
                temperature: 0.2,
            });
            const raw = response.choices[0]?.message?.content ?? "";
            if (!raw)
                throw new Error("Empty response from AI model");
            console.log("🔍 Raw OpenAI vision response:", raw);
            let data;
            try {
                // Parse and validate response (same logic as text-only requests)
                let cleanedRaw = raw.trim();
                cleanedRaw = cleanedRaw.replace(/```json\s*|\s*```/g, "");
                cleanedRaw = cleanedRaw.replace(/```\s*|\s*```/g, "");
                let jsonString = "";
                let jsonMatch = cleanedRaw.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    jsonString = jsonMatch[0];
                }
                else {
                    const openBrace = cleanedRaw.indexOf('{');
                    if (openBrace !== -1) {
                        let braceCount = 0;
                        let endPos = -1;
                        for (let i = openBrace; i < cleanedRaw.length; i++) {
                            if (cleanedRaw[i] === '{')
                                braceCount++;
                            if (cleanedRaw[i] === '}')
                                braceCount--;
                            if (braceCount === 0) {
                                endPos = i;
                                break;
                            }
                        }
                        if (endPos !== -1) {
                            jsonString = cleanedRaw.substring(openBrace, endPos + 1);
                        }
                    }
                }
                if (!jsonString)
                    throw new Error("No JSON structure found in response");
                jsonString = removeDuplicateJsonKeys(jsonString);
                const parsedJson = JSON.parse(jsonString);
                if (!parsedJson.artifacts) {
                    parsedJson.artifacts = {
                        code: [],
                        tables: [],
                        citations: []
                    };
                }
                const result = ResponseSchema.safeParse(parsedJson);
                if (result.success) {
                    data = result.data;
                    // Clean the answer_md to remove any code blocks
                    if (data.answer_md) {
                        data.answer_md = cleanAnswerMd(data.answer_md);
                    }
                    console.log("✅ Successfully validated vision response against schema");
                }
                else {
                    console.log("⚠️ Schema validation failed:", result.error);
                    data = {
                        status: "error",
                        task_type: "image_analysis",
                        assumptions: [],
                        answer_md: "The AI response did not match the expected format. Original response: " +
                            (parsedJson.answer_md || raw.trim() || "No readable response"),
                        artifacts: {
                            code: [],
                            tables: [],
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
            catch (parseError) {
                console.log("❌ JSON parsing failed:", parseError);
                data = {
                    status: "error",
                    task_type: "image_analysis",
                    assumptions: [],
                    answer_md: raw.trim() || "The AI model provided a response but it could not be processed properly.",
                    artifacts: {
                        code: [],
                        tables: [],
                        citations: [],
                    },
                    next_actions: [],
                    errors: ["Failed to parse AI response as JSON"],
                };
            }
            // Save to memory if sessionId provided
            if (sessionId) {
                addToMemory(sessionId, 'user', userMessage.content); // Save the content, not the full message object
                addToMemory(sessionId, 'assistant', raw);
            }
            // Clean up files after processing
            setTimeout(() => {
                imageInfos.forEach(img => imageProcessor_1.imageProcessor.deleteImage(img.path));
                documentInfos.forEach(doc => documentProcessor_1.documentProcessor.deleteDocument(doc.path));
            }, 60000); // Delete after 1 minute
            consecutiveFailures = 0;
            res.json(data);
        });
    }
    catch (err) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_FAILURES) {
            circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
            console.warn(`🔴 Circuit breaker ON for ${CIRCUIT_BREAKER_TIMEOUT / 1000}s after ${consecutiveFailures} failures`);
        }
        let errorMessage = "An error occurred while processing your image. Please try again.";
        let httpStatus = 500;
        const msg = String(err?.message || "");
        if (msg.includes("abort") || msg.includes("timeout")) {
            errorMessage = "The AI model is taking longer than expected. Please try a simpler image or try again later.";
            httpStatus = 408;
        }
        else if (msg.includes("ECONNREFUSED") ||
            msg.includes("fetch failed") ||
            msg.includes("connect") ||
            msg.includes("API key") ||
            msg.includes("authentication")) {
            errorMessage = "AI service is currently unavailable. Please check your OpenAI API configuration.";
            httpStatus = 503;
        }
        res.status(httpStatus).json({
            status: "error",
            task_type: "image_analysis",
            assumptions: [],
            answer_md: errorMessage,
            artifacts: { code: [], tables: [], citations: [] },
            next_actions: [],
            errors: [msg || "Unknown AI service error"],
        });
    }
}
// ---------- Document analysis endpoint ----------
router.post("/analyze-document", upload.single('document'), async (req, res) => {
    try {
        const { prompt, sessionId } = req.body;
        if (!req.file) {
            return res.status(400).json({ error: "No document file provided" });
        }
        if (!prompt) {
            return res.status(400).json({ error: "No prompt provided" });
        }
        // Validate document
        const validation = documentProcessor_1.documentProcessor.validateDocument(req.file);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }
        // Save document
        const documentInfo = await documentProcessor_1.documentProcessor.saveDocument(req.file);
        // Extract text from document
        const extractedText = await documentProcessor_1.documentProcessor.extractTextFromDocument(documentInfo);
        // Prepare messages
        const session = sessionId ? getOrCreateSession(sessionId) : null;
        const messages = session ? convertMessagesToOpenAIFormat(session.messages) : [{ role: 'system', content: wrapper_A_system_1.WRAPPER_A_SYSTEM }];
        // Add current user message with document content
        const userMessage = {
            role: 'user',
            content: `PROJECT_ID=${req.body.projectId ?? ""}\nVENDOR=${req.body.vendor_selection ?? "Generic"}\nUSER_PROMPT:\n${prompt}\n\nDOCUMENT CONTENT:\n${extractedText}`
        };
        messages.push(userMessage);
        // Call OpenAI with text model
        const response = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: messages,
            response_format: { type: "json_object" },
            max_tokens: 2000,
            temperature: 0.2,
        });
        const raw = response.choices[0]?.message?.content ?? "";
        if (!raw)
            throw new Error("Empty response from AI model");
        console.log("🔍 Raw OpenAI document response:", raw);
        let data;
        try {
            // Parse and validate response (same logic as text-only requests)
            let cleanedRaw = raw.trim();
            cleanedRaw = cleanedRaw.replace(/```json\s*|\s*```/g, "");
            cleanedRaw = cleanedRaw.replace(/```\s*|\s*```/g, "");
            let jsonString = "";
            let jsonMatch = cleanedRaw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonString = jsonMatch[0];
            }
            else {
                const openBrace = cleanedRaw.indexOf('{');
                if (openBrace !== -1) {
                    let braceCount = 0;
                    let endPos = -1;
                    for (let i = openBrace; i < cleanedRaw.length; i++) {
                        if (cleanedRaw[i] === '{')
                            braceCount++;
                        if (cleanedRaw[i] === '}')
                            braceCount--;
                        if (braceCount === 0) {
                            endPos = i;
                            break;
                        }
                    }
                    if (endPos !== -1) {
                        jsonString = cleanedRaw.substring(openBrace, endPos + 1);
                    }
                }
            }
            if (!jsonString)
                throw new Error("No JSON structure found in response");
            jsonString = removeDuplicateJsonKeys(jsonString);
            const parsedJson = JSON.parse(jsonString);
            if (!parsedJson.artifacts) {
                parsedJson.artifacts = {
                    code: [],
                    tables: [],
                    citations: []
                };
            }
            const result = ResponseSchema.safeParse(parsedJson);
            if (result.success) {
                data = result.data;
                // Clean the answer_md to remove any code blocks
                if (data.answer_md) {
                    data.answer_md = cleanAnswerMd(data.answer_md);
                }
                console.log("✅ Successfully validated document response against schema");
            }
            else {
                console.log("⚠️ Schema validation failed:", result.error);
                data = {
                    status: "error",
                    task_type: "document_analysis",
                    assumptions: [],
                    answer_md: "The AI response did not match the expected format. Original response: " +
                        (parsedJson.answer_md || raw.trim() || "No readable response"),
                    artifacts: {
                        code: [],
                        tables: [],
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
        catch (parseError) {
            console.log("❌ JSON parsing failed:", parseError);
            data = {
                status: "error",
                task_type: "document_analysis",
                assumptions: [],
                answer_md: raw.trim() || "The AI model provided a response but it could not be processed properly.",
                artifacts: {
                    code: [],
                    tables: [],
                    citations: [],
                },
                next_actions: [],
                errors: ["Failed to parse AI response as JSON"],
            };
        }
        // Save to memory if sessionId provided
        if (sessionId) {
            addToMemory(sessionId, 'user', userMessage);
            addToMemory(sessionId, 'assistant', raw);
        }
        // Clean up document file after processing
        setTimeout(() => {
            documentProcessor_1.documentProcessor.deleteDocument(documentInfo.path);
        }, 60000); // Delete after 1 minute
        consecutiveFailures = 0;
        res.json(data);
    }
    catch (err) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_FAILURES) {
            circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
            console.warn(`🔴 Circuit breaker ON for ${CIRCUIT_BREAKER_TIMEOUT / 1000}s after ${consecutiveFailures} failures`);
        }
        let errorMessage = "An error occurred while processing your document. Please try again.";
        let httpStatus = 500;
        const msg = String(err?.message || "");
        if (msg.includes("abort") || msg.includes("timeout")) {
            errorMessage = "The AI model is taking longer than expected. Please try a simpler document or try again later.";
            httpStatus = 408;
        }
        else if (msg.includes("ECONNREFUSED") ||
            msg.includes("fetch failed") ||
            msg.includes("connect") ||
            msg.includes("API key") ||
            msg.includes("authentication")) {
            errorMessage = "AI service is currently unavailable. Please check your OpenAI API configuration.";
            httpStatus = 503;
        }
        res.status(httpStatus).json({
            status: "error",
            task_type: "document_analysis",
            assumptions: [],
            answer_md: errorMessage,
            artifacts: { code: [], tables: [], citations: [] },
            next_actions: [],
            errors: [msg || "Unknown AI service error"],
        });
    }
});
// ---------- Image analysis endpoint ----------
router.post("/analyze-image", upload.single('image'), async (req, res) => {
    try {
        const { prompt, sessionId } = req.body;
        if (!req.file) {
            return res.status(400).json({ error: "No image file provided" });
        }
        if (!prompt) {
            return res.status(400).json({ error: "No prompt provided" });
        }
        // Validate image
        const validation = imageProcessor_1.imageProcessor.validateImage(req.file);
        if (!validation.valid) {
            return res.status(400).json({ error: validation.error });
        }
        // Save image
        const imageInfo = await imageProcessor_1.imageProcessor.saveImage(req.file);
        // Convert image to base64
        const imageBase64 = await imageProcessor_1.imageProcessor.getImageBase64(imageInfo.path);
        // Prepare messages
        const session = sessionId ? getOrCreateSession(sessionId) : null;
        const messages = session ? convertMessagesToOpenAIFormat(session.messages) : [{ role: 'system', content: wrapper_A_system_1.WRAPPER_A_SYSTEM }];
        // Add current user message with image
        const userMessage = {
            role: 'user',
            content: [
                { type: 'text', text: `PROJECT_ID=${req.body.projectId ?? ""}\nVENDOR=${req.body.vendor_selection ?? "Generic"}\nUSER_PROMPT:\n${prompt}` },
                { type: 'image_url', image_url: { url: imageBase64 } }
            ]
        };
        messages.push(userMessage);
        // Call OpenAI with vision model
        const response = await openai.chat.completions.create({
            model: VISION_MODEL,
            messages: messages,
            response_format: { type: "json_object" },
            max_tokens: 2000,
            temperature: 0.2,
        });
        const raw = response.choices[0]?.message?.content ?? "";
        if (!raw)
            throw new Error("Empty response from AI model");
        console.log("🔍 Raw OpenAI vision response:", raw);
        let data;
        try {
            // Parse and validate response (same logic as text-only requests)
            let cleanedRaw = raw.trim();
            cleanedRaw = cleanedRaw.replace(/```json\s*|\s*```/g, "");
            cleanedRaw = cleanedRaw.replace(/```\s*|\s*```/g, "");
            let jsonString = "";
            let jsonMatch = cleanedRaw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonString = jsonMatch[0];
            }
            else {
                const openBrace = cleanedRaw.indexOf('{');
                if (openBrace !== -1) {
                    let braceCount = 0;
                    let endPos = -1;
                    for (let i = openBrace; i < cleanedRaw.length; i++) {
                        if (cleanedRaw[i] === '{')
                            braceCount++;
                        if (cleanedRaw[i] === '}')
                            braceCount--;
                        if (braceCount === 0) {
                            endPos = i;
                            break;
                        }
                    }
                    if (endPos !== -1) {
                        jsonString = cleanedRaw.substring(openBrace, endPos + 1);
                    }
                }
            }
            if (!jsonString)
                throw new Error("No JSON structure found in response");
            jsonString = removeDuplicateJsonKeys(jsonString);
            const parsedJson = JSON.parse(jsonString);
            if (!parsedJson.artifacts) {
                parsedJson.artifacts = {
                    code: [],
                    tables: [],
                    citations: []
                };
            }
            const result = ResponseSchema.safeParse(parsedJson);
            if (result.success) {
                data = result.data;
                // Clean the answer_md to remove any code blocks
                if (data.answer_md) {
                    data.answer_md = cleanAnswerMd(data.answer_md);
                }
                console.log("✅ Successfully validated vision response against schema");
            }
            else {
                console.log("⚠️ Schema validation failed:", result.error);
                data = {
                    status: "error",
                    task_type: "image_analysis",
                    assumptions: [],
                    answer_md: "The AI response did not match the expected format. Original response: " +
                        (parsedJson.answer_md || raw.trim() || "No readable response"),
                    artifacts: {
                        code: [],
                        tables: [],
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
        catch (parseError) {
            console.log("❌ JSON parsing failed:", parseError);
            data = {
                status: "error",
                task_type: "image_analysis",
                assumptions: [],
                answer_md: raw.trim() || "The AI model provided a response but it could not be processed properly.",
                artifacts: {
                    code: [],
                    tables: [],
                    citations: [],
                },
                next_actions: [],
                errors: ["Failed to parse AI response as JSON"],
            };
        }
        // Save to memory if sessionId provided
        if (sessionId) {
            addToMemory(sessionId, 'user', userMessage);
            addToMemory(sessionId, 'assistant', raw);
        }
        // Clean up image file after processing
        setTimeout(() => {
            imageProcessor_1.imageProcessor.deleteImage(imageInfo.path);
        }, 60000); // Delete after 1 minute
        consecutiveFailures = 0;
        res.json(data);
    }
    catch (err) {
        consecutiveFailures++;
        if (consecutiveFailures >= MAX_FAILURES) {
            circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
            console.warn(`🔴 Circuit breaker ON for ${CIRCUIT_BREAKER_TIMEOUT / 1000}s after ${consecutiveFailures} failures`);
        }
        let errorMessage = "An error occurred while processing your image. Please try again.";
        let httpStatus = 500;
        const msg = String(err?.message || "");
        if (msg.includes("abort") || msg.includes("timeout")) {
            errorMessage = "The AI model is taking longer than expected. Please try a simpler image or try again later.";
            httpStatus = 408;
        }
        else if (msg.includes("ECONNREFUSED") ||
            msg.includes("fetch failed") ||
            msg.includes("connect") ||
            msg.includes("API key") ||
            msg.includes("authentication")) {
            errorMessage = "AI service is currently unavailable. Please check your OpenAI API configuration.";
            httpStatus = 503;
        }
        res.status(httpStatus).json({
            status: "error",
            task_type: "image_analysis",
            assumptions: [],
            answer_md: errorMessage,
            artifacts: { code: [], tables: [], citations: [] },
            next_actions: [],
            errors: [msg || "Unknown AI service error"],
        });
    }
});
// ---------- Streaming handler ----------
async function handleStreamingRequest(req, res, prompt, projectId, vendor_selection, sessionId) {
    try {
        const session = sessionId ? getOrCreateSession(sessionId) : null;
        const messages = session ? convertMessagesToOpenAIFormat(session.messages) : [{ role: 'system', content: wrapper_A_system_1.WRAPPER_A_SYSTEM }];
        // Add current user message
        const userMessage = `PROJECT_ID=${projectId ?? ""}\nVENDOR=${vendor_selection ?? "Generic"}\nUSER_PROMPT:\n${prompt}`;
        messages.push({ role: 'user', content: userMessage });
        // Set up streaming response
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
        // For JSON responses, we need to use non-streaming mode but send progress updates
        res.write(`data: ${JSON.stringify({ content: 'Processing your request...', type: 'status' })}\n\n`);
        try {
            const response = await openai.chat.completions.create({
                model: MODEL_NAME,
                messages: messages,
                response_format: { type: "json_object" },
                max_tokens: 2000,
                temperature: 0.2,
            });
            const raw = response.choices[0]?.message?.content ?? "";
            if (!raw)
                throw new Error("Empty response from AI model");
            // Parse the complete JSON response
            let cleanedRaw = raw.trim();
            cleanedRaw = cleanedRaw.replace(/```json\s*|\s*```/g, "");
            cleanedRaw = cleanedRaw.replace(/```\s*|\s*```/g, "");
            let jsonString = "";
            let jsonMatch = cleanedRaw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonString = jsonMatch[0];
            }
            else {
                const openBrace = cleanedRaw.indexOf('{');
                if (openBrace !== -1) {
                    let braceCount = 0;
                    let endPos = -1;
                    for (let i = openBrace; i < cleanedRaw.length; i++) {
                        if (cleanedRaw[i] === '{')
                            braceCount++;
                        if (cleanedRaw[i] === '}')
                            braceCount--;
                        if (braceCount === 0) {
                            endPos = i;
                            break;
                        }
                    }
                    if (endPos !== -1) {
                        jsonString = cleanedRaw.substring(openBrace, endPos + 1);
                    }
                }
            }
            if (!jsonString)
                throw new Error("No JSON structure found in response");
            jsonString = removeDuplicateJsonKeys(jsonString);
            const parsedJson = JSON.parse(jsonString);
            if (!parsedJson.artifacts) {
                parsedJson.artifacts = {
                    code: [],
                    tables: [],
                    citations: []
                };
            }
            const result = ResponseSchema.safeParse(parsedJson);
            if (result.success) {
                const data = result.data;
                // Clean the answer_md to remove any code blocks
                if (data.answer_md) {
                    data.answer_md = cleanAnswerMd(data.answer_md);
                }
                // Send the answer content as streaming chunks
                const answer = data.answer_md || "";
                const words = answer.split(' ');
                const chunkSize = 3; // Send 3 words at a time
                res.write(`data: ${JSON.stringify({ content: '', type: 'start' })}\n\n`);
                for (let i = 0; i < words.length; i += chunkSize) {
                    const chunk = words.slice(i, i + chunkSize).join(' ') + (i + chunkSize < words.length ? ' ' : '');
                    res.write(`data: ${JSON.stringify({ content: chunk, type: 'chunk' })}\n\n`);
                    // Small delay to simulate typing effect
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
                // Send the complete response
                res.write(`data: ${JSON.stringify({
                    type: 'complete',
                    answer: data.answer_md,
                    fullResponse: data
                })}\n\n`);
            }
            else {
                // Send error response
                res.write(`data: ${JSON.stringify({
                    type: 'error',
                    error: 'Response validation failed',
                    content: 'The AI response did not match the expected format.'
                })}\n\n`);
            }
        }
        catch (parseError) {
            res.write(`data: ${JSON.stringify({
                type: 'error',
                error: parseError instanceof Error ? parseError.message : 'Parse error',
                content: 'Failed to process the AI response.'
            })}\n\n`);
        }
        // Send end signal
        res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
        res.end();
        // Save to memory if sessionId provided
        if (sessionId) {
            addToMemory(sessionId, 'user', userMessage);
            addToMemory(sessionId, 'assistant', 'Response sent via streaming');
        }
    }
    catch (error) {
        console.error('Streaming error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
    }
}
// ---------- Non-streaming handler ----------
async function handleNonStreamingRequest(req, res, prompt, projectId, vendor_selection, sessionId) {
    try {
        const startTime = Date.now();
        const TIMEOUT_MS = 120000; // 2 minutes timeout
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
        const session = sessionId ? getOrCreateSession(sessionId) : null;
        const messages = session ? convertMessagesToOpenAIFormat(session.messages) : [{ role: 'system', content: wrapper_A_system_1.WRAPPER_A_SYSTEM }];
        // Add current user message
        const userMessage = `PROJECT_ID=${projectId ?? ""}\nVENDOR=${vendor_selection ?? "Generic"}\nUSER_PROMPT:\n${prompt}`;
        messages.push({ role: 'user', content: userMessage });
        const response = await withTimeout(openai.chat.completions.create({
            model: MODEL_NAME,
            messages: messages,
            response_format: { type: "json_object" },
            max_tokens: 2000,
            temperature: 0.2,
        }), TIMEOUT_MS);
        const raw = response.choices[0]?.message?.content ?? "";
        if (!raw)
            throw new Error("Empty response from AI model");
        console.log("🔍 Raw OpenAI response:", raw); // Debug logging
        let data;
        try {
            // Clean the response and extract JSON
            let cleanedRaw = raw.trim();
            // Remove any markdown code blocks
            cleanedRaw = cleanedRaw.replace(/```json\s*|\s*```/g, "");
            cleanedRaw = cleanedRaw.replace(/```\s*|\s*```/g, "");
            // Try to find and extract valid JSON structure
            let jsonString = "";
            // First, try to find a complete JSON object
            let jsonMatch = cleanedRaw.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonString = jsonMatch[0];
            }
            else {
                // If no complete match, try to extract and reconstruct JSON
                const openBrace = cleanedRaw.indexOf('{');
                if (openBrace !== -1) {
                    let braceCount = 0;
                    let endPos = -1;
                    for (let i = openBrace; i < cleanedRaw.length; i++) {
                        if (cleanedRaw[i] === '{')
                            braceCount++;
                        if (cleanedRaw[i] === '}')
                            braceCount--;
                        if (braceCount === 0) {
                            endPos = i;
                            break;
                        }
                    }
                    if (endPos !== -1) {
                        jsonString = cleanedRaw.substring(openBrace, endPos + 1);
                    }
                }
            }
            if (!jsonString)
                throw new Error("No JSON structure found in response");
            // Try to fix common JSON issues
            try {
                // Test if it's valid JSON first
                JSON.parse(jsonString);
            }
            catch {
                // If parsing fails, try to fix common issues
                console.log("🔧 Attempting to fix malformed JSON...");
                // Remove incomplete trailing objects/arrays
                jsonString = jsonString.replace(/,\s*\{[^}]*$/g, '');
                jsonString = jsonString.replace(/,\s*\[[^\]]*$/g, '');
                // Ensure proper closing of incomplete strings
                jsonString = jsonString.replace(/:\s*"[^"]*$/g, ': ""');
                // Remove duplicate consecutive commas
                jsonString = jsonString.replace(/,\s*,+/g, ',');
                // Remove trailing commas before closing braces/brackets
                jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
                // Try to close incomplete objects
                if (!jsonString.endsWith('}') && jsonString.includes('{')) {
                    const openBraces = (jsonString.match(/\{/g) || []).length;
                    const closeBraces = (jsonString.match(/\}/g) || []).length;
                    const missingBraces = openBraces - closeBraces;
                    if (missingBraces > 0) {
                        jsonString += '}'.repeat(missingBraces);
                    }
                }
            }
            // Clean up duplicate keys
            jsonString = removeDuplicateJsonKeys(jsonString);
            const parsedJson = JSON.parse(jsonString);
            // Ensure artifacts field exists with default value if missing
            if (!parsedJson.artifacts) {
                parsedJson.artifacts = {
                    code: [],
                    tables: [],
                    citations: []
                };
            }
            // Validate against our schema
            const result = ResponseSchema.safeParse(parsedJson);
            if (result.success) {
                data = result.data;
                // Clean the answer_md to remove any code blocks
                if (data.answer_md) {
                    data.answer_md = cleanAnswerMd(data.answer_md);
                }
                console.log("✅ Successfully validated response against schema");
            }
            else {
                console.log("⚠️ Schema validation failed:", result.error);
                // Create a safe response that matches our schema
                data = {
                    status: "error",
                    task_type: "qna",
                    assumptions: [],
                    answer_md: "The AI response did not match the expected format. Original response: " +
                        (parsedJson.answer_md || raw.trim() || "No readable response"),
                    artifacts: {
                        code: [],
                        tables: [],
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
        catch (parseError) {
            console.log("❌ JSON parsing failed:", parseError);
            data = {
                status: "error",
                task_type: "qna",
                assumptions: [],
                answer_md: raw.trim() || "The AI model provided a response but it could not be processed properly.",
                artifacts: {
                    code: [],
                    tables: [],
                    citations: [],
                },
                next_actions: [],
                errors: ["Failed to parse AI response as JSON"],
            };
        }
        // Save to memory if sessionId provided
        if (sessionId) {
            addToMemory(sessionId, 'user', userMessage);
            addToMemory(sessionId, 'assistant', raw);
        }
        consecutiveFailures = 0;
        const processingTime = Date.now() - startTime;
        console.log(`✅ OpenAI response in ${processingTime}ms`);
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
            errorMessage =
                "The AI model is taking longer than expected. Please try a simpler question or try again later.";
            httpStatus = 408;
        }
        else if (msg.includes("ECONNREFUSED") ||
            msg.includes("fetch failed") ||
            msg.includes("connect") ||
            msg.includes("API key") ||
            msg.includes("authentication")) {
            errorMessage =
                "AI service is currently unavailable. Please check your OpenAI API configuration.";
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
}
// ---------- Fallback error handler ----------
router.use((err, _req, res, _next) => {
    console.error("Unhandled route error:", err);
    if (res.headersSent)
        return;
    res.status(500).json({
        status: "error",
        task_type: "qna",
        assumptions: [],
        answer_md: "Server error while processing the request.",
        artifacts: { code: [], tables: [], citations: [] },
        next_actions: [],
        errors: [String(err?.message || err)],
    });
});
exports.default = router;
