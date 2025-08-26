// Real-time WebSocket service for tag synchronization
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { parseSTVariablesDetailed } from '../utils/stParser';
import { formatTagForVendor, validateTagForVendor } from '../utils/vendorFormatters';
import db from '../db/knex';

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
      // console.log('🔌 New WebSocket connection attempt');

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
        // console.log(`✅ JWT verified for user: ${decoded.userId}`);

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
    // console.log(`🔗 Setting up WebSocket event handlers for user: ${ws.user?.userId || 'unknown'}`);

    ws.on('message', async (data: Buffer) => {
      try {
        const messageStr = data.toString();
        // console.log(`📨 Received WebSocket message from ${ws.user?.userId}: ${messageStr.substring(0, 100)}...`);
        const message: WebSocketMessage = JSON.parse(messageStr);
        await this.handleMessage(ws, message);
      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error);
        this.sendError(ws, 'Invalid message format');
      }
    });

    ws.on('close', (code, reason) => {
      // console.log(`🔌 WebSocket close event - Code: ${code}, Reason: ${reason?.toString() || 'none'}, User: ${ws.user?.userId || 'unknown'}`);
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
    // console.log(`✅ WebSocket connection ready for user: ${ws.user?.userId || 'unknown'}`);

    // Send a simple connection confirmation after a small delay
    setTimeout(() => {
      try {
        this.sendResponse(ws, {
          type: 'pong',
          success: true,
          timestamp: new Date().toISOString()
        });
        // console.log(`✅ Connection confirmation sent to user: ${ws.user?.userId || 'unknown'}`);
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

    // console.log(`🔍 DEBUG: Client subscribing to project ${message.projectId}`);
    // console.log(`🔍 DEBUG: Client user ID: ${ws.user?.userId || 'unknown'}`);

    ws.projectId = message.projectId;

    if (!this.clients.has(message.projectId)) {
      this.clients.set(message.projectId, new Set());
      // console.log(`🔍 DEBUG: Created new client set for project ${message.projectId}`);
    }
    
    this.clients.get(message.projectId)!.add(ws);
    // console.log(`🔍 DEBUG: Added client to project ${message.projectId}, total clients: ${this.clients.get(message.projectId)!.size}`);
    // console.log(`🔍 DEBUG: All subscribed projects:`, Array.from(this.clients.keys()));

    // Send current tags for the project
    try {
      const tags = await db('tags')
        .where('project_id', parseInt(message.projectId))
        .orderBy('name');
      
      // console.log(`🔍 DEBUG: Sending ${tags.length} existing tags to new subscriber`);
      
      this.sendResponse(ws, {
        type: 'tags_updated',
        success: true,
        projectId: message.projectId,
        tags: tags,
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
      // Get project details to determine vendor using Knex
      const projectId = parseInt(message.projectId);
      const project = await db('projects')
        .where({ id: projectId, user_id: ws.user!.userId })
        .first();

      if (!project) {
        console.error(`❌ Project ${projectId} not found for user ${ws.user!.userId}`);
        this.sendError(ws, `Project ${projectId} not found`);
        return;
      }

      const projectVendor = project.target_plc_vendor || 'rockwell'; // Default to rockwell
      // console.log(`🔄 Starting tag sync for project ${message.projectId}, using project vendor: ${projectVendor}, syncId: ${syncId || 'direct'}`);
      // console.log(`🔍 DEBUG: ST Code received:`, message.stCode);
      // console.log(`🔍 DEBUG: ST Code length:`, message.stCode.length);

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
        // console.log(`📝 Formatted tag:`, JSON.stringify(formatted, null, 2));
        return formatted;
      });

      // Upsert tags in database
      // console.log(`🔍 Debug: Project ID: ${message.projectId}, User ID: ${ws.user!.userId}`);
      await this.upsertTagsInDB(message.projectId, formattedTags, ws.user!.userId);
      // console.log(`💾 Upserted ${formattedTags.length} tags to database`);

      // Fetch updated tags using Knex
      const updatedTags = await db('tags')
        .where('project_id', parseInt(message.projectId))
        .orderBy('name');

      const duration = Date.now() - startTime;
      // console.log(`✅ Tag sync completed in ${duration}ms for project ${message.projectId}`);

      // console.log(`🔍 DEBUG: About to broadcast tags_updated to project ${message.projectId}`);
      // console.log(`🔍 DEBUG: Broadcasting ${updatedTags.length} tags to all subscribers`);
      
      // Broadcast to all subscribers of this project
      this.broadcastToProject(message.projectId, {
        type: 'tags_updated',
        success: true,
        projectId: message.projectId,
        tags: updatedTags,
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
   * Validate project exists and user has access
   */
  private async validateProjectAccess(projectId: string, userId: string): Promise<boolean> {
    try {
      const projectIdNum = parseInt(projectId);
      
      // Check if project exists and user has access to it
      const project = await db('projects')
        .where({ id: projectIdNum, user_id: userId })
        .first();
        
      if (!project) {
        console.log(`❌ Project ${projectIdNum} not found or user ${userId} doesn't have access`);
        return false;
      }
      
      console.log(`✅ Validated access to project ${projectIdNum} for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error validating project access:', error);
      return false;
    }
  }

  /**
   * Enhanced upsert tags in database with real-time validation and intelligent updates
   */
  private async upsertTagsInDB(projectId: string, tags: any[], userId: string) {
    console.log(`🔍 Starting intelligent tag upsert for project ${projectId}, user ${userId}`);
    console.log(`🔍 Processing ${tags.length} tags from Logic Studio`);

    // Validate project access first
    if (!(await this.validateProjectAccess(projectId, userId))) {
      throw new Error(`Access denied to project ${projectId} for user ${userId}`);
    }

    const projectIdNum = parseInt(projectId);

    // Get project vendor for new tags
    const project = await db('projects')
      .where({ id: projectIdNum, user_id: userId })
      .first();
    
    const projectVendor = project?.target_plc_vendor || 'rockwell';
    console.log(`🔍 Project vendor for new tags: ${projectVendor}`);

    // Fetch all existing tags for the project once using Knex
    const existingTags = await db('tags')
      .where('project_id', projectIdNum)
      .orderBy('name');

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

          console.log(`🔍 TagSync Update: Raw data type: "${rawDataTypeForUpdate}" → Normalized: "${normalizedDataTypeForUpdate}"`);
          console.log(`🔍 TagSync Update: Raw scope: "${rawScopeForUpdate}" → Normalized: "${normalizedScopeForUpdate}"`);
          console.log(`🔍 TagSync Update: Preserving existing vendor: "${existingTag.vendor}"`);

          // Update existing tag using Knex - but preserve the existing vendor
          await db('tags')
            .where('id', existingTag.id)
            .update({
              type: normalizedDataTypeForUpdate,
              data_type: normalizedDataTypeForUpdate,
              address: tag.Address || tag.address,
              default_value: tag.DefaultValue || tag.defaultValue,
              // vendor: normalizedVendorForUpdate, // REMOVED: Don't change vendor of existing tags
              scope: normalizedScopeForUpdate,
              description: tag.Description || tag.description || '',
              updated_at: new Date().toISOString()
            });
        } else {
          // Create new tag with normalized values and project vendor
          const rawDataType = tag.DataType || tag.dataType;
          const normalizedDataType = rawDataType?.toUpperCase() || 'BOOL';

          const rawScope = tag.Scope || tag.scope || 'local';
          const normalizedScope = rawScope.toLowerCase();

          console.log(`🔍 TagSync Create: Raw data type: "${rawDataType}" → Normalized: "${normalizedDataType}"`);
          console.log(`🔍 TagSync Create: Raw scope: "${rawScope}" → Normalized: "${normalizedScope}"`);
          console.log(`🔍 TagSync Create: Using project vendor: "${projectVendor}"`);

          const tagData = {
            project_id: parseInt(projectId),
            user_id: String(userId),
            name: tagName,
            description: tag.Description || tag.description || '',
            type: normalizedDataType,
            data_type: normalizedDataType,
            address: tag.Address || tag.address,
            default_value: tag.DefaultValue || tag.defaultValue,
            vendor: projectVendor, // Use project vendor for new tags
            scope: normalizedScope,
            tag_type: 'memory' as const, // default, adjust as needed
            is_ai_generated: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          };

          console.log(`🔍 Creating tag with data:`, JSON.stringify(tagData, null, 2));
          console.log(`🔍 Data type being inserted: "${tagData.data_type}" (length: ${tagData.data_type?.length})`);
          
          // Create new tag using Knex
          await db('tags').insert(tagData);
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
    // console.log(`🔌 WebSocket client disconnected: ${ws.user?.username || 'unknown'}`);
    // console.log(`🔍 DEBUG: Client was subscribed to project: ${ws.projectId || 'none'}`);

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
        // console.log(`🔍 DEBUG: Removed client from project ${ws.projectId}, remaining clients: ${projectClients.size}`);
        if (projectClients.size === 0) {
          this.clients.delete(ws.projectId);
          // console.log(`📂 No more clients for project ${ws.projectId}, removed from active projects`);
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
    
    // console.log(`🔍 DEBUG: Broadcasting to project ${projectId}`);
    // console.log(`🔍 DEBUG: Subscribed clients count: ${projectClients?.size || 0}`);
    // console.log(`🔍 DEBUG: Message type: ${response.type}`);
    // console.log(`🔍 DEBUG: All project subscriptions:`, Array.from(this.clients.keys()));
    
    if (projectClients) {
      const message = JSON.stringify(response);
      console.log(`📡 Broadcasting to ${projectClients.size} clients for project ${projectId}`);
      let sentCount = 0;
      projectClients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(message);
            sentCount++;
            console.log(`✅ Message sent to client (${sentCount}/${projectClients.size})`);
          } catch (error) {
            console.error(`❌ Failed to send message to client:`, error);
          }
        } else {
          console.log(`⚠️ Client WebSocket not open (state: ${client.readyState})`);
        }
      });
      console.log(`📡 Successfully broadcast to ${sentCount}/${projectClients.size} clients`);
    } else {
      console.log(`📡 No clients subscribed to project ${projectId}`);
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
   * Public helper to notify subscribers that a project's tags were updated
   * Useful for non-WS flows like file imports to trigger real-time reload
   */
  public async notifyProjectTagsUpdated(projectId: number) {
    try {
      const tags = await db('tags')
        .where('project_id', projectId)
        .orderBy('name');
        
      const response = {
        type: 'tags_updated' as const,
        success: true,
        projectId: String(projectId),
        tags: tags,
        timestamp: new Date().toISOString(),
      };
      this.broadcastToProject(String(projectId), response);
    } catch (error) {
      console.error('Failed to notify project tags updated:', error);
    }
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
