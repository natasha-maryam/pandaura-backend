"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TagSyncService = void 0;
// Real-time WebSocket service for tag synchronization
const ws_1 = require("ws");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const tags_1 = require("../db/tables/tags");
const stParser_1 = require("../utils/stParser");
const vendorFormatters_1 = require("../utils/vendorFormatters");
class TagSyncService {
    constructor(wss) {
        this.clients = new Map(); // projectId -> Set<WebSocket>
        this.wss = wss;
        // Handle WebSocket connections with authentication
        this.wss.on('connection', (ws, request) => {
            console.log('🔌 New WebSocket connection attempt');
            // Parse URL to get token
            const url = new URL(request.url, `http://${request.headers.host}`);
            const token = url.searchParams.get('token');
            if (!token) {
                console.log('❌ No token provided, closing connection');
                ws.close(1008, 'Token required');
                return;
            }
            // Verify JWT token
            const JWT_SECRET = process.env.JWT_SECRET || '69d215b3cc191323c79a3a264f6ad2f194d02486f0001b4ae287b13542fcd2212e39ffda859f71f450edcde3944567db1a694a82155f74c749c2aa4e45fa8c17';
            try {
                const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
                console.log(`✅ JWT verified for user: ${decoded.userId}`);
                // Cast to AuthenticatedWebSocket and set user
                const authWs = ws;
                authWs.user = decoded;
                // Handle the authenticated connection
                this.handleConnection(authWs);
            }
            catch (error) {
                console.log(`❌ JWT verification failed:`, error instanceof Error ? error.message : 'Unknown error');
                ws.close(1008, 'Invalid token');
                return;
            }
        });
    }
    /**
     * Handle new WebSocket connection
     */
    handleConnection(ws) {
        console.log(`🔗 Setting up WebSocket event handlers for user: ${ws.user?.userId || 'unknown'}`);
        ws.on('message', async (data) => {
            try {
                const messageStr = data.toString();
                console.log(`📨 Received WebSocket message from ${ws.user?.userId}: ${messageStr.substring(0, 100)}...`);
                const message = JSON.parse(messageStr);
                await this.handleMessage(ws, message);
            }
            catch (error) {
                console.error('❌ Error parsing WebSocket message:', error);
                this.sendError(ws, 'Invalid message format');
            }
        });
        ws.on('close', (code, reason) => {
            console.log(`🔌 WebSocket close event - Code: ${code}, Reason: ${reason?.toString() || 'none'}, User: ${ws.user?.userId || 'unknown'}`);
            this.handleDisconnection(ws);
        });
        ws.on('error', (error) => {
            console.error(`❌ WebSocket error for user ${ws.user?.userId || 'unknown'}:`, error);
            this.handleDisconnection(ws);
        });
        ws.on('pong', () => {
            console.log(`🏓 Pong received from user: ${ws.user?.userId || 'unknown'}`);
        });
        // Don't send immediate welcome message - let the client initiate communication
        console.log(`✅ WebSocket connection ready for user: ${ws.user?.userId || 'unknown'}`);
        // Send a simple connection confirmation after a small delay
        setTimeout(() => {
            try {
                this.sendResponse(ws, {
                    type: 'pong',
                    success: true,
                    timestamp: new Date().toISOString()
                });
                console.log(`✅ Connection confirmation sent to user: ${ws.user?.userId || 'unknown'}`);
            }
            catch (error) {
                console.error(`❌ Failed to send connection confirmation:`, error);
            }
        }, 100);
    }
    /**
     * Handle WebSocket message
     */
    async handleMessage(ws, message) {
        try {
            switch (message.type) {
                case 'subscribe':
                    await this.handleSubscribe(ws, message);
                    break;
                case 'unsubscribe':
                    await this.handleUnsubscribe(ws, message);
                    break;
                case 'sync_tags':
                    await this.handleTagSyncDebounced(ws, message);
                    break;
                case 'ping':
                    this.handlePing(ws);
                    break;
                default:
                    this.sendError(ws, `Unknown message type: ${message.type}`);
            }
        }
        catch (error) {
            console.error('Error handling WebSocket message:', error);
            this.sendError(ws, `Message handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Handle ping message for connection health check
     */
    handlePing(ws) {
        this.sendResponse(ws, {
            type: 'pong',
            success: true,
            timestamp: new Date().toISOString()
        });
    }
    /**
     * Subscribe to project tag updates
     */
    async handleSubscribe(ws, message) {
        if (!message.projectId) {
            this.sendError(ws, 'Project ID required for subscription');
            return;
        }
        ws.projectId = message.projectId;
        if (!this.clients.has(message.projectId)) {
            this.clients.set(message.projectId, new Set());
        }
        this.clients.get(message.projectId).add(ws);
        // Send current tags for the project
        try {
            const tags = tags_1.TagsTable.getTags({
                project_id: parseInt(message.projectId),
                page_size: 1000
            });
            this.sendResponse(ws, {
                type: 'tags_updated',
                success: true,
                projectId: message.projectId,
                tags: tags.tags,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            console.error('Error fetching tags for subscription:', error);
            this.sendError(ws, 'Failed to fetch project tags');
        }
    }
    /**
     * Unsubscribe from project tag updates
     */
    async handleUnsubscribe(ws, _message) {
        if (ws.projectId) {
            const projectClients = this.clients.get(ws.projectId);
            if (projectClients) {
                projectClients.delete(ws);
                if (projectClients.size === 0) {
                    this.clients.delete(ws.projectId);
                }
            }
            ws.projectId = undefined;
        }
    }
    /**
     * Handle debounced tag synchronization to prevent excessive parsing
     */
    async handleTagSyncDebounced(ws, message) {
        if (!message.projectId || !message.vendor || !message.stCode) {
            this.sendError(ws, 'Missing required fields: projectId, vendor, stCode');
            return;
        }
        // Clear existing debounce timer
        if (ws.debounceTimer) {
            clearTimeout(ws.debounceTimer);
        }
        // Get debounce delay from message or use default (500ms)
        const debounceMs = message.debounceMs || 500;
        const syncId = `sync_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        // Send immediate acknowledgment that sync is queued
        this.sendResponse(ws, {
            type: 'sync_queued',
            success: true,
            projectId: message.projectId,
            timestamp: new Date().toISOString(),
            syncId
        });
        // Set new debounce timer
        ws.debounceTimer = setTimeout(async () => {
            try {
                await this.handleTagSync(ws, message, syncId);
            }
            catch (error) {
                console.error('Debounced tag sync error:', error);
                this.sendError(ws, `Tag sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
        }, debounceMs);
    }
    /**
     * Handle real-time tag synchronization from ST code
     */
    async handleTagSync(ws, message, syncId) {
        if (!message.projectId || !message.vendor || !message.stCode) {
            this.sendError(ws, 'Missing required fields: projectId, vendor, stCode');
            return;
        }
        const startTime = Date.now();
        console.log(`🔄 Starting tag sync for project ${message.projectId}, vendor: ${message.vendor}, syncId: ${syncId || 'direct'}`);
        try {
            // Parse variables from ST code
            const parsedTags = (0, stParser_1.parseSTVariablesDetailed)(message.stCode, message.vendor);
            console.log(`📝 Parsed ${parsedTags.length} tags from ST code`);
            // Format tags for the specific vendor
            const formattedTags = parsedTags.map(tag => {
                const vendorTag = {
                    name: tag.name,
                    dataType: tag.dataType,
                    address: tag.address,
                    description: tag.description,
                    scope: tag.scope || 'Local',
                    defaultValue: tag.defaultValue,
                    vendor: message.vendor
                };
                return (0, vendorFormatters_1.formatTagForVendor)(vendorTag, message.vendor.toLowerCase());
            });
            // Upsert tags in database
            console.log(`🔍 Debug: Project ID: ${message.projectId}, User ID: ${ws.user.userId}`);
            await this.upsertTagsInDB(message.projectId, formattedTags, ws.user.userId);
            console.log(`💾 Upserted ${formattedTags.length} tags to database`);
            // Fetch updated tags
            const updatedTags = tags_1.TagsTable.getTags({
                project_id: parseInt(message.projectId),
                page_size: 1000
            });
            const duration = Date.now() - startTime;
            console.log(`✅ Tag sync completed in ${duration}ms for project ${message.projectId}`);
            // Broadcast to all subscribers of this project
            this.broadcastToProject(message.projectId, {
                type: 'tags_updated',
                success: true,
                projectId: message.projectId,
                tags: updatedTags.tags,
                parsedCount: parsedTags.length,
                syncId,
                timestamp: new Date().toISOString()
            });
        }
        catch (error) {
            const duration = Date.now() - startTime;
            console.error(`❌ Tag sync failed after ${duration}ms for project ${message.projectId}:`, error);
            this.sendError(ws, `Tag synchronization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    /**
     * Upsert tags in database with transaction
     */
    async upsertTagsInDB(projectId, tags, userId) {
        console.log(`🔍 Upserting tags for project ${projectId}, user ${userId}`);
        // Check if project and user exist
        const projectIdNum = parseInt(projectId);
        console.log(`🔍 Checking if project ${projectIdNum} and user ${userId} exist in database...`);
        // Fetch all existing tags for the project once
        const existingTagsResult = tags_1.TagsTable.getTags({ project_id: projectIdNum, page_size: 1000 });
        const existingTags = existingTagsResult.tags;
        for (const tag of tags) {
            try {
                // Try to find an existing tag by name
                const tagName = tag.Name || tag.TagName || tag.name;
                const existingTag = existingTags.find((t) => t.name === tagName);
                if (existingTag) {
                    // Update existing tag
                    tags_1.TagsTable.updateTag(existingTag.id, {
                        type: tag.DataType || tag.dataType,
                        data_type: tag.DataType || tag.dataType,
                        address: tag.Address || tag.address,
                        default_value: tag.DefaultValue || tag.defaultValue,
                        vendor: (tag.Vendor || tag.vendor)?.toLowerCase(),
                        scope: tag.Scope || tag.scope,
                    });
                }
                else {
                    // Create new tag
                    const tagData = {
                        project_id: parseInt(projectId),
                        user_id: String(userId),
                        name: tagName,
                        description: tag.Description || tag.description || '',
                        type: tag.DataType || tag.dataType,
                        data_type: tag.DataType || tag.dataType,
                        address: tag.Address || tag.address,
                        default_value: tag.DefaultValue || tag.defaultValue,
                        vendor: (tag.Vendor || tag.vendor)?.toLowerCase(),
                        scope: (tag.Scope || tag.scope || 'local').toLowerCase(),
                        tag_type: 'memory', // default, adjust as needed
                        is_ai_generated: false
                    };
                    console.log(`🔍 Creating tag with data:`, JSON.stringify(tagData, null, 2));
                    tags_1.TagsTable.createTag(tagData);
                }
            }
            catch (error) {
                console.error(`Error upserting tag ${tag.Name || tag.TagName || tag.name}:`, error);
                // Continue with other tags even if one fails
            }
        }
    }
    /**
     * Handle client disconnection
     */
    handleDisconnection(ws) {
        console.log(`🔌 WebSocket client disconnected: ${ws.user?.username || 'unknown'}`);
        // Clear any pending debounce timer
        if (ws.debounceTimer) {
            clearTimeout(ws.debounceTimer);
            ws.debounceTimer = undefined;
        }
        // Remove from project subscriptions
        if (ws.projectId) {
            const projectClients = this.clients.get(ws.projectId);
            if (projectClients) {
                projectClients.delete(ws);
                if (projectClients.size === 0) {
                    this.clients.delete(ws.projectId);
                    console.log(`📂 No more clients for project ${ws.projectId}, removed from active projects`);
                }
            }
            ws.projectId = undefined;
        }
    }
    /**
     * Send response to specific client
     */
    sendResponse(ws, response) {
        if (ws.readyState === ws_1.WebSocket.OPEN) {
            ws.send(JSON.stringify(response));
        }
    }
    /**
     * Send error to specific client
     */
    sendError(ws, message) {
        this.sendResponse(ws, {
            type: 'error',
            success: false,
            error: message,
            timestamp: new Date().toISOString()
        });
    }
    /**
     * Broadcast message to all clients subscribed to a project
     */
    broadcastToProject(projectId, response) {
        const projectClients = this.clients.get(projectId);
        if (projectClients) {
            const message = JSON.stringify(response);
            projectClients.forEach(client => {
                if (client.readyState === ws_1.WebSocket.OPEN) {
                    client.send(message);
                }
            });
        }
    }
    /**
     * Get connection stats
     */
    getStats() {
        const totalConnections = Array.from(this.clients.values())
            .reduce((sum, clients) => sum + clients.size, 0);
        return {
            totalConnections,
            projectSubscriptions: this.clients.size,
            projects: Array.from(this.clients.keys())
        };
    }
    /**
     * Get detailed connection statistics
     */
    getConnectionStats() {
        const totalConnections = Array.from(this.clients.values()).reduce((sum, clients) => sum + clients.size, 0);
        const projectStats = Array.from(this.clients.entries()).map(([projectId, clients]) => ({
            projectId,
            clientCount: clients.size,
            users: Array.from(clients).map(ws => ws.user?.username || 'unknown')
        }));
        return {
            totalConnections,
            activeProjects: this.clients.size,
            projectStats,
            timestamp: new Date().toISOString()
        };
    }
    /**
     * Cleanup method for graceful shutdown
     */
    async cleanup() {
        console.log('🧹 Cleaning up TagSyncService...');
        // Clear all debounce timers
        for (const clients of this.clients.values()) {
            for (const ws of clients) {
                if (ws.debounceTimer) {
                    clearTimeout(ws.debounceTimer);
                }
            }
        }
        // Close all WebSocket connections
        this.wss.clients.forEach(ws => {
            if (ws.readyState === ws_1.WebSocket.OPEN) {
                ws.close(1000, 'Server shutdown');
            }
        });
        // Clear client tracking
        this.clients.clear();
        console.log('✅ TagSyncService cleanup completed');
    }
}
exports.TagSyncService = TagSyncService;
