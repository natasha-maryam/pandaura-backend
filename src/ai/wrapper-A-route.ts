// import { Router } from "express";
// import { z, ZodIssue } from "zod";
// import { Ollama } from "ollama";
// import { WRAPPER_A_SYSTEM } from "./wrapper-A-system";
// import os from "os";

// const router = Router();

// // ---------- Helpers ----------
// function removeDuplicateJsonKeys(jsonString: string): string {
//   try {
//     const parsed = JSON.parse(jsonString);
//     return JSON.stringify(parsed);
//   } catch {
//     const lines = jsonString.split("\n");
//     const seenKeys = new Set<string>();
//     const cleanedLines: string[] = [];
//     for (let i = lines.length - 1; i >= 0; i--) {
//       const line = lines[i];
//       const keyMatch = line.match(/^\s*"([^"]+)"\s*:/);
//       if (keyMatch) {
//         const key = keyMatch[1];
//         if (!seenKeys.has(key)) {
//           seenKeys.add(key);
//           cleanedLines.unshift(line);
//         }
//       } else {
//         cleanedLines.unshift(line);
//       }
//     }
//     return cleanedLines.join("\n");
//   }
// }

// // ---------- Ollama client ----------
// const ollama = new Ollama({
//   host: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434",
// });

// // ---------- Circuit breaker ----------
// let consecutiveFailures = 0;
// const MAX_FAILURES = 3;
// const CIRCUIT_BREAKER_TIMEOUT = 60_000; // 1 minute
// let circuitBreakerUntil = 0;

// // ---------- Model / options ----------
// const DEFAULT_MODEL = "llama3.2:3b";
// const MODEL_NAME = process.env.MODEL_NAME || DEFAULT_MODEL;
// const CPU_THREADS = Math.min(8, Math.max(4, Math.floor(os.cpus().length / 2))); // Increased for Mistral

// const MODEL_CONFIG = {
//   model: MODEL_NAME,
//   options: {
//     temperature: 0.1, // Very low temp for deterministic automation code
//     top_k: 40, // Increased for better technical vocabulary
//     top_p: 0.9, // Slightly increased for technical responses
//     num_ctx: 16384, // Increased context for complex automation tasks
//     num_predict: 4096, // Allow longer technical responses with code
//     repeat_penalty: 1.15, // Slightly increased for better code generation
//     num_thread: CPU_THREADS,
//     // Mistral-specific settings optimized for automation tasks
//     stop: ["}"], // Help ensure clean JSON responses
//     mirostat: 2,
//     mirostat_eta: 0.1,
//     mirostat_tau: 5.0,
//   },
// };

// // ---------- Schemas ----------
// const CodeArtifactSchema = z.object({
//   language: z.literal("ST"),
//   vendor: z.enum(["Rockwell", "Siemens", "Beckhoff", "Generic"]),
//   compilable: z.boolean(),
//   filename: z.string(),
//   content: z.string(),
// });

// const TableArtifactSchema = z.object({
//   title: z.string(),
//   schema: z.array(z.string()),
//   rows: z.array(z.array(z.string())),
// });

// const ArtifactsSchema = z.object({
//   code: z.array(CodeArtifactSchema),
//   tables: z.array(TableArtifactSchema),
//   citations: z.array(z.string()),
//   diff: z.string().optional(),
// });

// const ResponseSchema = z.object({
//   status: z.enum(["ok", "needs_input", "error"]),
//   task_type: z.enum(["qna", "code_gen", "code_edit", "debug", "optimize", "calc", "checklist", "report"]),
//   assumptions: z.array(z.string()),
//   answer_md: z.string(),
//   artifacts: ArtifactsSchema.optional(),
//   next_actions: z.array(z.string()),
//   errors: z.array(z.string()),
// });

// const ReqSchema = z.object({
//   prompt: z.string().min(1),
//   projectId: z.string().optional(),
//   vendor_selection: z.enum(["Rockwell", "Siemens", "Beckhoff", "Generic"]).optional(),
// });

// // ---------- Health (list) ----------
// router.get("/health", async (_req, res) => {
//   try {
//     const response = await ollama.list();
//     const hasModel = response.models.some(
//       (m) =>
//         m.name === MODEL_NAME || m.name.startsWith(MODEL_NAME.split(":")[0])
//     );
//     res.json({
//       status: "ok",
//       ollama_connected: true,
//       model_available: hasModel,
//       model_name: MODEL_NAME,
//       consecutive_failures: consecutiveFailures,
//       circuit_breaker_active: Date.now() < circuitBreakerUntil,
//     });
//   } catch (error: any) {
//     res.status(503).json({
//       status: "error",
//       ollama_connected: false,
//       error: error.message,
//       consecutive_failures: consecutiveFailures,
//       circuit_breaker_active: Date.now() < circuitBreakerUntil,
//     });
//   }
// });

// // ---------- Health (chat ping) ----------
// router.get("/health/ping", async (_req, res) => {
//   try {
//     const start = Date.now();
//     const response = await ollama.chat({
//       model: MODEL_NAME,
//       messages: [{ role: "user", content: "ping" }],
//       options: { ...MODEL_CONFIG.options, num_ctx: 256, num_predict: 3 },
//       keep_alive: "5m", // keep loaded for 5 minutes
//     });
//     const duration = Date.now() - start;
//     res.json({
//       status: "ok",
//       model: MODEL_NAME,
//       response_time_ms: duration,
//       reply: response.message?.content ?? "pong",
//       model_loaded: true,
//       timestamp: new Date().toISOString(),
//     });
//   } catch (error: any) {
//     res.status(500).json({
//       status: "error",
//       message: "Health ping failed",
//       error: error.message,
//       timestamp: new Date().toISOString(),
//     });
//   }
// });

// // ---------- Warmup ----------
// router.post("/warmup", async (_req, res) => {
//   try {
//     const response = await ollama.chat({
//       model: MODEL_NAME,
//       messages: [{ role: "user", content: "Ready" }],
//       options: { ...MODEL_CONFIG.options, num_ctx: 512, num_predict: 5 },
//       keep_alive: "10m", // keep loaded for 10 minutes
//     });
//     res.json({
//       status: "ok",
//       message: "Model warmed up successfully",
//       model: MODEL_NAME,
//       response: response.message?.content || "Ready",
//     });
//   } catch (error: any) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // ---------- Simple test ----------
// router.post("/test", async (_req, res) => {
//   try {
//     const response = await ollama.chat({
//       model: MODEL_NAME,
//       messages: [{ role: "user", content: 'Say "Hello"' }],
//       options: {
//         temperature: 0.0,
//         num_ctx: 512,
//         num_predict: 10,
//         num_thread: CPU_THREADS,
//       },
//       keep_alive: "5m",
//     });
//     res.json({
//       status: "ok",
//       message: response.message?.content || "No response",
//       model: MODEL_NAME,
//     });
//   } catch (error: any) {
//     res.status(500).json({ error: error.message });
//   }
// });

// // ---------- Test format ----------
// router.post("/test-format", async (req, res) => {
//   const { prompt } = req.body;
//   res.json({
//     status: "ok",
//     task_type: "qna",
//     assumptions: [],
//     answer_md: `You asked: "${prompt}". This is a test response to verify the JSON format is working correctly.`,
//     artifacts: { code: [], tables: [], citations: [] },
//     next_actions: [],
//     errors: [],
//   });
// });

// // ---------- Main wrapper ----------
// router.post("/wrapperA", async (req, res) => {
//   const parsed = ReqSchema.safeParse(req.body);
//   if (!parsed.success) {
//     return res.status(400).json({ error: parsed.error.flatten() });
//   }
//   const { prompt, projectId, vendor_selection } = parsed.data;

//   // Circuit breaker
//   if (Date.now() < circuitBreakerUntil) {
//     return res.status(503).json({
//       status: "error",
//       task_type: "qna",
//       assumptions: [],
//       answer_md:
//         "AI service is temporarily unavailable due to repeated failures. Please try again in a moment.",
//       artifacts: { code: [], tables: [], citations: [] },
//       next_actions: [],
//       errors: ["Circuit breaker active - service temporarily unavailable"],
//     });
//   }

//   // Validate prompt length
//   if (prompt.length > 2000) {
//     return res.status(400).json({
//       status: "error",
//       task_type: "qna",
//       assumptions: [],
//       answer_md: "Prompt is too long. Please keep it under 2000 characters.",
//       artifacts: { code: [], tables: [], citations: [] },
//       next_actions: [],
//       errors: ["Prompt exceeds maximum length"],
//     });
//   }

//   try {
//     const startTime = Date.now();

//     const TIMEOUT_MS = 120_000; // Increased to 2 minutes for complex requests

//     function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
//       return new Promise((resolve, reject) => {
//         const t = setTimeout(() => reject(new Error("AI request timeout")), ms);
//         p.then((v) => {
//           clearTimeout(t);
//           resolve(v);
//         }).catch((e) => {
//           clearTimeout(t);
//           reject(e);
//         });
//       });
//     }

//     const response = await withTimeout(
//       ollama.chat({
//         ...MODEL_CONFIG,
//         messages: [
//           { role: "system", content: WRAPPER_A_SYSTEM },
//           {
//             role: "user",
//             content: `PROJECT_ID=${projectId ?? ""}\nVENDOR=${vendor_selection ?? "Generic"}\nUSER_PROMPT:\n${prompt}`,
//           },
//         ],
//         format: "json",
//         keep_alive: "10m", // keep loaded for 10 minutes
//         stream: false as const, // 👈 force non-stream overload
//       }),
//       TIMEOUT_MS
//     );

//     const raw = response.message?.content ?? "";
//     if (!raw) throw new Error("Empty response from AI model");

//     console.log("🔍 Raw AI response:", raw); // Debug logging

//     let data: any;
//     try {
//       // Clean the response and extract JSON
//       let cleanedRaw = raw.trim();
      
//       // Remove any markdown code blocks
//       cleanedRaw = cleanedRaw.replace(/```json\s*|\s*```/g, "");
//       cleanedRaw = cleanedRaw.replace(/```\s*|\s*```/g, "");
      
//       // Try to find and extract valid JSON structure
//       let jsonString = "";
      
//       // First, try to find a complete JSON object
//       let jsonMatch = cleanedRaw.match(/\{[\s\S]*\}/);
      
//       if (jsonMatch) {
//         jsonString = jsonMatch[0];
//       } else {
//         // If no complete match, try to extract and reconstruct JSON
//         const openBrace = cleanedRaw.indexOf('{');
//         if (openBrace !== -1) {
//           let braceCount = 0;
//           let endPos = -1;
//           for (let i = openBrace; i < cleanedRaw.length; i++) {
//             if (cleanedRaw[i] === '{') braceCount++;
//             if (cleanedRaw[i] === '}') braceCount--;
//             if (braceCount === 0) {
//               endPos = i;
//               break;
//             }
//           }
//           if (endPos !== -1) {
//             jsonString = cleanedRaw.substring(openBrace, endPos + 1);
//           }
//         }
//       }
      
//       if (!jsonString) throw new Error("No JSON structure found in response");
      
//       // Try to fix common JSON issues
//       try {
//         // Test if it's valid JSON first
//         JSON.parse(jsonString);
//       } catch {
//         // If parsing fails, try to fix common issues
//         console.log("🔧 Attempting to fix malformed JSON...");
        
//         // Remove incomplete trailing objects/arrays
//         jsonString = jsonString.replace(/,\s*\{[^}]*$/g, '');
//         jsonString = jsonString.replace(/,\s*\[[^\]]*$/g, '');
        
//         // Ensure proper closing of incomplete strings
//         jsonString = jsonString.replace(/:\s*"[^"]*$/g, ': ""');
        
//         // Remove duplicate consecutive commas
//         jsonString = jsonString.replace(/,\s*,+/g, ',');
        
//         // Remove trailing commas before closing braces/brackets
//         jsonString = jsonString.replace(/,(\s*[}\]])/g, '$1');
        
//         // Try to close incomplete objects
//         if (!jsonString.endsWith('}') && jsonString.includes('{')) {
//           const openBraces = (jsonString.match(/\{/g) || []).length;
//           const closeBraces = (jsonString.match(/\}/g) || []).length;
//           const missingBraces = openBraces - closeBraces;
//           if (missingBraces > 0) {
//             jsonString += '}'.repeat(missingBraces);
//           }
//         }
//       }

//       // Clean up duplicate keys
//       jsonString = removeDuplicateJsonKeys(jsonString);
//       const parsedJson = JSON.parse(jsonString);
      
//       // Ensure artifacts field exists with default value if missing
//       if (!parsedJson.artifacts) {
//         parsedJson.artifacts = {
//           code: [],
//           tables: [],
//           citations: []
//         };
//       }
      
//       // Validate against our schema
//       const result = ResponseSchema.safeParse(parsedJson);
      
//       if (result.success) {
//         data = result.data;
//         console.log("✅ Successfully validated response against schema");
//       } else {
//         console.log("⚠️ Schema validation failed:", result.error);
//         // Create a safe response that matches our schema
//         data = {
//           status: "error",
//           task_type: "qna",
//           assumptions: [],
//           answer_md: "The AI response did not match the expected format. Original response: " + 
//                     (parsedJson.answer_md || raw.trim() || "No readable response"),
//           artifacts: {
//             code: [],
//             tables: [],
//             citations: [],
//           },
//           next_actions: [],
//           errors: [
//             "Response validation failed",
//             ...result.error.issues.map((e: ZodIssue) => `${e.path.join('.')}: ${e.message}`)
//           ],
//         };
//       }
//     } catch (parseError) {
//       console.log("❌ JSON parsing failed:", parseError);
      
//       data = {
//         status: "error",
//         task_type: "qna",
//         assumptions: [],
//         answer_md: raw.trim() || "The AI model provided a response but it could not be processed properly.",
//         artifacts: {
//           code: [],
//           tables: [],
//           citations: [],
//         },
//         next_actions: [],
//         errors: ["Failed to parse AI response as JSON"],
//       };
//     }

//     consecutiveFailures = 0;
//     const processingTime = Date.now() - startTime;
//     console.log(`✅ AI response in ${processingTime}ms`);
//     res.json(data);
//   } catch (err: any) {
//     consecutiveFailures++;
//     if (consecutiveFailures >= MAX_FAILURES) {
//       circuitBreakerUntil = Date.now() + CIRCUIT_BREAKER_TIMEOUT;
//       console.warn(
//         `🔴 Circuit breaker ON for ${
//           CIRCUIT_BREAKER_TIMEOUT / 1000
//         }s after ${consecutiveFailures} failures`
//       );
//     }

//     let errorMessage =
//       "An error occurred while processing your request. Please try again.";
//     let httpStatus = 500;
//     const msg = String(err?.message || "");

//     if (msg.includes("abort") || msg.includes("timeout")) {
//       errorMessage =
//         "The AI model is taking longer than expected. Please try a simpler question or try again later.";
//       httpStatus = 408;
//     } else if (
//       msg.includes("ECONNREFUSED") ||
//       msg.includes("fetch failed") ||
//       msg.includes("connect")
//     ) {
//       errorMessage =
//         "AI service is currently unavailable. Please check if Ollama is running.";
//       httpStatus = 503;
//     }

//     res.status(httpStatus).json({
//       status: "error",
//       task_type: "qna",
//       assumptions: [],
//       answer_md: errorMessage,
//       artifacts: { code: [], tables: [], citations: [] },
//       next_actions: [],
//       errors: [msg || "Unknown AI service error"],
//     });
//   }
// });

// // ---------- Fallback error handler ----------
// router.use((err: any, _req: any, res: any, _next: any) => {
//   console.error("Unhandled route error:", err);
//   if (res.headersSent) return;
//   res.status(500).json({
//     status: "error",
//     task_type: "qna",
//     assumptions: [],
//     answer_md: "Server error while processing the request.",
//     artifacts: { code: [], tables: [], citations: [] },
//     next_actions: [],
//     errors: [String(err?.message || err)],
//   });
// });

// export default router;
