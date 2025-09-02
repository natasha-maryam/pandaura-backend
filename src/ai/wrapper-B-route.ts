import { Router } from "express";
import { z, ZodIssue } from "zod";
import OpenAI from "openai";
import path from "path";
import { WRAPPER_B_SYSTEM } from "./wrapper-B-system";
import { WRAPPER_C_SYSTEM } from "./wrapper-C-system";
import { getAIConfig } from "../config/ai-config";
import { imageProcessor } from "../utils/imageProcessor";
import { documentProcessor } from "../utils/documentProcessor";
import { parseProject } from "../utils/enterprisePLCParser";
import { SimpleCodeGovernor } from "./code-governor/simple-governor";
import multer from "multer";

const router = Router();

// ---------- OpenAI client ----------
const config = getAIConfig();

// Validate API key exists
if (!config.openai.apiKey) {
  console.error("🚨 CRITICAL ERROR: OPENAI_API_KEY environment variable not set!");
  console.error("🚨 Code generation will fail without valid API key");
}

const openai = new OpenAI({
  apiKey: config.openai.apiKey,
  baseURL: config.openai.baseUrl,
});

// ---------- Model configuration ----------
const MODEL_NAME = config.openai.model;
const VISION_MODEL = "gpt-4o"; // Use GPT-4o for vision capabilities

// ---------- Session Memory System ----------
interface SessionMemory {
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  }>;

  uploadedFiles: ProcessedFile[];
  createdAt: Date;
  lastAccessed: Date;
}

const sessionMemory: Record<string, SessionMemory> = {};

// Clean up old sessions (older than 24 hours)
setInterval(() => {
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  Object.keys(sessionMemory).forEach((sessionId) => {
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
      lastAccessed: new Date(),
    };
  } else {
    sessionMemory[sessionId].lastAccessed = new Date();
  }
  return sessionMemory[sessionId];
}

function addToMemory(
  sessionId: string,
  role: "user" | "assistant",
  content: string
) {
  const session = getOrCreateSession(sessionId);
  session.messages.push({
    role,
    content,
    timestamp: new Date(),
  });

  // Keep only last 20 messages to prevent memory bloat
  if (session.messages.length > 20) {
    session.messages = session.messages.slice(-20);
  }
}

function addFilesToMemory(sessionId: string, files: ProcessedFile[]) {
  const session = getOrCreateSession(sessionId);
  // Add new files to session memory, avoiding duplicates
  files.forEach((newFile) => {
    const existingIndex = session.uploadedFiles.findIndex(
      (f) => f.filename === newFile.filename
    );
    if (existingIndex >= 0) {
      // Update existing file
      session.uploadedFiles[existingIndex] = newFile;
    } else {
      // Add new file
      session.uploadedFiles.push(newFile);
    }
  });
}

function convertMessagesToOpenAIFormat(
  messages: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  }>
) {
  return messages.map((msg) => ({
    role: msg.role,
    content: msg.content,
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
      "image/jpeg",
      "image/jpg",
      "image/png",
      "image/gif",
      "image/webp",
      "image/bmp",
      "image/tiff",
      // Documents
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "text/plain",
      "text/csv",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      // PLC project files
      "application/zip", // For exported PLC projects
      "application/x-zip-compressed",
      "text/x-structured-text", // ST files
      "application/octet-stream", // Generic binary for PLC exports
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(
        new Error(
          "Invalid file type. Only images, documents, and PLC project files are allowed."
        )
      );
    }
  },
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

function removeDuplicateJsonKeys(jsonString: string): string {
  try {
    const parsed = JSON.parse(jsonString);
    return JSON.stringify(parsed);
  } catch {
    // More sophisticated cleaning for malformed JSON
    let cleaned = jsonString.trim();

    // Remove any text before the first {
    const firstBrace = cleaned.indexOf("{");
    if (firstBrace > 0) {
      cleaned = cleaned.substring(firstBrace);
    }

    // Find the first complete JSON object
    let braceCount = 0;
    let jsonEnd = -1;

    for (let i = 0; i < cleaned.length; i++) {
      if (cleaned[i] === "{") {
        braceCount++;
      } else if (cleaned[i] === "}") {
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

async function processUploadedFiles(
  files: Express.Multer.File[]
): Promise<ProcessedFile[]> {
  const processedFiles: ProcessedFile[] = [];

  for (const file of files) {
    const processed: ProcessedFile = {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    };

    try {
      if (file.mimetype.startsWith("image/")) {
        // Process image files
        const imageInfo = await imageProcessor.processImage(
          file.buffer,
          file.originalname
        );
        processed.imageData = `data:${
          file.mimetype
        };base64,${file.buffer.toString("base64")}`;
        processed.metadata = imageInfo;
      } else if (
        file.originalname.endsWith(".st") ||
        file.originalname.endsWith(".scl") ||
        file.originalname.endsWith(".xml") ||
        file.originalname.endsWith(".l5x") ||
        file.originalname.endsWith(".ap11") ||
        file.originalname.endsWith(".tsproj") ||
        file.mimetype === "text/x-structured-text"
      ) {
        // Process PLC project files with enterprise parser
        const plcData = await parseProject(file.originalname, file.buffer);
        processed.content = JSON.stringify(plcData, null, 2);
        processed.metadata = {
          type: "plc_project",
          vendor: plcData.vendor,
          projectName: plcData.project_name,
        };
        processed.extractedData = {
          tags: plcData.tags,
          routines: plcData.routines,
          plcInfo: {
            vendor: plcData.vendor,
            projectName: plcData.project_name,
            metadata: plcData.metadata,
          },
        };
      } else if (
        file.mimetype === "application/pdf" ||
        file.mimetype.includes("word") ||
        file.mimetype.includes("excel") ||
        file.mimetype.includes("powerpoint") ||
        file.mimetype === "text/plain" ||
        file.mimetype === "text/csv"
      ) {
        // Process document files
        const docInfo = await documentProcessor.processDocument(
          file.buffer,
          file.originalname
        );
        processed.content = docInfo.content;
        processed.metadata = docInfo.metadata;
        processed.extractedData = docInfo.extractedData;
      } else {
        // Generic file processing
        processed.content = file.buffer.toString("utf-8");
      }
    } catch (error) {
      console.error(`Error processing file ${file.originalname}:`, error);
      processed.metadata = { error: `Failed to process: ${error}` };
    }

    processedFiles.push(processed);
  }

  return processedFiles;
}

function buildContextFromFiles(
  files: ProcessedFile[],
  includeFromSession: boolean = false
): string {
  let context = "";

  if (includeFromSession && files.length > 0) {
    context +=
      "=== PREVIOUSLY UPLOADED FILES (Available for Reference) ===\n\n";
  } else if (files.length > 0) {
    context += "=== UPLOADED FILES CONTEXT ===\n\n";
  }

  files.forEach((file, index) => {
    context += `FILE ${index + 1}: ${file.filename}\n`;
    context += `Type: ${file.mimetype}\n`;
    context += `Size: ${(file.size / 1024).toFixed(2)} KB\n`;
    context += `Upload timestamp: ${new Date().toISOString()}\n`;

    // Add unique file identifier
    const fileHash = Buffer.from(file.filename + file.size + file.mimetype)
      .toString("base64")
      .substring(0, 8);
    context += `File ID: ${fileHash}\n`;

    // Add PLC-specific information if available
    if (file.extractedData?.plcInfo?.vendor) {
      context += `PLC Vendor: ${file.extractedData.plcInfo.vendor}\n`;
      context += `Project: ${
        file.extractedData.plcInfo.projectName || "Unknown"
      }\n`;
    }

    if (file.extractedData?.tags && file.extractedData.tags.length > 0) {
      context += `Tags Found: ${file.extractedData.tags.length}\n`;
      context += `Sample Tags:\n`;
      file.extractedData.tags.slice(0, 5).forEach((tag: any) => {
        context += `  - ${tag.TagName || tag.name}: ${
          tag.DataType || tag.dataType
        } (${tag.Direction || "Internal"})\n`;
      });
      if (file.extractedData.tags.length > 5) {
        context += `  ... and ${
          file.extractedData.tags.length - 5
        } more tags\n`;
      }
    }

    if (
      file.extractedData?.routines &&
      file.extractedData.routines.length > 0
    ) {
      context += `Routines Found: ${file.extractedData.routines.length}\n`;
      file.extractedData.routines.forEach((routine: any) => {
        context += `  - ${routine.Name}: ${routine.Type}\n`;
      });
    }

    // Include more file content to make each response unique
    if (file.content && file.content.length < 3000) {
      context += `Full Content:\n${file.content}\n`;
    } else if (file.content) {
      // Include more content and add content hash for uniqueness
      const contentHash = Buffer.from(file.content)
        .toString("base64")
        .substring(0, 12);
      context += `Content (truncated from ${
        file.content.length
      } chars, hash: ${contentHash}):\n${file.content.substring(0, 2500)}...\n`;
    }

    if (file.extractedData?.tables) {
      context += `Tables Extracted: ${file.extractedData.tables.length}\n`;
      file.extractedData.tables.forEach((table: any) => {
        context += `  Table: ${table.title} (${
          table.rows?.length || 0
        } rows)\n`;
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
  task_type: z.enum([
    "doc_qa",
    "doc_summary",
    "tag_extract",
    "code_gen",
    "code_edit",
    "report",
    "table_extract",
  ]),
  assumptions: z.array(z.string()),
  answer_md: z.string(),
  artifacts: ArtifactsSchema,
  next_actions: z.array(z.string()),
  errors: z.array(z.string()),
});

const ReqSchema = z.object({
  prompt: z.string().min(1),
  projectId: z.string().optional(),
  vendor_selection: z
    .enum(["Rockwell", "Siemens", "Beckhoff", "Generic"])
    .optional(),
  sessionId: z.string().optional(), // Add sessionId support
  stream: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((val) => {
      if (typeof val === "string") {
        return val.toLowerCase() === "true";
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
      citations: [],
    },
    next_actions: [],
    errors: [],
  });
});

// ---------- Streaming handler for Wrapper B ----------
async function handleWrapperBStreamingRequest(
  req: any,
  res: any,
  prompt: string,
  projectId?: string,
  vendor_selection?: string,
  sessionId?: string
) {
  try {
    // Set up streaming response headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    // Set CORS headers properly for streaming
    const origin = req.headers.origin;
    if (
      origin &&
      (origin.includes("localhost:5173") || origin.includes("vercel.app"))
    ) {
      res.setHeader("Access-Control-Allow-Origin", origin);
    } else {
      res.setHeader("Access-Control-Allow-Origin", "http://localhost:5173");
    }
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Accept, Cache-Control, X-Requested-With"
    );
    res.setHeader(
      "Access-Control-Expose-Headers",
      "Content-Type, Cache-Control"
    );

    // Send initial status
    res.write(
      `data: ${JSON.stringify({
        content: "Processing documents and analyzing...",
        type: "status",
      })}\n\n`
    );

    // Get session memory if sessionId provided
    const session = sessionId ? getOrCreateSession(sessionId) : null;
    let conversationHistory: Array<{
      role: "system" | "user" | "assistant";
      content: string | any[];
    }> = [{ role: "system", content: WRAPPER_B_SYSTEM }];

    if (session && session.messages.length > 0) {
      // Add conversation history
      conversationHistory.push(
        ...convertMessagesToOpenAIFormat(session.messages)
      );
    }

    // Process uploaded files
    const files = (req.files as Express.Multer.File[]) || [];
    let processedFiles: ProcessedFile[] = [];
    let fileContext = "";

    if (files.length > 0) {
      res.write(
        `data: ${JSON.stringify({
          content: `Processing ${files.length} NEW uploaded files...`,
          type: "status",
        })}\n\n`
      );
      processedFiles = await processUploadedFiles(files);
      fileContext = buildContextFromFiles(processedFiles);

      console.log(
        `📁 Streaming: Files being processed:`,
        files.map((f) => f.originalname)
      );
      console.log(
        `📝 Streaming: Generated file context length: ${fileContext.length} characters`
      );

      // Replace files in session memory (don't accumulate)
      if (sessionId) {
        const session = getOrCreateSession(sessionId);
        session.uploadedFiles = processedFiles; // Replace, don't add
        console.log(
          `🔄 Streaming: Updated session ${sessionId} with ${processedFiles.length} files`
        );
      }
    } else if (session && session.uploadedFiles.length > 0) {
      // No new files, but use previously uploaded files from session
      res.write(
        `data: ${JSON.stringify({
          content: `Using ${session.uploadedFiles.length} previously uploaded files...`,
          type: "status",
        })}\n\n`
      );
      console.log(
        `📁 Streaming: Session files:`,
        session.uploadedFiles.map((f) => f.filename)
      );
      fileContext = buildContextFromFiles(session.uploadedFiles, true);
      processedFiles = session.uploadedFiles; // For response metadata
    } else {
      // No files available for document analysis
      console.log(`⚠️ Streaming: No files provided and no files in session`);
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error:
            "Document Analyst requires files to analyze. Please upload PLC files, documents, or images, or switch to General Assistant (Wrapper A).",
        })}\n\n`
      );
      res.end();
      return;
    }

    // Prepare user message content
    let userContent = `PROJECT_ID=${projectId ?? ""}\nVENDOR=${
      vendor_selection ?? "Generic"
    }\n\n`;

    if (fileContext) {
      userContent += fileContext + "\n\n";
    }

    userContent += `USER_PROMPT:\n${prompt}\n\n`;
    userContent += `RESPONSE REQUIREMENTS: Respond ONLY with valid JSON matching the schema specified in system message. Include ALL required fields: status, task_type, assumptions, answer_md, artifacts, next_actions, errors. No text outside the JSON object.`;

    // Handle images separately for vision model
    const imageFiles = processedFiles.filter((f) => f.imageData);

    if (imageFiles.length > 0) {
      // Use vision model for image analysis
      const content: any[] = [{ type: "text", text: userContent }];

      // Add images to content
      imageFiles.forEach((img) => {
        content.push({
          type: "image_url",
          image_url: { url: img.imageData },
        });
      });

      conversationHistory.push({ role: "user", content });
    } else {
      // Text-only message
      conversationHistory.push({ role: "user", content: userContent });
    }

    // Check if this is a code generation request
    // Exclude tag extraction and analysis requests
    const isTagExtractionRequest =
      /\b(extract|list|find|identify|show|get|display)\s+(tags?|variables?|I\/O|inputs?|outputs?)\b/i.test(
        prompt
      );
    const isAnalysisRequest =
      /\b(analyz|extract|summar|review|examine|inspect|describe|explain|list)\b/i.test(
        prompt
      ) &&
      !/\b(generat|creat|build|write|implement|develop|design|continue|finish|complete)\b/i.test(
        prompt
      );

    const isCodeGeneration =
      !isTagExtractionRequest &&
      !isAnalysisRequest &&
      (/\b(generat|creat|build|write|implement|develop|design|convert|transform)\s+(code|program|scl|ladder|function\s*block|fb_|ob_|udt|plc)\b/i.test(
        prompt
      ) ||
        /\b(code\s+for|program\s+for|implement\s+a|create\s+a\s+program|write\s+scl|generate\s+siemens|build\s+rockwell|convert.*to|transform.*to|design.*scl|siemens.*s7)\b/i.test(
          prompt
        ) ||
        /\b(continue|finish|complete|rest|remaining|all|more)\s+(generat|code|function|block|implement|program|scl)\b/i.test(
          prompt
        ) ||
        /\b(continue\s+generating|generate.*all|complete.*code|finish.*code|rest.*code|scl|structured\s+control\s+language|function.*block|siemens|s7-1500|tia\s+portal)\b/i.test(
          prompt
        ) ||
        // More aggressive patterns for PLC conversion requests
        /\b(convert|transform|implement|design).*\b(siemens|s7-1500|scl|structured\s+control\s+language|tia\s+portal|function\s+block|plc)\b/i.test(
          prompt
        ) ||
        /\b(operating\s+modes|conveyor|palletizer|handshake|alarm|diagnostic|fb_|ob1|ob100|udt)\b/i.test(
          prompt
        ) ||
        // Also check if the previous session context suggests this is code generation continuation
        (session &&
          session.messages.length > 0 &&
          session.messages.some(
            (msg) =>
              msg.role === "assistant" &&
              (msg.content.includes("FUNCTION_BLOCK") ||
                msg.content.includes("// File:") ||
                msg.content.includes("SCL") ||
                msg.content.includes("END_FUNCTION_BLOCK"))
          ) &&
          /\b(continue|all|more|rest|finish|complete)\b/i.test(prompt)));

    console.log("🔍 Code Generation Detection:", {
      prompt: prompt.substring(0, 200) + "...",
      isTagExtractionRequest,
      isAnalysisRequest,
      isCodeGeneration,
      vendor_selection,
      promptLength: prompt.length,
    });

    if (isCodeGeneration) {
      console.log("🚀 Code Generation Governor activated!");
      // Use Code Generation Governor for complete, vendor-compliant code
      res.write(
        `data: ${JSON.stringify({
          content: "Initializing Code Generation Governor...",
          type: "status",
        })}\n\n`
      );

      try {
        console.log("🎯 Simple Governor generation parameters:", {
          specTextLength:
            prompt.length + (fileContext ? fileContext.length : 0),
          hasFileContext: !!fileContext,
          fileContextLength: fileContext ? fileContext.length : 0,
        });

        res.write(
          `data: ${JSON.stringify({
            content:
              "Analyzing uploaded document and generating PLC program...",
            type: "status",
          })}\n\n`
        );

        let result;

        // Use document-based generation if we have file context
        if (fileContext && fileContext.length > 100) {
          console.log(
            "📄 Using document-based code generation with file context"
          );
          result = await SimpleCodeGovernor.generateFromDocument(
            fileContext,
            prompt
          );
        } else {
          console.log(
            "📄 Using massive code generation without specific document context"
          );
          result = await SimpleCodeGovernor.generateFromDocument(
            prompt + (fileContext ? "\n\nFile Context:\n" + fileContext : ""),
            prompt
          );
        }

        console.log(
          "✅ Simple Governor generation completed! Files generated:",
          Object.keys(result.files).length
        );

        res.write(
          `data: ${JSON.stringify({
            content: "Code generation complete. Sending files...",
            type: "status",
          })}\n\n`
        );

        // Send code artifacts IMMEDIATELY to prevent Railway timeout
        const codeArtifacts = Object.entries(result.files).map(
          ([filename, content]) => ({
            language:
              filename.endsWith(".scl") || filename.endsWith(".st")
                ? filename.endsWith(".scl")
                  ? "SCL"
                  : "ST"
                : "markdown",
            vendor: result.vendor || result.metadata?.detectedVendor || "Siemens",
            compilable: result.filesValidation?.[filename]?.compilable ?? (filename.endsWith(".scl") || filename.endsWith(".st")),
            filename,
            content,
          })
        );

        // Send artifacts immediately in chunks to prevent timeout
        console.log(`📤 Sending ${codeArtifacts.length} code artifacts immediately...`);
        
        for (let i = 0; i < codeArtifacts.length; i += 5) {
          const chunk = codeArtifacts.slice(i, i + 5);
          const artifactChunk = JSON.stringify({
            type: "artifacts",
            artifacts: { code: chunk },
            chunkIndex: Math.floor(i / 5),
            totalChunks: Math.ceil(codeArtifacts.length / 5)
          });
          
          res.write(`data: ${artifactChunk}\n\n`);
          res.flush?.(); // Force immediate send
          console.log(`📤 Sent artifact chunk ${Math.floor(i / 5) + 1}/${Math.ceil(codeArtifacts.length / 5)} (${artifactChunk.length} bytes)`);
        }

        // Create comprehensive response
        const governorResponse = {
          status: "ok",
          task_type: "code_gen",
          assumptions: [
            `Generated using Simple Code Governor for ${result.vendor || 'Siemens'}`,
            `Vendor detected: ${result.metadata?.detectedVendor || result.vendor || 'Siemens'}`,
            `Files validated: ${Object.keys(result.filesValidation || {}).length} files`,
            "Complete implementation with no skeleton code"
          ],
          answer_md: result.summary || "", // Use the summary as explanation
          artifacts: {
            code: Object.entries(result.files).map(([filename, content]) => ({
              filename,
              language: filename.split(".").pop() || "txt",
              content,
              vendor: result.vendor || result.metadata?.detectedVendor || "Siemens",
              compilable: result.filesValidation?.[filename]?.compilable ?? true,
              errors: result.filesValidation?.[filename]?.errors || []
            })),
          },
          next_actions: [
            "Import files into development environment",
            "Configure I/O mapping according to hardware",
            "Test in simulation mode",
            "Validate safety functions",
            "Deploy to production"
          ],
          errors: [],
          metadata: result.metadata
        };

        // Stream the response character by character
        const answer = governorResponse.answer_md || "";
        
        // Add file listing to the streamed response to ensure it's always visible
        const fileListingText = `\n\n## Generated Files (${Object.keys(result.files).length} files):\n` +
          Object.entries(result.files)
            .map(([name, content]) => `- **${name}**: ${content.split('\n').length} lines`)
            .join('\n') + '\n\n';
        
        const completeAnswer = answer + fileListingText;
        
        res.write(
          `data: ${JSON.stringify({ content: "", type: "start" })}\n\n`
        );

        const characters = completeAnswer.split("");
        for (const char of characters) {
          res.write(
            `data: ${JSON.stringify({ content: char, type: "chunk" })}\n\n`
          );
          await new Promise((resolve) => setTimeout(resolve, 20));
        }

        // Send the complete response (minimal version for Railway compatibility)
        const minimalResponse = {
          ...governorResponse,
          artifacts: {
            code: [], // Don't send code in complete event - already sent in chunks
          }
        };
        
        res.write(
          `data: ${JSON.stringify({
            type: "complete",
            answer: governorResponse.answer_md,
            fullResponse: minimalResponse,
            artifactsSentInChunks: true, // Flag to indicate artifacts were sent separately
            totalFiles: Object.keys(result.files).length
          })}\n\n`
        );

        console.log(`📤 Sent minimal complete response (artifacts sent separately in chunks)`);
        console.log(`📤 Minimal response size: ${JSON.stringify(minimalResponse).length} characters`);
        console.log(`📤 Original response size would have been: ${JSON.stringify(governorResponse).length} characters`);

        res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
        res.end();
        return;
      } catch (error) {
        console.error("Code Governor error:", error);
        res.write(
          `data: ${JSON.stringify({
            type: "error",
            error: `Code Generation Error: ${
              error instanceof Error ? error.message : "Unknown error"
            }`,
          })}\n\n`
        );
        res.end();
        return;
      }
    }

    res.write(
      `data: ${JSON.stringify({
        content: "Analyzing with AI...",
        type: "status",
      })}\n\n`
    );

    const TIMEOUT_MS = 180_000; // 3 minutes for document processing

    // Use vision model if images present, otherwise use standard model
    const modelToUse = imageFiles.length > 0 ? VISION_MODEL : MODEL_NAME;

    const response = await withTimeout(
      openai.chat.completions.create({
        model: modelToUse,
        messages: conversationHistory as any,
        temperature: 0.1,
        max_tokens: 16384,
        response_format: { type: "json_object" },
      }),
      TIMEOUT_MS
    );

    const raw = response.choices[0]?.message?.content ?? "";
    if (!raw) throw new Error("Empty response from AI model");

    // Save to memory if sessionId provided
    if (sessionId) {
      addToMemory(sessionId, "user", prompt);
      addToMemory(sessionId, "assistant", raw);
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
          citations: [],
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

        res.write(
          `data: ${JSON.stringify({ content: "", type: "start" })}\n\n`
        );

        // Stream character by character for better typing effect
        const characters = answer.split("");
        for (const char of characters) {
          res.write(
            `data: ${JSON.stringify({ content: char, type: "chunk" })}\n\n`
          );

          // Small delay for character-by-character effect
          await new Promise((resolve) => setTimeout(resolve, 20)); // 20ms per character
        }

        // Send the complete response with processed files
        res.write(
          `data: ${JSON.stringify({
            type: "complete",
            answer: data.answer_md,
            fullResponse: {
              ...data,
              processed_files: (session?.uploadedFiles || processedFiles).map(
                (pf) => ({
                  filename: pf.filename,
                  type: pf.mimetype,
                  size: pf.size,
                  extracted_data_available: !!pf.extractedData,
                })
              ),
            },
          })}\n\n`
        );
      } else {
        // Schema validation failed
        console.log(
          "⚠️ Wrapper B streaming schema validation failed:",
          result.error
        );
        throw new Error("Invalid response format from AI");
      }
    } catch (parseError: any) {
      console.error("❌ Wrapper B streaming JSON parse error:", parseError);
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          error: "Failed to parse AI response. Please try again.",
        })}\n\n`
      );
    }

    // End the stream
    res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
    res.end();
  } catch (error: any) {
    console.error("❌ Wrapper B streaming error:", error);
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        error: error.message || "An error occurred during streaming",
      })}\n\n`
    );
    res.end();
  }
}

// Helper function to clean answer_md (same as Wrapper A)
function cleanAnswerMd(answerMd: string): string {
  // Remove code blocks from answer_md since code should be in artifacts
  return answerMd
    .replace(/```[\s\S]*?```/g, "") // Remove code blocks
    .replace(/`([^`]+)`/g, "$1") // Remove inline code formatting
    .trim();
}

// ---------- Main wrapper B endpoint ----------
router.post("/wrapperB", upload.array("files", 10), async (req, res) => {
  const parsed = ReqSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { prompt, projectId, vendor_selection, sessionId, stream } =
    parsed.data;

  // Circuit breaker check
  if (Date.now() < circuitBreakerUntil) {
    return res.status(503).json({
      status: "error",
      task_type: "doc_qa",
      assumptions: [],
      answer_md:
        "AI service is temporarily unavailable due to repeated failures. Please try again in a moment.",
      artifacts: {
        code: [],
        tables: [],
        reports: [],
        anchors: [],
        citations: [],
      },
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
      artifacts: {
        code: [],
        tables: [],
        reports: [],
        anchors: [],
        citations: [],
      },
      next_actions: [],
      errors: ["Prompt exceeds maximum length"],
    });
  }

  // Handle streaming request
  if (stream) {
    return handleWrapperBStreamingRequest(
      req,
      res,
      prompt,
      projectId,
      vendor_selection,
      sessionId
    );
  }

  try {
    const startTime = Date.now();

    // Get session memory if sessionId provided
    const session = sessionId ? getOrCreateSession(sessionId) : null;
    let messages: Array<{
      role: "system" | "user" | "assistant";
      content: string | any[];
    }> = [{ role: "system", content: WRAPPER_B_SYSTEM }];

    if (session && session.messages.length > 0) {
      // Add conversation history
      messages.push(...convertMessagesToOpenAIFormat(session.messages));
    }

    // Process uploaded files
    const files = (req.files as Express.Multer.File[]) || [];
    let processedFiles: ProcessedFile[] = [];
    let fileContext = "";

    if (files.length > 0) {
      console.log(`Processing ${files.length} NEW uploaded files...`);
      processedFiles = await processUploadedFiles(files);
      fileContext = buildContextFromFiles(processedFiles);

      console.log(
        `📁 Files being processed in this request:`,
        files.map((f) => f.originalname)
      );
      console.log(
        `📝 Generated file context length: ${fileContext.length} characters`
      );

      // Replace files in session memory (don't accumulate)
      if (sessionId) {
        const session = getOrCreateSession(sessionId);
        session.uploadedFiles = processedFiles; // Replace, don't add
        console.log(
          `🔄 Updated session ${sessionId} with ${processedFiles.length} files`
        );
      }
    } else if (session && session.uploadedFiles.length > 0) {
      // No new files, but use previously uploaded files from session
      console.log(
        `Using ${session.uploadedFiles.length} previously uploaded files from session...`
      );
      console.log(
        `📁 Session files:`,
        session.uploadedFiles.map((f) => f.filename)
      );
      fileContext = buildContextFromFiles(session.uploadedFiles, true);
      processedFiles = session.uploadedFiles; // For response metadata
    } else {
      console.log(`⚠️ No files provided and no files in session`);

      // Return error if no files are available for document analysis
      return res.status(400).json({
        status: "error",
        task_type: "doc_qa",
        assumptions: [],
        answer_md:
          "Document Analyst requires files to analyze. Please upload PLC files, documents, or images, or switch to General Assistant (Wrapper A).",
        artifacts: {
          code: [],
          tables: [],
          reports: [],
          anchors: [],
          citations: [],
        },
        next_actions: ["Upload documents", "Switch to General Assistant"],
        errors: ["No files available for analysis"],
      });
    }

    // Prepare user message content
    let userContent = `PROJECT_ID=${projectId ?? ""}\nVENDOR=${
      vendor_selection ?? "Generic"
    }\n\n`;

    if (fileContext) {
      userContent += fileContext + "\n\n";
    }

    userContent += `USER_PROMPT:\n${prompt}\n\n`;
    userContent += `RESPONSE REQUIREMENTS: Respond ONLY with valid JSON matching the schema specified in system message. Include ALL required fields: status, task_type, assumptions, answer_md, artifacts, next_actions, errors. No text outside the JSON object.`;

    // Handle images separately for vision model
    const imageFiles = processedFiles.filter((f) => f.imageData);

    if (imageFiles.length > 0) {
      // Use vision model for image analysis
      const content: any[] = [{ type: "text", text: userContent }];

      // Add images to content
      imageFiles.forEach((img) => {
        content.push({
          type: "image_url",
          image_url: { url: img.imageData },
        });
      });

      messages.push({ role: "user", content });
    } else {
      // Text-only message
      messages.push({ role: "user", content: userContent });
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
        max_tokens: 16384,
        response_format: { type: "json_object" },
      }),
      TIMEOUT_MS
    );

    const raw = response.choices[0]?.message?.content ?? "";
    if (!raw) throw new Error("Empty response from AI model");

    console.log("🔍 Raw AI response:", raw);

    // Save to memory if sessionId provided
    if (sessionId) {
      addToMemory(sessionId, "user", prompt);
      addToMemory(sessionId, "assistant", raw);
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
          citations: [],
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
                { role: "system", content: WRAPPER_B_SYSTEM },
                { role: "user", content: userContent },
                { role: "assistant", content: raw },
                { role: "user", content: retryMessage },
              ] as any,
              temperature: 0.1,
              max_tokens: 16384,
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
                citations: [],
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
            answer_md:
              "The AI response did not match the expected format. Original response: " +
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
              ...result.error.issues.map(
                (e: ZodIssue) => `${e.path.join(".")}: ${e.message}`
              ),
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
        answer_md:
          raw.trim() ||
          "The AI model provided a response but it could not be processed properly.",
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
      data.processed_files = allFiles.map((f) => ({
        filename: f.filename,
        type: f.mimetype,
        size: f.size,
        extracted_data_available: !!f.extractedData,
      }));
    }

    res.json(data);
  } catch (err: any) {
    const files = (req.files as Express.Multer.File[]) || [];
    console.error("❌ Wrapper B error details:", {
      message: err.message,
      stack: err.stack,
      type: err.constructor.name,
      promptLength: prompt?.length,
      filesUploaded: files.length,
      sessionId: sessionId,
    });

    consecutiveFailures++;
    if (consecutiveFailures >= MAX_FAILURES) {
      circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
      console.warn(
        `🔴 Circuit breaker ON for ${
          CIRCUIT_BREAKER_TIMEOUT / 1000
        }s after ${consecutiveFailures} failures`
      );
    }

    let errorMessage =
      "An error occurred while processing your request. Please try again.";
    let httpStatus = 500;
    const msg = String((err as any)?.message || "");

    if (msg.includes("abort") || msg.includes("timeout")) {
      errorMessage =
        "The AI model is taking longer than expected. Please try a simpler question or try again later.";
      httpStatus = 408;
    } else if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      errorMessage =
        "AI service is currently unavailable. Please check OpenAI service.";
      httpStatus = 503;
    }

    res.status(httpStatus).json({
      status: "error",
      task_type: "doc_qa",
      assumptions: [],
      answer_md: errorMessage,
      artifacts: {
        code: [],
        tables: [],
        reports: [],
        anchors: [],
        citations: [],
      },
      next_actions: [],
      errors: [msg || "Unknown AI service error"],
    });
  }
});

// ---------- Wrapper C (General Assistant) Route ----------
router.post("/wrapperC", upload.array("files"), async (req, res) => {
  try {
    const { prompt, projectId, sessionId, stream } = req.body;
    const files = (req.files as Express.Multer.File[]) || [];

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
    if (stream === "true") {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Headers", "Cache-Control");

      const handleWrapperCStreamingRequest = async () => {
        try {
          // Process files if any
          let fileContext = "";
          if (files.length > 0) {
            const processedFiles = await Promise.all(
              files.map(async (file) => {
                try {
                  if (file.mimetype.startsWith("image/")) {
                    const imageAnalysis = await imageProcessor.processImage(
                      file.buffer,
                      file.originalname
                    );
                    return {
                      filename: file.originalname,
                      type: "image",
                      content: imageAnalysis,
                      mimetype: file.mimetype,
                      size: file.size,
                    };
                  } else {
                    const docAnalysis = await documentProcessor.processDocument(
                      file.buffer,
                      file.originalname
                    );
                    return {
                      filename: file.originalname,
                      type: "document",
                      content: docAnalysis,
                      mimetype: file.mimetype,
                      size: file.size,
                    };
                  }
                } catch (error) {
                  console.error(
                    `Error processing file ${file.originalname}:`,
                    error
                  );
                  return {
                    filename: file.originalname,
                    type: "error",
                    content: `Error processing file: ${error}`,
                    mimetype: file.mimetype,
                    size: file.size,
                  };
                }
              })
            );

            fileContext = processedFiles
              .map(
                (f) => `File: ${f.filename} (${f.type})\nContent: ${f.content}`
              )
              .join("\n\n");
          }

          // Build conversation history
          const session = sessionId ? getOrCreateSession(sessionId) : null;
          const conversationHistory = session
            ? [
                { role: "system", content: WRAPPER_C_SYSTEM },
                ...convertMessagesToOpenAIFormat(session.messages),
                { role: "user", content: `${prompt}\n\n${fileContext}` },
              ]
            : [
                { role: "system", content: WRAPPER_C_SYSTEM },
                { role: "user", content: `${prompt}\n\n${fileContext}` },
              ];

          // Send to OpenAI with streaming
          const stream = await openai.chat.completions.create({
            model: MODEL_NAME,
            messages: conversationHistory as any,
            temperature: 0.7,
            max_tokens: 4000,
            stream: true,
          });

          let fullContent = "";
          let responseChunks: string[] = [];

          for await (const chunk of stream) {
            const content = chunk.choices[0]?.delta?.content || "";
            if (content) {
              fullContent += content;
              responseChunks.push(content);

              // Send character by character for smooth streaming
              for (const char of content) {
                res.write(
                  `data: ${JSON.stringify({
                    type: "chunk",
                    content: char,
                  })}\n\n`
                );
                await new Promise((resolve) => setTimeout(resolve, 25)); // 25ms delay per character
              }
            }
          }

          // Try to parse the response as JSON
          let parsedResponse;
          try {
            parsedResponse = JSON.parse(fullContent);
          } catch (parseError) {
            // If parsing fails, create a fallback response
            parsedResponse = {
              status: "ok",
              task_type: "qna",
              assumptions: [],
              answer_md: fullContent,
              artifacts: { code: [], tables: [], citations: [] },
              next_actions: [],
              errors: [],
            };
          }

          // Add to session memory
          if (sessionId) {
            addToMemory(sessionId, "user", prompt);
            addToMemory(sessionId, "assistant", parsedResponse.answer_md);
          }

          // Send completion event
          res.write(
            `data: ${JSON.stringify({
              type: "complete",
              answer: parsedResponse.answer_md,
              fullResponse: parsedResponse,
            })}\n\n`
          );
          res.write(`data: ${JSON.stringify({ type: "end" })}\n\n`);
          res.end();
        } catch (error) {
          console.error("Wrapper C streaming error:", error);
          res.write(
            `data: ${JSON.stringify({
              type: "error",
              error: error instanceof Error ? error.message : "Unknown error",
            })}\n\n`
          );
          res.end();
        }
      };

      handleWrapperCStreamingRequest();
    } else {
      // Non-streaming request
      let fileContext = "";
      if (files.length > 0) {
        const processedFiles = await Promise.all(
          files.map(async (file) => {
            try {
              if (file.mimetype.startsWith("image/")) {
                const imageAnalysis = await imageProcessor.processImage(
                  file.buffer,
                  file.originalname
                );
                return {
                  filename: file.originalname,
                  type: "image",
                  content: imageAnalysis,
                  mimetype: file.mimetype,
                  size: file.size,
                };
              } else {
                const docAnalysis = await documentProcessor.processDocument(
                  file.buffer,
                  file.originalname
                );
                return {
                  filename: file.originalname,
                  type: "document",
                  content: docAnalysis,
                  mimetype: file.mimetype,
                  size: file.size,
                };
              }
            } catch (error) {
              console.error(
                `Error processing file ${file.originalname}:`,
                error
              );
              return {
                filename: file.originalname,
                type: "error",
                content: `Error processing file: ${error}`,
                mimetype: file.mimetype,
                size: file.size,
              };
            }
          })
        );

        fileContext = processedFiles
          .map((f) => `File: ${f.filename} (${f.type})\nContent: ${f.content}`)
          .join("\n\n");
      }

      // Build conversation history
      const session = sessionId ? getOrCreateSession(sessionId) : null;
      const messages = session
        ? [
            { role: "system", content: WRAPPER_C_SYSTEM },
            ...convertMessagesToOpenAIFormat(session.messages),
            { role: "user", content: `${prompt}\n\n${fileContext}` },
          ]
        : [
            { role: "system", content: WRAPPER_C_SYSTEM },
            { role: "user", content: `${prompt}\n\n${fileContext}` },
          ];

      const completion = await openai.chat.completions.create({
        model: MODEL_NAME,
        messages: messages as any,
        temperature: 0.7,
        max_tokens: 4000,
      });

      const response = completion.choices[0]?.message?.content || "";

      // Try to parse the response as JSON
      let parsedResponse;
      try {
        parsedResponse = JSON.parse(response);
      } catch (parseError) {
        // If parsing fails, create a fallback response
        parsedResponse = {
          status: "ok",
          task_type: "qna",
          assumptions: [],
          answer_md: response,
          artifacts: { code: [], tables: [], citations: [] },
          next_actions: [],
          errors: [],
        };
      }

      // Add to session memory
      if (sessionId) {
        addToMemory(sessionId, "user", prompt);
        addToMemory(sessionId, "assistant", parsedResponse.answer_md);
      }

      res.json(parsedResponse);
    }
  } catch (err) {
    console.error("Wrapper C error:", err);
    let errorMessage =
      "An error occurred while processing your request. Please try again.";
    let httpStatus = 500;
    const msg = String((err as any)?.message || "");

    if (msg.includes("abort") || msg.includes("timeout")) {
      errorMessage =
        "The AI model is taking longer than expected. Please try a simpler question or try again later.";
      httpStatus = 408;
    } else if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      errorMessage =
        "AI service is currently unavailable. Please check OpenAI service.";
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
    res.json({
      status: "ok",
      message: `Memory cleared for session: ${sessionId}`,
    });
  } else {
    // Clear all memory
    Object.keys(sessionMemory).forEach((key) => delete sessionMemory[key]);
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
        uploadedFiles: session.uploadedFiles.map((f) => ({
          filename: f.filename,
          type: f.mimetype,
          size: f.size,
        })),
        createdAt: session.createdAt,
        lastAccessed: session.lastAccessed,
      },
    });
  } else {
    res.json({
      status: "ok",
      session: null,
    });
  }
});

// Get all active sessions
router.get("/sessions", (req, res) => {
  const sessions = Object.keys(sessionMemory).map((sessionId) => ({
    sessionId,
    messageCount: sessionMemory[sessionId].messages.length,
    fileCount: sessionMemory[sessionId].uploadedFiles.length,
    createdAt: sessionMemory[sessionId].createdAt,
    lastAccessed: sessionMemory[sessionId].lastAccessed,
  }));

  res.json({
    status: "ok",
    sessions,
    totalSessions: sessions.length,
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
    artifacts: {
      code: [],
      tables: [],
      reports: [],
      anchors: [],
      citations: [],
    },
    next_actions: [],
    errors: [String(err?.message || err)],
  });
});

// ---------- Reset circuit breaker endpoint for testing ----------
router.post("/resetCircuitBreaker", async (req, res) => {
  consecutiveFailures = 0;
  circuitBreakerUntil = 0;
  console.log("🔄 Circuit breaker manually reset");
  res.json({
    status: "ok",
    message: "Circuit breaker reset successfully",
  });
});

// ---------- Clear session endpoint ----------
router.post("/clearSession", async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        status: "error",
        message: "Session ID is required",
      });
    }

    // Clear session memory
    if (sessionMemory[sessionId]) {
      delete sessionMemory[sessionId];
      console.log(`🧹 Cleared session memory for: ${sessionId}`);
    }

    res.json({
      status: "ok",
      message: `Session ${sessionId} cleared successfully`,
    });
  } catch (error) {
    console.error("Error clearing session:", error);
    res.status(500).json({
      status: "error",
      message: "Failed to clear session",
    });
  }
});

export default router;
