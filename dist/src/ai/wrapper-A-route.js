"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const ollama_1 = require("ollama");
const wrapper_A_system_1 = require("./wrapper-A-system");
const router = (0, express_1.Router)();
// Initialize Ollama with proper configuration
const ollama = new ollama_1.Ollama({
    host: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
});
// Circuit breaker pattern to prevent cascade failures
let consecutiveFailures = 0;
const MAX_FAILURES = 3;
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
let circuitBreakerUntil = 0;
// Optimized model parameters for production with better JSON compliance
const MODEL_CONFIG = {
    model: 'phi3:mini',
    options: {
        temperature: 0.1, // Very low but not zero for more consistent JSON
        top_k: 10, // More focused sampling for structure
        top_p: 0.3, // Very focused for better format compliance
        num_ctx: 2048, // Larger context for better understanding
        num_predict: 300, // Allow more tokens for complete responses
        repeat_penalty: 1.1, // Slight penalty to avoid repetition
        num_thread: Math.min(4, Math.max(1, Math.floor(require('os').cpus().length / 2))), // Max 4 threads
        stop: ['\n\n\n', '---', 'Human:', 'Assistant:'], // Stop tokens to prevent extra text
    }
};
const ReqSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    projectId: zod_1.z.string().optional()
});
// Health check endpoint for Ollama
router.get('/health', async (req, res) => {
    try {
        const response = await ollama.list();
        const hasModel = response.models.some(model => model.name === MODEL_CONFIG.model);
        res.json({
            status: 'ok',
            ollama_connected: true,
            model_available: hasModel,
            model_name: MODEL_CONFIG.model,
            consecutive_failures: consecutiveFailures,
            circuit_breaker_active: Date.now() < circuitBreakerUntil
        });
    }
    catch (error) {
        res.status(503).json({
            status: 'error',
            ollama_connected: false,
            error: error.message,
            consecutive_failures: consecutiveFailures,
            circuit_breaker_active: Date.now() < circuitBreakerUntil
        });
    }
});
// Warm up the model endpoint
router.post('/warmup', async (req, res) => {
    try {
        console.log('🔥 Warming up AI model...');
        const response = await ollama.chat({
            model: MODEL_CONFIG.model,
            messages: [{ role: 'user', content: 'Ready' }],
            options: {
                ...MODEL_CONFIG.options,
                num_ctx: 512,
                num_predict: 5
            },
            keep_alive: '0' // Keep loaded indefinitely
        });
        res.json({
            status: 'ok',
            message: 'Model warmed up successfully',
            model: MODEL_CONFIG.model,
            response: response.message?.content || 'Ready'
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Health check endpoint
router.get('/health', async (req, res) => {
    try {
        // Quick health check
        const start = Date.now();
        const response = await ollama.chat({
            model: MODEL_CONFIG.model,
            messages: [{ role: 'user', content: 'ping' }],
            options: {
                ...MODEL_CONFIG.options,
                num_ctx: 256,
                num_predict: 3
            },
            keep_alive: '0' // Keep loaded indefinitely
        });
        const duration = Date.now() - start;
        res.json({
            status: 'ok',
            model: MODEL_CONFIG.model,
            response_time_ms: duration,
            model_loaded: true,
            timestamp: new Date().toISOString()
        });
    }
    catch (error) {
        console.error('❌ Health check failed:', error);
        res.status(500).json({
            status: 'error',
            message: 'Health check failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});
router.post('/test', async (req, res) => {
    try {
        const response = await ollama.chat({
            model: 'phi3:mini',
            messages: [{ role: 'user', content: 'Say "Hello"' }],
            options: {
                temperature: 0.0,
                num_ctx: 512,
                num_predict: 10
            }
        });
        res.json({
            status: 'ok',
            message: response.message?.content || 'No response',
            model: 'phi3:mini'
        });
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Quick test endpoint that returns proper format without AI
router.post('/test-format', async (req, res) => {
    const { prompt } = req.body;
    res.json({
        status: "ok",
        task_type: "qna",
        assumptions: [],
        answer_md: `You asked: "${prompt}". This is a test response to verify the JSON format is working correctly.`,
        artifacts: {
            code: [],
            tables: [],
            citations: []
        },
        next_actions: [],
        errors: []
    });
});
router.post('/wrapperA', async (req, res) => {
    const parsed = ReqSchema.safeParse(req.body);
    if (!parsed.success) {
        return res.status(400).json({ error: parsed.error.flatten() });
    }
    const { prompt, projectId } = parsed.data;
    // Circuit breaker check
    if (Date.now() < circuitBreakerUntil) {
        return res.status(503).json({
            status: "error",
            task_type: "qna",
            assumptions: [],
            answer_md: "AI service is temporarily unavailable due to repeated failures. Please try again in a moment.",
            artifacts: { code: [], tables: [], citations: [] },
            next_actions: [],
            errors: ["Circuit breaker active - service temporarily unavailable"]
        });
    }
    try {
        console.log(`🚀 Processing AI request: ${prompt.substring(0, 100)}...`);
        const startTime = Date.now();
        // Create AbortController for timeout management
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // Increased to 30 seconds for first request
        try {
            console.log('📤 Sending request to Ollama...');
            const response = await ollama.chat({
                ...MODEL_CONFIG,
                messages: [
                    { role: 'system', content: wrapper_A_system_1.WRAPPER_A_SYSTEM },
                    { role: 'user', content: `PROJECT_ID=${projectId ?? ''}\nUSER_PROMPT:\n${prompt}` }
                ],
                format: 'json',
                keep_alive: '0', // Keep model loaded indefinitely (use '0' instead of '-1')
                stream: false
            });
            clearTimeout(timeoutId);
            console.log('📥 Received response from Ollama');
            const raw = response.message?.content ?? '';
            if (!raw) {
                throw new Error('Empty response from AI model');
            }
            console.log('🔍 Raw AI response (first 200 chars):', raw.substring(0, 200));
            let data;
            try {
                // Clean the response first
                let cleanedRaw = raw.trim();
                // Remove any potential markdown code blocks
                cleanedRaw = cleanedRaw.replace(/^```json\s*/, '').replace(/\s*```$/, '');
                cleanedRaw = cleanedRaw.replace(/^```\s*/, '').replace(/\s*```$/, '');
                // Remove any text before the first { and after the last }
                const firstBrace = cleanedRaw.indexOf('{');
                const lastBrace = cleanedRaw.lastIndexOf('}');
                if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
                    cleanedRaw = cleanedRaw.substring(firstBrace, lastBrace + 1);
                }
                console.log('🧹 Cleaned response for parsing:', cleanedRaw.substring(0, 200));
                // Try to parse the cleaned JSON
                data = JSON.parse(cleanedRaw);
                console.log('✅ Successfully parsed JSON response');
            }
            catch (parseError) {
                console.error('❌ JSON Parse Error:', parseError);
                console.error('❌ Raw response that failed to parse:', raw.substring(0, 500));
                // Check if the response looks like it might be markdown content
                const isMarkdownResponse = raw.includes('#') || raw.includes('**') || raw.includes('*') ||
                    raw.includes('\n\n') || raw.includes('- ') || raw.includes('1. ');
                if (isMarkdownResponse) {
                    console.log('🔧 Detected markdown response, wrapping in proper JSON structure');
                    // Create a proper response with the markdown content
                    data = {
                        status: "ok",
                        task_type: "qna",
                        assumptions: [],
                        answer_md: raw.trim(),
                        artifacts: { code: [], tables: [], citations: [] },
                        next_actions: [],
                        errors: ["AI response was not in expected JSON format - received markdown directly"]
                    };
                }
                else {
                    // Try to find any JSON-like structure in the response
                    const jsonMatch = raw.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            data = JSON.parse(jsonMatch[0]);
                            console.log('✅ Extracted and parsed JSON from mixed response');
                        }
                        catch (extractError) {
                            console.error('❌ Failed to parse extracted JSON:', extractError);
                            data = {
                                status: "ok",
                                task_type: "qna",
                                assumptions: [],
                                answer_md: raw.trim() || "The AI model provided a response but it couldn't be processed properly.",
                                artifacts: { code: [], tables: [], citations: [] },
                                next_actions: [],
                                errors: ["AI response was not in expected JSON format"]
                            };
                        }
                    }
                    else {
                        // No JSON found at all, wrap the entire response
                        data = {
                            status: "ok",
                            task_type: "qna",
                            assumptions: [],
                            answer_md: raw.trim() || "The AI model provided a response but it couldn't be processed properly.",
                            artifacts: { code: [], tables: [], citations: [] },
                            next_actions: [],
                            errors: ["AI response was not in expected JSON format"]
                        };
                    }
                }
                console.log('🔧 Created fallback response structure');
            }
            // Validate and ensure all required fields exist
            if (!data || typeof data !== 'object') {
                data = {
                    status: "ok",
                    task_type: "qna",
                    assumptions: [],
                    answer_md: "Invalid response structure from AI model.",
                    artifacts: { code: [], tables: [], citations: [] },
                    next_actions: [],
                    errors: ["Invalid response structure"]
                };
            }
            // Ensure all required fields exist with proper defaults
            data = {
                status: data.status || "ok",
                task_type: data.task_type || "qna",
                assumptions: Array.isArray(data.assumptions) ? data.assumptions : [],
                answer_md: data.answer_md || "AI response received but could not be parsed properly.",
                artifacts: {
                    code: Array.isArray(data.artifacts?.code) ? data.artifacts.code : [],
                    tables: Array.isArray(data.artifacts?.tables) ? data.artifacts.tables : [],
                    citations: Array.isArray(data.artifacts?.citations) ? data.artifacts.citations : []
                },
                next_actions: Array.isArray(data.next_actions) ? data.next_actions : [],
                errors: Array.isArray(data.errors) ? data.errors : []
            };
            const processingTime = Date.now() - startTime;
            console.log(`✅ AI response generated in ${processingTime}ms`);
            // Reset failure counter on success
            consecutiveFailures = 0;
            res.json(data);
        }
        catch (aiError) {
            clearTimeout(timeoutId);
            // Handle specific AI errors
            if (aiError.name === 'AbortError' || aiError.message.includes('timeout')) {
                throw new Error('AI request timeout - model took too long to respond');
            }
            if (aiError.message.includes('ECONNREFUSED') || aiError.message.includes('fetch failed')) {
                throw new Error('Unable to connect to AI service - please check if Ollama is running');
            }
            throw aiError;
        }
    }
    catch (err) {
        console.error('AI request failed:', err.message);
        // Increment failure counter
        consecutiveFailures++;
        // Activate circuit breaker if too many failures
        if (consecutiveFailures >= MAX_FAILURES) {
            circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
            console.warn(`🔴 Circuit breaker activated for ${CIRCUIT_BREAKER_TIMEOUT / 1000} seconds due to ${consecutiveFailures} consecutive failures`);
        }
        // Return appropriate error response
        let errorMessage = "An error occurred while processing your request. Please try again.";
        let httpStatus = 500;
        if (err.message.includes('timeout')) {
            errorMessage = "The AI model is taking longer than expected. Please try a simpler question or try again later.";
            httpStatus = 408;
        }
        else if (err.message.includes('connect to AI service')) {
            errorMessage = "AI service is currently unavailable. Please try again later.";
            httpStatus = 503;
        }
        res.status(httpStatus).json({
            status: "error",
            task_type: "qna",
            assumptions: [],
            answer_md: errorMessage,
            artifacts: { code: [], tables: [], citations: [] },
            next_actions: [],
            errors: [err.message || 'Unknown AI service error']
        });
    }
});
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
