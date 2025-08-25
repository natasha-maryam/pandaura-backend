"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const ollama_1 = require("ollama");
const wrapper_A_system_1 = require("./wrapper-A-system");
const router = (0, express_1.Router)();
const ollama = new ollama_1.Ollama({
    host: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
});
const ReqSchema = zod_1.z.object({
    prompt: zod_1.z.string().min(1),
    projectId: zod_1.z.string().optional()
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
    try {
        console.log(`🚀 Processing AI request: ${prompt.substring(0, 100)}...`);
        const startTime = Date.now();
        // Set a timeout for the ollama request
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AI request timeout - model took too long to respond')), 30000); // 30 second timeout
        });
        const chatPromise = ollama.chat({
            model: 'phi3:mini',
            messages: [
                { role: 'system', content: wrapper_A_system_1.WRAPPER_A_SYSTEM },
                {
                    role: 'user',
                    content: `PROJECT_ID=${projectId ?? ''}\n` +
                        `USER_PROMPT:\n${prompt}\n\n` +
                        `RESPOND WITH ONLY JSON IN THIS EXACT FORMAT:\n` +
                        `{\n` +
                        `  "status": "ok",\n` +
                        `  "task_type": "qna",\n` +
                        `  "assumptions": [],\n` +
                        `  "answer_md": "Your answer here",\n` +
                        `  "artifacts": {"code": [], "tables": [], "citations": []},\n` +
                        `  "next_actions": [],\n` +
                        `  "errors": []\n` +
                        `}`
                }
            ],
            format: 'json',
            keep_alive: '5m', // Reduced keep alive time
            stream: false,
            options: {
                temperature: 0.1, // Very low temperature for consistency
                num_ctx: 512, // Even smaller context for speed
                num_predict: 256, // Smaller prediction limit for speed
                top_k: 5, // Very focused sampling
                top_p: 0.5, // More deterministic
                repeat_penalty: 1.0, // No repeat penalty for speed
                num_thread: 4 // Limit CPU threads
            }
        });
        const chat = await Promise.race([chatPromise, timeoutPromise]);
        const raw = chat.message?.content ?? '';
        let data;
        try {
            // Clean up the response in case there's extra text
            const jsonMatch = raw.match(/\{[\s\S]*\}/);
            const jsonString = jsonMatch ? jsonMatch[0] : raw;
            data = JSON.parse(jsonString);
            // Validate that we have the required format
            if (!data.status || !data.task_type || !data.answer_md) {
                console.warn('Model returned incomplete JSON structure:', data);
                // Check if it's a simple question-answer format like {"PLC": "..."}
                if (typeof data === 'object' && Object.keys(data).length === 1) {
                    const key = Object.keys(data)[0];
                    const value = data[key];
                    // Convert to proper format
                    data = {
                        status: "ok",
                        task_type: "qna",
                        assumptions: [],
                        answer_md: `**${key}**: ${value}`,
                        artifacts: {
                            code: [],
                            tables: [],
                            citations: []
                        },
                        next_actions: [],
                        errors: []
                    };
                    console.log('✅ Converted simple format to required structure');
                }
                else {
                    throw new Error('Invalid JSON structure returned by model');
                }
            }
        }
        catch (parseError) {
            console.error('JSON Parse Error:', parseError);
            console.error('Raw response:', raw);
            return res.status(502).json({
                error: 'Model returned invalid JSON',
                raw: raw.substring(0, 500) // Limit raw response length
            });
        }
        const processingTime = Date.now() - startTime;
        console.log(`✅ AI response generated in ${processingTime}ms`);
        res.json(data);
    }
    catch (err) {
        console.error('AI request failed:', err.message);
        // If it's a timeout, return a structured timeout response
        if (err.message.includes('timeout')) {
            return res.status(408).json({
                status: "error",
                task_type: "qna",
                assumptions: [],
                answer_md: "The AI model is taking longer than expected. Please try a simpler question or try again later.",
                artifacts: {
                    code: [],
                    tables: [],
                    citations: []
                },
                next_actions: [],
                errors: ["AI request timeout - model took too long to respond"]
            });
        }
        // Generic error response in correct format
        res.status(500).json({
            status: "error",
            task_type: "qna",
            assumptions: [],
            answer_md: "An error occurred while processing your request. Please try again.",
            artifacts: {
                code: [],
                tables: [],
                citations: []
            },
            next_actions: [],
            errors: [err?.message || 'Ollama request failed']
        });
    }
});
exports.default = router;
