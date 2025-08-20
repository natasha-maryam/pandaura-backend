"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const auth_new_1 = __importDefault(require("./routes/auth-new"));
const orgs_new_1 = __importDefault(require("./routes/orgs.new"));
const projects_new_1 = __importDefault(require("./routes/projects-new"));
const tags_new_1 = __importDefault(require("./routes/tags-new"));
const project_versions_new_1 = __importDefault(require("./routes/project_versions_new"));
// import tagImportRoutes from './routes/tagImport';
const http_1 = __importDefault(require("http"));
const database_manager_1 = require("./db/database-manager");
// import { TagSyncService } from './services/tagSyncService';  // Disabled temporarily
const ws_1 = require("ws");
const app = (0, express_1.default)();
const port = process.env.PORT || 5000;
const server = http_1.default.createServer(app);
// Security middleware
app.use((0, helmet_1.default)());
// Configure CORS to handle multiple origins
const allowedOrigins = [
    process.env.FRONTEND_URL || "http://localhost:5173",
    process.env.CORS_ORIGIN,
    // Parse additional CORS origins from environment
    ...(process.env.ADDITIONAL_CORS_ORIGINS?.split(",") || []),
    // Default development origins
    "http://localhost:5173",
    "http://localhost:5174",
    "http://localhost:3000",
    // Common production domains
    "https://pandaura.vercel.app",
    "https://pandaura-frontend.vercel.app",
]
    .filter((origin) => Boolean(origin))
    .map((origin) => origin.trim()); // Remove any undefined values and trim whitespace
app.use((0, cors_1.default)({
    origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, etc.)
        if (!origin)
            return callback(null, true);
        // Check if origin is in allowed list
        if (allowedOrigins.some((allowedOrigin) => origin === allowedOrigin ||
            origin.endsWith(".vercel.app") ||
            origin.startsWith("http://localhost") ||
            origin.startsWith("http://127.0.0.1"))) {
            return callback(null, true);
        }
        console.log("CORS blocked origin:", origin);
        console.log("Allowed origins:", allowedOrigins);
        callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
}));
// Body parsing middleware
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
// Cookie parsing middleware
app.use((0, cookie_parser_1.default)());
// Add request logging
app.use((req, res, next) => {
    console.log(`Incoming request: ${req.method} ${req.path} - Full URL: ${req.url}`);
    next();
});
// Trust proxy for accurate IP addresses in audit logs
app.set("trust proxy", true);
// Initialize database tables - No longer needed with Knex migrations
// initializeTables().catch(console.error);
// Routes
app.use("/api/v1/auth", auth_new_1.default);
app.use("/api/v1/orgs", orgs_new_1.default);
app.use("/api/v1/projects", projects_new_1.default);
app.use("/api/v1/tags", tags_new_1.default);
// Tag import routes
// app.use('/api/v1/tags', tagImportRoutes);
// Register version control routes under projects
app.use("/api/v1/projects", project_versions_new_1.default);
// Log registered routes for debugging
app.once("mount", () => {
    console.log("\nRegistered Routes:");
    console.log("=================");
    console.log("GET     /api/v1/auth/*");
    console.log("GET     /api/v1/orgs/*");
    console.log("GET     /api/v1/test/*");
    console.log("GET     /api/v1/projects/*");
    console.log("GET     /api/v1/tags/*");
    console.log("GET     /api/v1/versions/projects/:projectId/versions");
    console.log("GET     /api/v1/versions/projects/:projectId/version/:versionNumber");
    console.log("POST    /api/v1/versions/projects/:projectId/version");
    console.log("POST    /api/v1/versions/projects/:projectId/version/:versionNumber/rollback");
    console.log("POST    /api/v1/versions/projects/:projectId/auto-save");
    console.log("GET     /api/v1/versions/projects/:projectId/auto-save");
    console.log("GET     /api/v1/versions/projects/:projectId/audit");
    console.log("POST    /api/v1/versions/projects/:projectId/cleanup");
    console.log("=================\n");
});
// Add a simple test route
app.get("/api/v1/simple-test", (req, res) => {
    console.log("Simple test route hit!");
    res.json({ message: "Simple test route works!" });
});
// Health check endpoint with database status
app.get("/api/v1/health", async (req, res) => {
    try {
        const health = await database_manager_1.DatabaseManager.healthCheck();
        const statusCode = health.status === "healthy" ? 200 : 503;
        res.status(statusCode).json({
            service: "Pandaura Backend",
            ...health,
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            environment: process.env.NODE_ENV || "development",
        });
    }
    catch (error) {
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
        const info = await database_manager_1.DatabaseManager.getConnectionInfo();
        const migrations = await database_manager_1.DatabaseManager.checkMigrations();
        res.json({
            database: info,
            migrations: migrations,
            environment: process.env.NODE_ENV || "development",
        });
    }
    catch (error) {
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
app.use((err, req, res, next) => {
    console.error("Error:", err);
    res.status(500).json({ error: "Internal server error" });
});
// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: "Endpoint not found" });
});
const allowedWsOrigins = allowedOrigins;
// console.log('🌐 Allowed WebSocket origins:', allowedWsOrigins);
const wss = new ws_1.WebSocketServer({
    server,
    path: "/ws/tags", // Only handle /ws/tags path
    verifyClient: (info, done) => {
        console.log("🔍 WebSocket connection attempt:");
        console.log("  - URL:", info.req.url);
        console.log("  - Origin:", info.origin || "none");
        console.log("  - Host:", info.req.headers.host);
        const origin = info.origin;
        // Allow connections without origin (for testing) or from allowed origins
        if (!origin) {
            console.log("✅ No origin header - allowing connection");
            done(true);
            return;
        }
        const isAllowed = allowedWsOrigins.some((allowedOrigin) => origin === allowedOrigin ||
            origin.endsWith(".vercel.app") ||
            origin.startsWith("http://localhost") ||
            origin.startsWith("http://127.0.0.1"));
        if (isAllowed) {
            console.log("✅ Origin allowed:", origin);
            done(true);
        }
        else {
            console.log("❌ WS blocked origin:", origin);
            console.log("✅ Allowed WS origins:", allowedWsOrigins);
            done(false, 403, "Forbidden");
        }
    },
});
// Pass WebSocket server to your TagSyncService
// new TagSyncService(wss);  // Disabled temporarily
// Startup function with database checks
async function startServer() {
    try {
        console.log("🚀 Starting Pandaura Backend...");
        // Test database connection
        const isDbHealthy = await database_manager_1.DatabaseManager.testConnection();
        if (!isDbHealthy) {
            console.warn("⚠️ Database connection failed. Continuing startup without DB.");
        }
        // Start the server
        server.listen(port, () => {
            console.log(`✅ Server is running on http://localhost:${port}`);
            console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
            console.log(`🖥️  Frontend URL: ${process.env.FRONTEND_URL || "http://localhost:5173"}`);
            console.log(`📊 Health check: http://localhost:${port}/api/v1/health`);
            console.log("🎉 Pandaura Backend is ready to serve requests!");
        });
    }
    catch (error) {
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
