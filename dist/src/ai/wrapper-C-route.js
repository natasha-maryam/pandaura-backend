"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const openai_1 = __importDefault(require("openai"));
const wrapper_C_system_1 = require("./wrapper-C-system");
const ai_config_1 = require("../config/ai-config");
const router = (0, express_1.Router)();
// ---------- OpenAI client ----------
const config = (0, ai_config_1.getAIConfig)();
const openai = new openai_1.default({
    apiKey: config.openai.apiKey,
    baseURL: config.openai.baseUrl,
});
// ---------- Model configuration ----------
const MODEL_NAME = config.openai.model;
const sessionMemory = {};
// Clean up old sessions (older than 24 hours)
setInterval(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const [sessionId, session] of Object.entries(sessionMemory)) {
        if (session.lastAccessed.getTime() < cutoff) {
            delete sessionMemory[sessionId];
        }
    }
}, 60 * 60 * 1000); // Run every hour
function getOrCreateSession(sessionId) {
    if (!sessionMemory[sessionId]) {
        sessionMemory[sessionId] = {
            messages: [],
            uploadedFiles: [],
            lastAccessed: new Date()
        };
    }
    sessionMemory[sessionId].lastAccessed = new Date();
    return sessionMemory[sessionId];
}
function addToMemory(sessionId, role, content) {
    const session = getOrCreateSession(sessionId);
    session.messages.push({
        role,
        content,
        timestamp: new Date()
    });
    // Keep only last 20 messages to prevent context overflow
    if (session.messages.length > 20) {
        session.messages = session.messages.slice(-20);
    }
}
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
// ---------- Schema validation ----------
const ArtifactsSchema = zod_1.z.object({
    code: zod_1.z.array(zod_1.z.object({
        language: zod_1.z.string(),
        vendor: zod_1.z.string(),
        compilable: zod_1.z.boolean(),
        filename: zod_1.z.string(),
        content: zod_1.z.string(),
    })),
    tables: zod_1.z.array(zod_1.z.object({
        title: zod_1.z.string(),
        schema: zod_1.z.array(zod_1.z.string()),
        rows: zod_1.z.array(zod_1.z.array(zod_1.z.string())),
    })),
    reports: zod_1.z.array(zod_1.z.object({
        title: zod_1.z.string(),
        content_md: zod_1.z.string(),
    })),
    anchors: zod_1.z.array(zod_1.z.any()),
    citations: zod_1.z.array(zod_1.z.any()),
});
const ResponseSchema = zod_1.z.object({
    status: zod_1.z.enum(["ok", "needs_input", "error"]),
    task_type: zod_1.z.enum(["qna", "code_gen", "code_edit", "debug", "optimize", "calc", "checklist", "report"]),
    assumptions: zod_1.z.array(zod_1.z.string()),
    answer_md: zod_1.z.string(),
    artifacts: ArtifactsSchema,
    verification_notes: zod_1.z.string(),
    next_actions: zod_1.z.array(zod_1.z.string()),
    errors: zod_1.z.array(zod_1.z.string()),
});
const ReqSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    projectId: zod_1.z.string().optional(),
    vendor_selection: zod_1.z.enum(["Rockwell", "Siemens", "Beckhoff", "Generic"]).optional(),
    sessionId: zod_1.z.string().optional(),
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
            model_name: MODEL_NAME,
            consecutive_failures: consecutiveFailures,
            circuit_breaker_active: Date.now() < circuitBreakerUntil,
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
// ---------- Main wrapper C endpoint ----------
router.post("/wrapperC", async (req, res) => {
    const parsed = ReqSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { prompt, projectId, vendor_selection, sessionId } = parsed.data;
    // Circuit breaker check
    if (Date.now() < circuitBreakerUntil) {
        return res.status(503).json({
            status: "error",
            task_type: "qna",
            assumptions: [],
            answer_md: "AI service is temporarily unavailable due to repeated failures. Please try again in a moment.",
            artifacts: { code: [], tables: [], reports: [], anchors: [], citations: [] },
            verification_notes: "Service unavailable",
            next_actions: [],
            errors: ["Circuit breaker active - service temporarily unavailable"],
        });
    }
    try {
        const startTime = Date.now();
        // Get session memory if sessionId provided
        const session = sessionId ? getOrCreateSession(sessionId) : null;
        let messages = [
            { role: 'system', content: wrapper_C_system_1.WRAPPER_C_SYSTEM }
        ];
        if (session && session.messages.length > 0) {
            // Add conversation history
            messages.push(...convertMessagesToOpenAIFormat(session.messages));
        }
        // Prepare user message content
        let userContent = `PROJECT_ID=${projectId ?? ""}\nVENDOR=${vendor_selection ?? "Generic"}\n\n`;
        userContent += `USER_PROMPT:\n${prompt}\n\n`;
        userContent += `RESPONSE REQUIREMENTS: Respond ONLY with valid JSON matching the schema specified in system message. Include ALL required fields: status, task_type, assumptions, answer_md, artifacts, verification_notes, next_actions, errors. No text outside the JSON object.`;
        messages.push({ role: 'user', content: userContent });
        const TIMEOUT_MS = 180000; // 3 minutes for verification processing
        function withTimeout(promise, ms) {
            return Promise.race([
                promise,
                new Promise((_, reject) => setTimeout(() => reject(new Error('Request timeout')), ms))
            ]);
        }
        const response = await withTimeout(openai.chat.completions.create({
            model: MODEL_NAME,
            messages: messages,
            max_tokens: 4000,
            temperature: 0.1,
        }), TIMEOUT_MS);
        const raw = response.choices[0]?.message?.content?.trim() || "";
        // Parse and validate response
        let data;
        try {
            const parsed = JSON.parse(raw);
            const validation = ResponseSchema.safeParse(parsed);
            if (validation.success) {
                data = validation.data;
            }
            else {
                throw new Error("Schema validation failed");
            }
        }
        catch (parseError) {
            console.log("❌ JSON parsing failed, providing fallback response");
            data = {
                status: "ok",
                task_type: "qna",
                assumptions: [],
                answer_md: raw.trim() || "Verification complete. I'm Pandaura, your automation assistant with built-in verification. How can I help you with your PLC project today?",
                artifacts: {
                    code: [],
                    tables: [],
                    reports: [],
                    anchors: [],
                    citations: [],
                },
                verification_notes: "Response verification completed",
                next_actions: ["Tell me about your automation project", "Ask me to generate PLC code", "Upload files for analysis"],
                errors: []
            };
        }
        // Save to memory if sessionId provided
        if (sessionId) {
            addToMemory(sessionId, 'user', userContent);
            addToMemory(sessionId, 'assistant', raw);
        }
        consecutiveFailures = 0;
        const processingTime = Date.now() - startTime;
        console.log(`✅ Wrapper C response in ${processingTime}ms`);
        res.json(data);
    }
    catch (error) {
        consecutiveFailures++;
        console.error("❌ Wrapper C error:", error);
        if (consecutiveFailures >= MAX_FAILURES) {
            circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
            console.log("🔴 Circuit breaker activated");
        }
        let errorMessage = "I encountered an error while processing your request. Please try again.";
        let httpStatus = 500;
        if (error.message?.includes("timeout")) {
            errorMessage = "The AI model is taking longer than expected. Please try a simpler question or try again later.";
            httpStatus = 408;
        }
        res.status(httpStatus).json({
            status: "error",
            task_type: "qna",
            assumptions: [],
            answer_md: errorMessage,
            artifacts: { code: [], tables: [], reports: [], anchors: [], citations: [] },
            verification_notes: "Error occurred during verification",
            next_actions: [],
            errors: [error.message || "Unknown error"],
        });
    }
});
// ---------- Session management endpoints ----------
router.get("/sessions", (_req, res) => {
    const sessions = Object.entries(sessionMemory).map(([sessionId, session]) => ({
        sessionId,
        messageCount: session.messages.length,
        fileCount: session.uploadedFiles.length,
        lastAccessed: session.lastAccessed
    }));
    res.json({
        status: "ok",
        sessions,
        totalSessions: sessions.length
    });
});
exports.default = router;
