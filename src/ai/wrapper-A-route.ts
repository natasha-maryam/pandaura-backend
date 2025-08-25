import { Router } from 'express';
import { z } from 'zod';
import { Ollama } from 'ollama';
import { WRAPPER_A_SYSTEM } from './wrapper-A-system';

const router = Router();

// Initialize Ollama with proper configuration
const ollama = new Ollama({
  host: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434'
});

// Circuit breaker pattern to prevent cascade failures
let consecutiveFailures = 0;
const MAX_FAILURES = 3;
const CIRCUIT_BREAKER_TIMEOUT = 60000; // 1 minute
let circuitBreakerUntil = 0;

// Optimized model parameters for production
const MODEL_CONFIG = {
  model: 'phi3:mini',
  options: {
    temperature: 0.0,        // Deterministic responses
    top_k: 5,               // Very focused sampling
    top_p: 0.5,             // More deterministic
    num_ctx: 1024,          // Reasonable context window
    num_predict: 150,       // Limit output length for speed
    repeat_penalty: 1.0,    // No penalty for speed
    num_thread: Math.min(4, Math.max(1, Math.floor(require('os').cpus().length / 2))), // Max 4 threads
  }
};

const ReqSchema = z.object({
  prompt: z.string().min(1),
  projectId: z.string().optional()
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
  } catch (error: any) {
    res.status(503).json({
      status: 'error',
      ollama_connected: false,
      error: error.message,
      consecutive_failures: consecutiveFailures,
      circuit_breaker_active: Date.now() < circuitBreakerUntil
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
  } catch (error: any) {
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

  // Set shorter timeouts to prevent hanging connections
  req.setTimeout(18000); // 18 seconds
  res.setTimeout(18000);

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
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    try {
      const response = await ollama.chat({
        ...MODEL_CONFIG,
        messages: [
          { role: 'system', content: WRAPPER_A_SYSTEM },
          { role: 'user', content: `PROJECT_ID=${projectId ?? ''}\nUSER_PROMPT:\n${prompt}` }
        ],
        format: 'json',
        keep_alive: '2m',
        stream: false
      });

      clearTimeout(timeoutId);

      const raw = response.message?.content ?? '';
      if (!raw) {
        throw new Error('Empty response from AI model');
      }

      let data;
      try {
        // Clean and parse JSON response
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        const jsonString = jsonMatch ? jsonMatch[0] : raw;
        data = JSON.parse(jsonString);
        
        // Validate required fields
        if (!data.status || !data.task_type || !data.answer_md) {
          console.warn('Model returned incomplete JSON structure:', data);
          
          // Handle simple key-value responses
          if (typeof data === 'object' && Object.keys(data).length === 1) {
            const key = Object.keys(data)[0];
            const value = data[key];
            
            data = {
              status: "ok",
              task_type: "qna",
              assumptions: [],
              answer_md: `**${key}**: ${value}`,
              artifacts: { code: [], tables: [], citations: [] },
              next_actions: [],
              errors: []
            };
          } else {
            throw new Error('Invalid response structure from AI model');
          }
        }

        // Ensure all required fields exist
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

      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        console.error('Raw response:', raw.substring(0, 500));
        
        // Return a structured error response
        data = {
          status: "error",
          task_type: "qna",
          assumptions: [],
          answer_md: "The AI model returned a response that could not be processed. Please try rephrasing your question.",
          artifacts: { code: [], tables: [], citations: [] },
          next_actions: [],
          errors: ["JSON parsing failed"]
        };
      }

      const processingTime = Date.now() - startTime;
      console.log(`✅ AI response generated in ${processingTime}ms`);

      // Reset failure counter on success
      consecutiveFailures = 0;
      
      res.json(data);

    } catch (aiError: any) {
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

  } catch (err: any) {
    console.error('AI request failed:', err.message);
    
    // Increment failure counter
    consecutiveFailures++;
    
    // Activate circuit breaker if too many failures
    if (consecutiveFailures >= MAX_FAILURES) {
      circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
      console.warn(`🔴 Circuit breaker activated for ${CIRCUIT_BREAKER_TIMEOUT/1000} seconds due to ${consecutiveFailures} consecutive failures`);
    }
    
    // Return appropriate error response
    let errorMessage = "An error occurred while processing your request. Please try again.";
    let httpStatus = 500;
    
    if (err.message.includes('timeout')) {
      errorMessage = "The AI model is taking longer than expected. Please try a simpler question or try again later.";
      httpStatus = 408;
    } else if (err.message.includes('connect to AI service')) {
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

export default router;
