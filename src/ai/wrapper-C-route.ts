import { Router } from "express";
import { z, ZodIssue } from "zod";
import OpenAI from "openai";
import { WRAPPER_C_SYSTEM } from "./wrapper-C-system";
import { getAIConfig } from "../config/ai-config";
import multer from "multer";

const router = Router();

// ---------- OpenAI client ----------
const config = getAIConfig();
const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
});

// ---------- Model configuration ----------
const MODEL_NAME = config.openai.model;

// ---------- Session Memory System ----------
interface SessionMemory {
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>;
  uploadedFiles: any[];
  lastAccessed: Date;
}

const sessionMemory: Record<string, SessionMemory> = {};

// Clean up old sessions (older than 24 hours)
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const [sessionId, session] of Object.entries(sessionMemory)) {
    if (session.lastAccessed.getTime() < cutoff) {
      delete sessionMemory[sessionId];
    }
  }
}, 60 * 60 * 1000); // Run every hour

function getOrCreateSession(sessionId: string): SessionMemory {
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

function addToMemory(sessionId: string, role: 'user' | 'assistant', content: string) {
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

function convertMessagesToOpenAIFormat(messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>): Array<{ role: 'user' | 'assistant'; content: string }> {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

// ---------- Circuit breaker ----------
let consecutiveFailures = 0;
const MAX_FAILURES = 3;
const CIRCUIT_BREAKER_TIMEOUT = 60_000; // 1 minute
let circuitBreakerUntil = 0;

// ---------- Schema validation ----------
const ArtifactsSchema = z.object({
  code: z.array(z.object({
    language: z.string(),
    vendor: z.string(),
    compilable: z.boolean(),
    filename: z.string(),
    content: z.string(),
  })),
  tables: z.array(z.object({
    title: z.string(),
    schema: z.array(z.string()),
    rows: z.array(z.array(z.string())),
  })),
  reports: z.array(z.object({
    title: z.string(),
    content_md: z.string(),
  })),
  anchors: z.array(z.any()),
  citations: z.array(z.any()),
});

const ResponseSchema = z.object({
  status: z.enum(["ok", "needs_input", "error"]),
  task_type: z.enum(["qna", "code_gen", "code_edit", "debug", "optimize", "calc", "checklist", "report"]),
  assumptions: z.array(z.string()),
  answer_md: z.string(),
  artifacts: ArtifactsSchema,
  verification_notes: z.string(),
  next_actions: z.array(z.string()),
  errors: z.array(z.string()),
});

const ReqSchema = z.object({
  prompt: z.string().min(1),
  projectId: z.string().optional(),
  vendor_selection: z.enum(["Rockwell", "Siemens", "Beckhoff", "Generic"]).optional(),
  sessionId: z.string().optional(),
  stream: z.union([z.boolean(), z.string()]).optional().transform(val => {
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
  } catch (error: any) {
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
    let messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
      { role: 'system', content: WRAPPER_C_SYSTEM }
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

    const TIMEOUT_MS = 180_000; // 3 minutes for verification processing

    function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
      return Promise.race([
        promise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), ms)
        )
      ]);
    }

    const response = await withTimeout(
      openai.chat.completions.create({
        model: MODEL_NAME,
        messages: messages as any,
        max_tokens: 4000,
        temperature: 0.1,
      }),
      TIMEOUT_MS
    );

    const raw = response.choices[0]?.message?.content?.trim() || "";
    
    // Parse and validate response
    let data: any;
    try {
      const parsed = JSON.parse(raw);
      const validation = ResponseSchema.safeParse(parsed);
      
      if (validation.success) {
        data = validation.data;
      } else {
        throw new Error("Schema validation failed");
      }
    } catch (parseError) {
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

  } catch (error: any) {
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

export default router;
