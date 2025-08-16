// Real-time WebSocket service for tag synchronization
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { TagsTable } from '../db/tables/tags';
import { ProjectsTable } from '../db/tables/projects';
import { parseSTVariablesDetailed } from '../utils/stParser';
import { formatTagForVendor } from '../utils/vendorFormatters';

interface AuthenticatedWebSocket extends WebSocket {
  user?: {
    userId: string;
    orgId?: string;
    role: string;
    username?: string;
    id?: number;
  };
  projectId?: string;
  lastSyncTime?: number;
  debounceTimer?: NodeJS.Timeout;
}

interface WebSocketMessage {
  type: 'sync_tags' | 'subscribe' | 'unsubscribe' | 'ping';
  projectId?: string;
  vendor?: string;
  stCode?: string;
  data?: any;
  debounceMs?: number; // Client can specify debounce delay
}

interface TagSyncResponse {
  type: 'tags_updated' | 'error' | 'sync_queued' | 'pong';
  success: boolean;
  projectId?: string;
  tags?: any[];
  error?: string;
  timestamp: string;
  parsedCount?: number;
  syncId?: string;
}

export class TagSyncService {
  private wss: WebSocketServer;
  private clients: Map<string, Set<AuthenticatedWebSocket>> = new Map(); // projectId -> Set<WebSocket>
  
 constructor(wss: WebSocketServer) {
    this.wss = wss;

    // Handle WebSocket connections with authentication
    this.wss.on('connection', (ws: WebSocket, request) => {
      console.log('🔌 New WebSocket connection attempt');

      // Parse URL to get token
      const url = new URL(request.url!, `http://${request.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        console.log('❌ No token provided, closing connection');
        ws.close(1008, 'Token required');
        return;
      }

      // Verify JWT token
      const JWT_SECRET = process.env.JWT_SECRET || '69d215b3cc191323c79a3a264f6ad2f194d02486f0001b4ae287b13542fcd2212e39ffda859f71f450edcde3944567db1a694a82155f74c749c2aa4e45fa8c17';

      try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        console.log(`✅ JWT verified for user: ${decoded.userId}`);

        // Cast to AuthenticatedWebSocket and set user
        const authWs = ws as AuthenticatedWebSocket;
        authWs.user = decoded;

        // Handle the authenticated connection
        this.handleConnection(authWs);

      } catch (error) {
        console.log(`❌ JWT verification failed:`, error instanceof Error ? error.message : 'Unknown error');
        ws.close(1008, 'Invalid token');
        return;
      }
    });
  }



  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: AuthenticatedWebSocket) {
    console.log(`🔗 Setting up WebSocket event handlers for user: ${ws.user?.userId || 'unknown'}`);

    ws.on('message', async (data: Buffer) => {
      try {
        const messageStr = data.toString();
        console.log(`📨 Received WebSocket message from ${ws.user?.userId}: ${messageStr.substring(0, 100)}...`);
        const message: WebSocketMessage = JSON.parse(messageStr);
        await this.handleMessage(ws, message);
      } catch (error) {
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
      } catch (error) {
        console.error(`❌ Failed to send connection confirmation:`, error);
      }
    }, 100);
  }

  /**
   * Handle WebSocket message
   */
  private async handleMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage) {
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
    } catch (error) {
      console.error('Error handling WebSocket message:', error);
      this.sendError(ws, `Message handling failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle ping message for connection health check
   */
  private handlePing(ws: AuthenticatedWebSocket) {
    this.sendResponse(ws, {
      type: 'pong',
      success: true,
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Subscribe to project tag updates
   */
  private async handleSubscribe(ws: AuthenticatedWebSocket, message: WebSocketMessage) {
    if (!message.projectId) {
      this.sendError(ws, 'Project ID required for subscription');
      return;
    }

    ws.projectId = message.projectId;

    if (!this.clients.has(message.projectId)) {
      this.clients.set(message.projectId, new Set());
    }
    
    this.clients.get(message.projectId)!.add(ws);

    // Send current tags for the project
    try {
      const tags = TagsTable.getTags({ 
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
    } catch (error) {
      console.error('Error fetching tags for subscription:', error);
      this.sendError(ws, 'Failed to fetch project tags');
    }
  }

  /**
   * Unsubscribe from project tag updates
   */
  private async handleUnsubscribe(ws: AuthenticatedWebSocket, _message: WebSocketMessage) {
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
  private async handleTagSyncDebounced(ws: AuthenticatedWebSocket, message: WebSocketMessage) {
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
      } catch (error) {
        console.error('Debounced tag sync error:', error);
        this.sendError(ws, `Tag sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }, debounceMs);
  }

  /**
   * Handle real-time tag synchronization from ST code
   */
  private async handleTagSync(ws: AuthenticatedWebSocket, message: WebSocketMessage, syncId?: string) {
    if (!message.projectId || !message.vendor || !message.stCode) {
      this.sendError(ws, 'Missing required fields: projectId, vendor, stCode');
      return;
    }

    const startTime = Date.now();

    try {
      // Get project details to determine vendor
      const projectId = parseInt(message.projectId);
      const project = ProjectsTable.getProjectById(projectId, ws.user!.userId);

      if (!project) {
        console.error(`❌ Project ${projectId} not found for user ${ws.user!.userId}`);
        this.sendError(ws, `Project ${projectId} not found`);
        return;
      }

      const projectVendor = project.target_plc_vendor || 'rockwell'; // Default to rockwell
      console.log(`🔄 Starting tag sync for project ${message.projectId}, using project vendor: ${projectVendor}, syncId: ${syncId || 'direct'}`);

      // Parse variables from ST code using project vendor
      const parsedTags = parseSTVariablesDetailed(message.stCode, projectVendor);
      console.log(`📝 Parsed ${parsedTags.length} tags from ST code`);
      console.log(`📝 Raw parsed tags:`, JSON.stringify(parsedTags, null, 2));

      // Format tags for the project's vendor (ignore the vendor from message)
      const formattedTags = parsedTags.map(tag => {
        console.log(`📝 Processing tag: ${tag.name}, dataType: "${tag.dataType}"`);
        const vendorTag = {
          name: tag.name,
          dataType: tag.dataType,
          address: tag.address,
          description: tag.description,
          scope: tag.scope || 'Local',
          defaultValue: tag.defaultValue,
          vendor: projectVendor
        };
        const formatted = formatTagForVendor(vendorTag, projectVendor as 'rockwell' | 'siemens' | 'beckhoff');
        console.log(`📝 Formatted tag:`, JSON.stringify(formatted, null, 2));
        return formatted;
      });

      // Upsert tags in database
      console.log(`🔍 Debug: Project ID: ${message.projectId}, User ID: ${ws.user!.userId}`);
      await this.upsertTagsInDB(message.projectId, formattedTags, ws.user!.userId);
      console.log(`💾 Upserted ${formattedTags.length} tags to database`);

      // Fetch updated tags
      const updatedTags = TagsTable.getTags({
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

    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`❌ Tag sync failed after ${duration}ms for project ${message.projectId}:`, error);
      this.sendError(ws, `Tag synchronization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upsert tags in database with transaction
   */
  private async upsertTagsInDB(projectId: string, tags: any[], userId: string) {
    console.log(`🔍 Upserting tags for project ${projectId}, user ${userId}`);

    // Check if project and user exist
    const projectIdNum = parseInt(projectId);
    console.log(`🔍 Checking if project ${projectIdNum} and user ${userId} exist in database...`);

    // For now, let's create the project if it doesn't exist
    try {
      const db = require('../db/index').default;

      // Check if project exists
      const projectCheck = db.prepare('SELECT id FROM projects WHERE id = ?').get(projectIdNum);
      if (!projectCheck) {
        console.log(`🔧 Project ${projectIdNum} doesn't exist, creating it...`);
        db.prepare(`
          INSERT INTO projects (id, name, description, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))
        `).run(projectIdNum, `Project ${projectIdNum}`, `Auto-created project for Logic Studio`);
        console.log(`✅ Created project ${projectIdNum}`);
      }

      // Check if user exists
      const userCheck = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (!userCheck) {
        console.log(`🔧 User ${userId} doesn't exist, creating it...`);
        db.prepare(`
          INSERT INTO users (id, username, email, role, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))
        `).run(userId, `User-${userId.substring(0, 8)}`, `${userId}@example.com`, 'Admin');
        console.log(`✅ Created user ${userId}`);
      }
    } catch (error) {
      console.error('Error checking/creating project and user:', error);
    }

    // Fetch all existing tags for the project once
    const existingTagsResult = TagsTable.getTags({ project_id: projectIdNum, page_size: 1000 });
    const existingTags = existingTagsResult.tags;

    for (const tag of tags) {
      try {
        // Try to find an existing tag by name
        const tagName = tag.Name || tag.TagName || tag.name;
        const existingTag = existingTags.find((t: any) => t.name === tagName);

        if (existingTag) {
          // Update existing tag with normalized values
          const rawDataTypeForUpdate = tag.DataType || tag.dataType;
          const normalizedDataTypeForUpdate = rawDataTypeForUpdate?.toUpperCase() || 'BOOL';

          const rawScopeForUpdate = tag.Scope || tag.scope || 'local';
          const normalizedScopeForUpdate = rawScopeForUpdate.toLowerCase();

          const rawVendorForUpdate = tag.Vendor || tag.vendor || 'rockwell';
          const normalizedVendorForUpdate = rawVendorForUpdate.toLowerCase();

          console.log(`🔍 TagSync Update: Raw data type: "${rawDataTypeForUpdate}" → Normalized: "${normalizedDataTypeForUpdate}"`);
          console.log(`🔍 TagSync Update: Raw scope: "${rawScopeForUpdate}" → Normalized: "${normalizedScopeForUpdate}"`);
          console.log(`🔍 TagSync Update: Raw vendor: "${rawVendorForUpdate}" → Normalized: "${normalizedVendorForUpdate}"`);

          TagsTable.updateTag(existingTag.id, {
            type: normalizedDataTypeForUpdate,
            data_type: normalizedDataTypeForUpdate,
            address: tag.Address || tag.address,
            default_value: tag.DefaultValue || tag.defaultValue,
            vendor: normalizedVendorForUpdate,
            scope: normalizedScopeForUpdate,
            description: tag.Description || tag.description || ''
          });
        } else {
          // Create new tag with normalized values
          const rawDataType = tag.DataType || tag.dataType;
          const normalizedDataType = rawDataType?.toUpperCase() || 'BOOL';

          const rawScope = tag.Scope || tag.scope || 'local';
          const normalizedScope = rawScope.toLowerCase();

          const rawVendor = tag.Vendor || tag.vendor || 'rockwell';
          const normalizedVendor = rawVendor.toLowerCase();

          console.log(`🔍 TagSync Create: Raw data type: "${rawDataType}" → Normalized: "${normalizedDataType}"`);
          console.log(`🔍 TagSync Create: Raw scope: "${rawScope}" → Normalized: "${normalizedScope}"`);
          console.log(`🔍 TagSync Create: Raw vendor: "${rawVendor}" → Normalized: "${normalizedVendor}"`);

          const tagData = {
            project_id: parseInt(projectId),
            user_id: String(userId),
            name: tagName,
            description: tag.Description || tag.description || '',
            type: normalizedDataType,
            data_type: normalizedDataType,
            address: tag.Address || tag.address,
            default_value: tag.DefaultValue || tag.defaultValue,
            vendor: normalizedVendor,
            scope: normalizedScope,
            tag_type: 'memory' as const, // default, adjust as needed
            is_ai_generated: false
          };

          console.log(`🔍 Creating tag with data:`, JSON.stringify(tagData, null, 2));
          console.log(`🔍 Data type being inserted: "${tagData.data_type}" (length: ${tagData.data_type?.length})`);
          TagsTable.createTag(tagData);
        }
      } catch (error) {
        console.error(`Error upserting tag ${tag.Name || tag.TagName || tag.name}:`, error);
        // Continue with other tags even if one fails
      }
    }
  }

  /**
   * Handle client disconnection
   */
  private handleDisconnection(ws: AuthenticatedWebSocket) {
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
  private sendResponse(ws: AuthenticatedWebSocket, response: TagSyncResponse) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(response));
    }
  }

  /**
   * Send error to specific client
   */
  private sendError(ws: AuthenticatedWebSocket, message: string) {
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
  private broadcastToProject(projectId: string, response: TagSyncResponse) {
    const projectClients = this.clients.get(projectId);
    if (projectClients) {
      const message = JSON.stringify(response);
      projectClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  }

  /**
   * Get connection stats
   */
  public getStats() {
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
  public getConnectionStats() {
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
  public async cleanup() {
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
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(1000, 'Server shutdown');
      }
    });

    // Clear client tracking
    this.clients.clear();

    console.log('✅ TagSyncService cleanup completed');
  }
}
