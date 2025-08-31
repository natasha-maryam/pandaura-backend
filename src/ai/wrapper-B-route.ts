import { Router } from "express";
import { z, ZodIssue } from "zod";
import OpenAI from "openai";
import { WRAPPER_B_SYSTEM } from "./wrapper-B-system";
import { getAIConfig } from "../config/ai-config";
import { imageProcessor } from "../utils/imageProcessor";
import { documentProcessor } from "../utils/documentProcessor";
import { parseProject } from "../utils/enterprisePLCParser";
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
const VISION_MODEL = "gpt-4o"; // Use GPT-4o for vision capabilities

// ---------- Session Memory System ----------
interface SessionMemory {
  messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>;

  uploadedFiles: ProcessedFile[];
  createdAt: Date;
  lastAccessed: Date;
}

const sessionMemory: Record<string, SessionMemory> = {};

// Clean up old sessions (older than 24 hours)
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  Object.keys(sessionMemory).forEach(sessionId => {
    if (sessionMemory[sessionId].lastAccessed.getTime() < cutoff) {
      delete sessionMemory[sessionId];
    }
  });
}, 60 * 60 * 1000); // Clean up every hour

function getOrCreateSession(sessionId: string): SessionMemory {
  if (!sessionMemory[sessionId]) {
    sessionMemory[sessionId] = {
      messages: [],
      uploadedFiles: [],
      createdAt: new Date(),
      lastAccessed: new Date()
    };
  } else {
    sessionMemory[sessionId].lastAccessed = new Date();
  }
  return sessionMemory[sessionId];
}

function addToMemory(sessionId: string, role: 'user' | 'assistant', content: string) {
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

function addFilesToMemory(sessionId: string, files: ProcessedFile[]) {
  const session = getOrCreateSession(sessionId);
  // Add new files to session memory, avoiding duplicates
  files.forEach(newFile => {
    const existingIndex = session.uploadedFiles.findIndex(f => f.filename === newFile.filename);
    if (existingIndex >= 0) {
      // Update existing file
      session.uploadedFiles[existingIndex] = newFile;
    } else {
      // Add new file
      session.uploadedFiles.push(newFile);
    }
  });
}

function convertMessagesToOpenAIFormat(messages: Array<{ role: 'user' | 'assistant'; content: string; timestamp: Date }>) {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content
  }));
}

// ---------- Multer configuration for file uploads ----------
const upload = multer({
  storage: multer.memoryStorage(),
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
    } else {
      cb(new Error('Invalid file type. Only images, documents, and PLC project files are allowed.'));
    }
  }
});

// ---------- Circuit breaker ----------
let consecutiveFailures = 0;
const MAX_FAILURES = 3;
const CIRCUIT_BREAKER_TIMEOUT = 60_000; // 1 minute
let circuitBreakerUntil = 0;

// ---------- File processing context ----------
interface ProcessedFile {
  filename: string;
  mimetype: string;
  size: number;
  content?: string; // Text content for documents
  imageData?: string; // Base64 for images
  metadata?: any; // Additional file metadata
  extractedData?: {
    tags?: any[];
    tables?: any[];
    routines?: any[];
    plcInfo?: any;
  };
}

// ---------- Helpers ----------
function removeDuplicateJsonKeys(jsonString: string): string {
  try {
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed);
  } catch {
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
      } else if (cleaned[i] === '}') {
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
    } catch {
      // Fallback to line-by-line cleaning
      const lines = cleaned.split("\n");
      const seenKeys = new Set<string>();
      const cleanedLines: string[] = [];
      
      for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        const keyMatch = line.match(/^\s*"([^"]+)"\s*:/);
        if (keyMatch) {
          const key = keyMatch[1];
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            cleanedLines.unshift(line);
          }
        } else {
          cleanedLines.unshift(line);
        }
      }
      
      return cleanedLines.join("\n");
    }
  }
}

async function processUploadedFiles(files: Express.Multer.File[]): Promise<ProcessedFile[]> {
  const processedFiles: ProcessedFile[] = [];
  
  for (const file of files) {
    const processed: ProcessedFile = {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };

    try {
      if (file.mimetype.startsWith('image/')) {
        // Process image files
        const imageInfo = await imageProcessor.processImage(file.buffer, file.originalname);
        processed.imageData = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;
        processed.metadata = imageInfo;
      } else if (file.originalname.endsWith('.st') || 
                 file.originalname.endsWith('.scl') ||
                 file.originalname.endsWith('.xml') ||
                 file.originalname.endsWith('.l5x') ||
                 file.originalname.endsWith('.ap11') ||
                 file.originalname.endsWith('.tsproj') ||
                 file.mimetype === 'text/x-structured-text') {
        // Process PLC project files with enterprise parser
        const plcData = await parseProject(file.originalname, file.buffer);
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
      } else if (file.mimetype === 'application/pdf' || 
                 file.mimetype.includes('word') || 
                 file.mimetype.includes('excel') || 
                 file.mimetype.includes('powerpoint') ||
                 file.mimetype === 'text/plain' ||
                 file.mimetype === 'text/csv') {
        // Process document files
        const docInfo = await documentProcessor.processDocument(file.buffer, file.originalname);
        processed.content = docInfo.content;
        processed.metadata = docInfo.metadata;
        processed.extractedData = docInfo.extractedData;
      } else {
        // Generic file processing
        processed.content = file.buffer.toString('utf-8');
      }
    } catch (error) {
      console.error(`Error processing file ${file.originalname}:`, error);
      processed.metadata = { error: `Failed to process: ${error}` };
    }

    processedFiles.push(processed);
  }

  return processedFiles;
}

function buildContextFromFiles(files: ProcessedFile[], includeFromSession: boolean = false): string {
  let context = "";
  
  if (includeFromSession && files.length > 0) {
    context += "=== PREVIOUSLY UPLOADED FILES (Available for Reference) ===\n\n";
  } else if (files.length > 0) {
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
      file.extractedData.tags.slice(0, 5).forEach((tag: any) => {
        context += `  - ${tag.TagName || tag.name}: ${tag.DataType || tag.dataType} (${tag.Direction || 'Internal'})\n`;
      });
      if (file.extractedData.tags.length > 5) {
        context += `  ... and ${file.extractedData.tags.length - 5} more tags\n`;
      }
    }
    
    if (file.extractedData?.routines && file.extractedData.routines.length > 0) {
      context += `Routines Found: ${file.extractedData.routines.length}\n`;
      file.extractedData.routines.forEach((routine: any) => {
        context += `  - ${routine.Name}: ${routine.Type}\n`;
      });
    }
    
    if (file.content && file.content.length < 2000) {
      context += `Content:\n${file.content}\n`;
    } else if (file.content) {
      context += `Content (truncated):\n${file.content.substring(0, 1500)}...\n`;
    }
    
    if (file.extractedData?.tables) {
      context += `Tables Extracted: ${file.extractedData.tables.length}\n`;
      file.extractedData.tables.forEach((table: any) => {
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
const CodeArtifactSchema = z.object({
  language: z.string(),
  vendor: z.enum(["Rockwell", "Siemens", "Beckhoff", "Generic"]),
  compilable: z.boolean(),
  filename: z.string(),
  content: z.string(),
});

const TableArtifactSchema = z.object({
  title: z.string(),
  schema: z.array(z.string()),
  rows: z.array(z.array(z.string())),
});

const ReportArtifactSchema = z.object({
  title: z.string(),
  content_md: z.string(),
});

const AnchorSchema = z.object({
  id: z.string(),
  file: z.string(),
  page: z.number().optional(),
  note: z.string(),
});

const ArtifactsSchema = z.object({
  code: z.array(CodeArtifactSchema),
  diff: z.string().optional(),
  tables: z.array(TableArtifactSchema),
  reports: z.array(ReportArtifactSchema),
  anchors: z.array(AnchorSchema),
  citations: z.array(z.string()),
});

const ResponseSchema = z.object({
  status: z.enum(["ok", "needs_input", "error"]),
  task_type: z.enum(["doc_qa", "doc_summary", "tag_extract", "code_gen", "code_edit", "report", "table_extract"]),
  assumptions: z.array(z.string()),
  answer_md: z.string(),
  artifacts: ArtifactsSchema,
  next_actions: z.array(z.string()),
  errors: z.array(z.string()),
});

const ReqSchema = z.object({
  prompt: z.string().min(1),
  projectId: z.string().optional(),
  vendor_selection: z.enum(["Rockwell", "Siemens", "Beckhoff", "Generic"]).optional(),
  sessionId: z.string().optional(), // Add sessionId support
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
      model_available: true,
      model_name: MODEL_NAME,
      vision_model: VISION_MODEL,
      consecutive_failures: consecutiveFailures,
      circuit_breaker_active: Date.now() < circuitBreakerUntil,
      document_support: true,
      image_support: true,
      plc_support: true,
      supported_formats: documentProcessor.getSupportedFormats(),
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
  } catch (error: any) {
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
async function handleWrapperBStreamingRequest(req: any, res: any, prompt: string, projectId?: string, vendor_selection?: string, sessionId?: string) {
  try {
    // Set up streaming response headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Set CORS headers properly for streaming
    const origin = req.headers.origin;
    if (origin && (origin.includes('localhost:5173') || origin.includes('vercel.app'))) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
      res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173');
    }
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, Cache-Control, X-Requested-With');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Cache-Control');

    // Send initial status
    res.write(`data: ${JSON.stringify({ content: 'Processing documents and analyzing...', type: 'status' })}\n\n`);
    
    // Get session memory if sessionId provided
    const session = sessionId ? getOrCreateSession(sessionId) : null;
    let conversationHistory: Array<{ role: 'system' | 'user' | 'assistant'; content: string | any[] }> = [
      { role: 'system', content: WRAPPER_B_SYSTEM }
    ];
    
    if (session && session.messages.length > 0) {
      // Add conversation history
      conversationHistory.push(...convertMessagesToOpenAIFormat(session.messages));
    }
    
    // Process uploaded files
    const files = req.files as Express.Multer.File[] || [];
    let processedFiles: ProcessedFile[] = [];
    let fileContext = "";
    
    if (files.length > 0) {
      res.write(`data: ${JSON.stringify({ content: `Processing ${files.length} uploaded files...`, type: 'status' })}\n\n`);
      processedFiles = await processUploadedFiles(files);
      fileContext = buildContextFromFiles(processedFiles);
      
      // Add files to session memory
      if (sessionId) {
        addFilesToMemory(sessionId, processedFiles);
      }
    } else if (session && session.uploadedFiles.length > 0) {
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
      const content: any[] = [
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
    } else {
      // Text-only message
      conversationHistory.push({ role: 'user', content: userContent });
    }

    res.write(`data: ${JSON.stringify({ content: 'Analyzing with AI...', type: 'status' })}\n\n`);

    const TIMEOUT_MS = 180_000; // 3 minutes for document processing

    function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
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
    
    const response = await withTimeout(
      openai.chat.completions.create({
        model: modelToUse,
        messages: conversationHistory as any,
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
      TIMEOUT_MS
    );

    const raw = response.choices[0]?.message?.content ?? "";
    if (!raw) throw new Error("Empty response from AI model");

    // Save to memory if sessionId provided
    if (sessionId) {
      addToMemory(sessionId, 'user', prompt);
      addToMemory(sessionId, 'assistant', raw);
    }

    let data: any;
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
        
        // Send the answer content as streaming chunks
        const answer = data.answer_md || "";
        const words = answer.split(' ');
        const chunkSize = 5; // Send 5 words at a time for Wrapper B
        
        res.write(`data: ${JSON.stringify({ content: '', type: 'start' })}\n\n`);
        
        for (let i = 0; i < words.length; i += chunkSize) {
          const chunk = words.slice(i, i + chunkSize).join(' ') + (i + chunkSize < words.length ? ' ' : '');
          res.write(`data: ${JSON.stringify({ content: chunk, type: 'chunk' })}\n\n`);
          
          // Small delay to simulate typing effect
          await new Promise(resolve => setTimeout(resolve, 40));
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
        
      } else {
        // Schema validation failed
        console.log("⚠️ Wrapper B streaming schema validation failed:", result.error);
        throw new Error("Invalid response format from AI");
      }
    } catch (parseError: any) {
      console.error("❌ Wrapper B streaming JSON parse error:", parseError);
      res.write(`data: ${JSON.stringify({ 
        type: 'error',
        error: 'Failed to parse AI response. Please try again.'
      })}\n\n`);
    }

    // End the stream
    res.write(`data: ${JSON.stringify({ type: 'end' })}\n\n`);
    res.end();

  } catch (error: any) {
    console.error("❌ Wrapper B streaming error:", error);
    res.write(`data: ${JSON.stringify({ 
      type: 'error',
      error: error.message || 'An error occurred during streaming'
    })}\n\n`);
    res.end();
  }
}

// Helper function to clean answer_md (same as Wrapper A)
function cleanAnswerMd(answerMd: string): string {
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
    let messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string | any[] }> = [
      { role: 'system', content: WRAPPER_B_SYSTEM }
    ];
    
    if (session && session.messages.length > 0) {
      // Add conversation history
      messages.push(...convertMessagesToOpenAIFormat(session.messages));
    }
    
    // Process uploaded files
    const files = req.files as Express.Multer.File[] || [];
    let processedFiles: ProcessedFile[] = [];
    let fileContext = "";
    
    if (files.length > 0) {
      console.log(`Processing ${files.length} uploaded files...`);
      processedFiles = await processUploadedFiles(files);
      fileContext = buildContextFromFiles(processedFiles);
      
      // Add files to session memory
      if (sessionId) {
        addFilesToMemory(sessionId, processedFiles);
      }
    } else if (session && session.uploadedFiles.length > 0) {
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
      const content: any[] = [
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
    } else {
      // Text-only message
      messages.push({ role: 'user', content: userContent });
    }

    const TIMEOUT_MS = 180_000; // 3 minutes for document processing

    function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
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
    
    const response = await withTimeout(
      openai.chat.completions.create({
        model: modelToUse,
        messages: messages as any,
        temperature: 0.1,
        max_tokens: 4000,
        response_format: { type: "json_object" },
      }),
      TIMEOUT_MS
    );

    const raw = response.choices[0]?.message?.content ?? "";
    if (!raw) throw new Error("Empty response from AI model");

    console.log("🔍 Raw AI response:", raw);

    // Save to memory if sessionId provided
    if (sessionId) {
      addToMemory(sessionId, 'user', prompt);
      addToMemory(sessionId, 'assistant', raw);
    }

    let data: any;
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
      } else {
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

          const retryResponse = await withTimeout(
            openai.chat.completions.create({
              model: modelToUse,
              messages: [
                { role: 'system', content: WRAPPER_B_SYSTEM },
                { role: 'user', content: userContent },
                { role: 'assistant', content: raw },
                { role: 'user', content: retryMessage }
              ] as any,
              temperature: 0.1,
              max_tokens: 4000,
              response_format: { type: "json_object" },
            }),
            30000 // 30 second timeout for retry
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
            } else {
              throw new Error("Retry also failed validation");
            }
          } else {
            throw new Error("Empty retry response");
          }
        } catch (retryError) {
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
              ...result.error.issues.map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`)
            ],
          };
        }
      }
    } catch (parseError) {
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
  } catch (err: any) {
    consecutiveFailures++;
    if (consecutiveFailures >= MAX_FAILURES) {
      circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
      console.warn(
        `🔴 Circuit breaker ON for ${
          CIRCUIT_BREAKER_TIMEOUT / 1000
        }s after ${consecutiveFailures} failures`
      );
    }

    let errorMessage = "An error occurred while processing your request. Please try again.";
    let httpStatus = 500;
    const msg = String(err?.message || "");

    if (msg.includes("abort") || msg.includes("timeout")) {
      errorMessage = "The AI model is taking longer than expected. Please try a simpler question or try again later.";
      httpStatus = 408;
    } else if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
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

// ---------- Session Memory Management Endpoints ----------

// Clear session memory
router.post("/clear-memory", (req, res) => {
  const { sessionId } = req.body;
  if (sessionId) {
    delete sessionMemory[sessionId];
    res.json({ status: "ok", message: `Memory cleared for session: ${sessionId}` });
  } else {
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
  } else {
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
router.use((err: any, _req: any, res: any, _next: any) => {
  console.error("Unhandled route error:", err);
  if (res.headersSent) return;
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

export default router;
