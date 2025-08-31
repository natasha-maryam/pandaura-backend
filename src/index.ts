import express from "express";
import cors, { CorsOptions } from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import authRoutes from "./routes/auth-new";
import openaiRoutes from './ai/openai-wrapper';
import wrapperBRoutes from './ai/wrapper-B-route';
import orgRoutes from "./routes/orgs.new";
import projectsRoutes from "./routes/projects-new";
import tagsRoutes from "./routes/tags-new";
import projectVersionsRoutes from "./routes/project_versions_new";
import tagImportRoutes from './routes/tagImport';
import logicStudioRoutes from './routes/logic-studio';
import http from "http";
import { DatabaseManager } from "./db/database-manager";
// Import and initialize TagSyncService
import { TagSyncService } from './services/tagSyncService';
import { setTagSyncService } from './services/tagSyncSingleton';
import { WebSocketServer } from "ws";
require('dotenv').config()

const app = express();
const port = process.env.PORT || 5000;
const server = http.createServer(app);

const allowedOrigins = ["http://localhost:5173", "https://pandaura.vercel.app"];

const corsOptions: CorsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    // ✅ Always allow OPTIONS preflight without origin check
    // Browser may send OPTIONS with no Origin sometimes
    if (!origin) return callback(null, true);

    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith(".vercel.app")
    ) {
      return callback(null, true);
    }

    console.log("❌ CORS blocked:", origin);
    return callback(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type", 
    "Authorization", 
    "Accept", 
    "Cache-Control",
    "X-Requested-With",
    "sec-ch-ua",
    "sec-ch-ua-mobile", 
    "sec-ch-ua-platform",
    "User-Agent",
    "Referer"
  ],
  exposedHeaders: ["Content-Disposition"], // ✅ Expose Content-Disposition header for file downloads
};

// ✅ Preflight handler first (before routes/middleware)
app.use((req, res, next) => {
  if (req.method === "OPTIONS") {
    res.header("Access-Control-Allow-Origin", req.headers.origin || "");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, Accept, Cache-Control, X-Requested-With, sec-ch-ua, sec-ch-ua-mobile, sec-ch-ua-platform, User-Agent, Referer");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Expose-Headers", "Content-Disposition"); // ✅ Expose Content-Disposition
    return res.sendStatus(204);
  }
  next();
});

// Apply cors for normal requests
app.use(cors(corsOptions));


// Security middleware
app.use(helmet());
// Body parsing middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Cookie parsing middleware
app.use(cookieParser());

// Add request logging
app.use((req, res, next) => {
  console.log(
    `Incoming request: ${req.method} ${req.path} - Full URL: ${req.url}`
  );
  next();
});

// Trust proxy for accurate IP addresses in audit logs
app.set("trust proxy", true);

// Initialize database tables - No longer needed with Knex migrations
// initializeTables().catch(console.error);

// Routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/orgs", orgRoutes);
app.use("/api/v1/projects", projectsRoutes);
app.use("/api/v1/tags", tagsRoutes);
// Tag import routes
app.use('/api/v1/tags', tagImportRoutes);
// Register version control routes under projects
app.use("/api/v1/projects", projectVersionsRoutes);
// Logic Studio routes
app.use("/api/v1/projects", logicStudioRoutes);
// AI routes (OpenAI) - Wrapper A with built-in verification & multi-perspective analysis
app.use('/api/assistant', openaiRoutes);
// AI Wrapper B routes (Document & Logic Analyst) - with built-in verification & multi-perspective analysis
app.use('/api/assistant', wrapperBRoutes);


// Add a simple test route
app.get("/api/v1/simple-test", (req, res) => {
  console.log("Simple test route hit!");
  res.json({ message: "Simple test route works!" });
});

// Serve the memory test HTML page
app.get("/test-memory", (req, res) => {
  res.sendFile(__dirname + '/../test-memory.html');
});

// Health check endpoint with database status
app.get("/api/v1/health", async (req, res) => {
  try {
    const health = await DatabaseManager.healthCheck();
    const statusCode = health.status === "healthy" ? 200 : 503;

    res.status(statusCode).json({
      service: "Pandaura Backend",
      ...health,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      environment: process.env.NODE_ENV || "development",
    });
  } catch (error) {
    res.status(503).json({
      service: "Pandaura Backend",
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
});

// Database info endpoint (protected)
app.get("/api/v1/db-info", async (req, res) => {
  try {
    const info = await DatabaseManager.getConnectionInfo();
    const migrations = await DatabaseManager.checkMigrations();

    res.json({
      database: info,
      migrations: migrations,
      environment: process.env.NODE_ENV || "development",
    });
  } catch (error) {
    res.status(500).json({
      error: "Failed to get database info",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// WebSocket test endpoint
app.get("/api/v1/ws-test", (req, res) => {
  res.json({
    message: "WebSocket server should be running",
    wsEndpoints: ["/ws/tags", "/ws/test"],
    serverTime: new Date().toISOString(),
  });
});

// const rows = db.prepare("SELECT * FROM users").all();
// console.log(rows)

// Root health check endpoint for Railway
app.get("/", (req, res) => {
  res.status(200).json({
    status: "ok",
    service: "Pandaura Backend",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

// app.get("/", (req, res) => {
//   res.send("🚀 Pandaura Backend is running!");
// });

// CORS debug endpoint
app.get("/api/v1/cors-test", (req, res) => {
  res.json({
    message: "CORS is working!",
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    headers: req.headers,
  });
});

// Error handling middleware
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

const allowedWsOrigins = allowedOrigins;
// console.log('🌐 Allowed WebSocket origins:', allowedWsOrigins);

const wss = new WebSocketServer({
  server,
  path: "/ws/tags", // Only handle /ws/tags path
  verifyClient: (info, done) => {
    // console.log("🔍 WebSocket connection attempt:");
    // console.log("  - URL:", info.req.url);
    // console.log("  - Origin:", info.origin || "none");
    // console.log("  - Host:", info.req.headers.host);

    const origin = info.origin;

    // Allow connections without origin (for testing) or from allowed origins
    if (!origin) {
      // console.log("✅ No origin header - allowing connection");
      done(true);
      return;
    }

    const isAllowed = allowedWsOrigins.some(
      (allowedOrigin) =>
        origin === allowedOrigin ||
        origin.endsWith(".vercel.app") ||
        origin.startsWith("http://localhost") ||
        origin.startsWith("http://127.0.0.1")
    );

    if (isAllowed) {
      // console.log("✅ Origin allowed:", origin);
      done(true);
    } else {
      // console.log("❌ WS blocked origin:", origin);
      // console.log("✅ Allowed WS origins:", allowedWsOrigins);
      done(false, 403, "Forbidden");
    }
  },
});



// Pass WebSocket server to your TagSyncService
const tagSyncService = new TagSyncService(wss);
setTagSyncService(tagSyncService);

// Startup function with database checks
async function startServer() {
  try {
    console.log("🚀 Starting Pandaura Backend...");

    // Test database connection
    const isDbHealthy = await DatabaseManager.testConnection();
    if (!isDbHealthy) {
      console.warn(
        "⚠️ Database connection failed. Continuing startup without DB."
      );
    }
    // Start the server
    server.listen({port, host: "0.0.0.0"}, () => {
      console.log(`✅ Server is running on http://localhost:${port}`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(
        `🖥️  Frontend URL: ${
          process.env.FRONTEND_URL || "http://localhost:5173"
        }`
      );
      console.log(`📊 Health check: http://localhost:${port}/api/v1/health`);
      console.log("🎉 Pandaura Backend is ready to serve requests!");
    });
  } catch (error) {
    console.error("❌ Failed to start server:", error);
    process.exit(1);
  }
}

// Start the server
startServer();

process.on("uncaughtException", (error) => {
  console.error("Uncaught Exception:", error);
});

process.on("unhandledRejection", (reason, promise) => {
  console.error("Unhandled Rejection at:", promise, "reason:", reason);
});
