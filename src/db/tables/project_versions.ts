import db from '../index';
import { ProjectsTable } from './projects';

export interface ProjectVersion {
  id: number;
  project_id: number;
  user_id: string;
  version_number: number;
  data: any; // Full project snapshot including metadata and state
  created_at: string;
  message?: string;
  is_auto?: boolean;
}

export interface ProjectVersionSnapshot {
  projectMetadata: {
    id: number;
    project_name: string;
    client_name?: string;
    project_type?: string;
    description?: string;
    target_plc_vendor?: 'siemens' | 'rockwell' | 'beckhoff';
    metadata?: any;
  };
  autosaveState?: any;
  moduleStates?: {
    [moduleName: string]: any;
  };
  timestamp: number;
  version_info: {
    created_by: string;
    created_at: string;
    message?: string;
  };
}

export class ProjectVersionsTable {
  // Helper to get latest version number for a project
  static async getLatestVersionNumber(projectId: number): Promise<number> {
    const stmt = db.prepare(`
      SELECT COALESCE(MAX(version_number), 0) as current_version 
      FROM project_versions 
      WHERE project_id = ?
    `);
    const result = stmt.get(projectId) as { current_version: number };
    return result.current_version;
  }

  // Create full project snapshot
  static async createProjectSnapshot(projectId: number, userId: string, message?: string, isAuto: boolean = false): Promise<number> {
    // Get current project data
    const project = ProjectsTable.getProjectById(projectId, userId);
    if (!project) {
      throw new Error('Project not found or access denied');
    }

    // Get current autosave state if exists
    try {
      const { ProjectAutoSaveTable } = require('./project_autosave');
      const autosaveState = await ProjectAutoSaveTable.getLatestState(projectId, userId);

      // Create full snapshot
      const snapshot: ProjectVersionSnapshot = {
        projectMetadata: {
          id: project.id,
          project_name: project.project_name,
          client_name: project.client_name,
          project_type: project.project_type,
          description: project.description,
          target_plc_vendor: project.target_plc_vendor,
          metadata: project.metadata ? JSON.parse(project.metadata) : {}
        },
        autosaveState: autosaveState ? autosaveState.state : null,
        moduleStates: {}, // Can be extended for module-specific states
        timestamp: Math.floor(Date.now() / 1000),
        version_info: {
          created_by: userId,
          created_at: new Date().toISOString(),
          message: message || (isAuto ? 'Auto-save' : 'Manual save')
        }
      };

      // Get next version number
      const latestVersion = await this.getLatestVersionNumber(projectId);
      const nextVersion = latestVersion + 1;

      // Insert new version
      const stmt = db.prepare(`
        INSERT INTO project_versions 
        (project_id, user_id, version_number, data, created_at, message, is_auto) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const result = stmt.run(
        projectId,
        userId,
        nextVersion,
        JSON.stringify(snapshot),
        new Date().toISOString(),
        message || null,
        isAuto ? 1 : 0
      );

      // Log audit event
      this.logVersionAudit(projectId, userId, 'create', nextVersion, {
        message,
        isAuto,
        snapshotSize: JSON.stringify(snapshot).length
      });

      return result.lastInsertRowid as number;
    } catch (error) {
      console.error('Error creating project snapshot:', error);
      throw error;
    }
  }

  // Legacy create version method for backward compatibility
  static async createVersion(data: any): Promise<number> {
    return this.createProjectSnapshot(
      data.project_id,
      data.user_id,
      data.message,
      data.is_auto
    );
  }

  // Get version history with enhanced data structure
  static async getVersionHistory(projectId: number): Promise<ProjectVersion[]> {
    const stmt = db.prepare(`
      SELECT id, project_id, user_id, version_number, data, created_at, message, is_auto
      FROM project_versions 
      WHERE project_id = ? 
      ORDER BY version_number DESC
    `);

    const rows = stmt.all(projectId) as any[];
    
    return rows.map(row => ({
      id: row.id,
      project_id: row.project_id,
      user_id: row.user_id,
      version_number: row.version_number,
      data: JSON.parse(row.data),
      created_at: row.created_at,
      message: row.message,
      is_auto: Boolean(row.is_auto)
    }));
  }

  // Get specific version data
  static async getVersion(projectId: number, versionNumber: number): Promise<ProjectVersion | null> {
    const stmt = db.prepare(`
      SELECT id, project_id, user_id, version_number, data, created_at, message, is_auto
      FROM project_versions 
      WHERE project_id = ? AND version_number = ?
    `);

    const row = stmt.get(projectId, versionNumber) as any;
    if (!row) return null;

    return {
      id: row.id,
      project_id: row.project_id,
      user_id: row.user_id,
      version_number: row.version_number,
      data: JSON.parse(row.data),
      created_at: row.created_at,
      message: row.message,
      is_auto: Boolean(row.is_auto)
    };
  }

  // Enhanced rollback functionality - actually restores project state
  static async rollbackToVersion(projectId: number, versionNumber: number, userId: string): Promise<{ rolledBackTo: number; newVersion: number }> {
    // Get version to restore
    const version = await this.getVersion(projectId, versionNumber);
    if (!version) throw new Error('Version not found');

    const snapshot = version.data as ProjectVersionSnapshot;
    if (!snapshot.projectMetadata) {
      throw new Error('Invalid version data structure');
    }

    try {
      // Get next version number before starting transaction
      const latestVersion = await this.getLatestVersionNumber(projectId);
      const newVersion = latestVersion + 1;

      // Start transaction
      const transaction = db.transaction(() => {
        // 1. Update project metadata in projects table
        const updateProjectStmt = db.prepare(`
          UPDATE projects SET
            project_name = ?,
            client_name = ?,
            project_type = ?,
            description = ?,
            target_plc_vendor = ?,
            metadata = ?,
            updated_at = ?
          WHERE id = ?
        `);

        updateProjectStmt.run(
          snapshot.projectMetadata.project_name,
          snapshot.projectMetadata.client_name,
          snapshot.projectMetadata.project_type,
          snapshot.projectMetadata.description,
          snapshot.projectMetadata.target_plc_vendor,
          JSON.stringify(snapshot.projectMetadata.metadata || {}),
          new Date().toISOString(),
          projectId
        );

        // 2. Restore autosave state if it exists
        if (snapshot.autosaveState) {
          const { ProjectAutoSaveTable } = require('./project_autosave');
          ProjectAutoSaveTable.saveState({
            project_id: projectId,
            user_id: userId,
            state: snapshot.autosaveState,
            timestamp: Math.floor(Date.now() / 1000)
          });
        }

        // 3. Create new version representing this rollback
        const rollbackSnapshot: ProjectVersionSnapshot = {
          ...snapshot,
          timestamp: Math.floor(Date.now() / 1000),
          version_info: {
            created_by: userId,
            created_at: new Date().toISOString(),
            message: `Rollback to version ${versionNumber}`
          }
        };

        const insertStmt = db.prepare(`
          INSERT INTO project_versions 
          (project_id, user_id, version_number, data, created_at, message, is_auto) 
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `);

        insertStmt.run(
          projectId,
          userId,
          newVersion,
          JSON.stringify(rollbackSnapshot),
          new Date().toISOString(),
          `Rollback to version ${versionNumber}`,
          0
        );

        return newVersion;
      });

      const newVersionNumber = transaction();

      // Log audit event
      this.logVersionAudit(projectId, userId, 'rollback', versionNumber, {
        targetVersion: versionNumber,
        newVersion: newVersionNumber,
        restoredData: {
          projectName: snapshot.projectMetadata.project_name,
          hasAutosave: !!snapshot.autosaveState
        }
      });

      return {
        rolledBackTo: versionNumber,
        newVersion: newVersionNumber
      };

    } catch (error) {
      console.error('Error during rollback:', error);
      throw error;
    }
  }

  // Log version audit events
  static logVersionAudit(
    projectId: number, 
    userId: string, 
    action: string, 
    versionNumber?: number, 
    metadata?: any,
    ipAddress?: string,
    userAgent?: string
  ): void {
    try {
      const stmt = db.prepare(`
        INSERT INTO project_version_audit 
        (project_id, user_id, action, version_number, metadata, created_at, ip_address, user_agent)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        projectId,
        userId,
        action,
        versionNumber || null,
        JSON.stringify(metadata || {}),
        new Date().toISOString(),
        ipAddress || null,
        userAgent || null
      );
    } catch (error) {
      console.error('Error logging version audit:', error);
      // Don't throw - audit logging shouldn't break the main operation
    }
  }

  // Get audit history for a project
  static async getAuditHistory(projectId: number): Promise<any[]> {
    const stmt = db.prepare(`
      SELECT * FROM project_version_audit 
      WHERE project_id = ? 
      ORDER BY created_at DESC
    `);

    const rows = stmt.all(projectId) as any[];
    return rows.map(row => ({
      ...row,
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    }));
  }

  // Initialize table with new schema
  static async initTable(): Promise<void> {
    try {
      // Check if table exists first
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master 
        WHERE type='table' AND name='project_versions'
      `).get();

      // Run the migration in a transaction
      const migration = db.transaction(() => {
        if (tableExists) {
          // Check if data column exists
          const tableInfo = db.prepare(`
            SELECT sql FROM sqlite_master 
            WHERE type='table' AND name='project_versions'
          `).get() as { sql: string } | undefined;
          
          const hasDataColumn = tableInfo?.sql?.includes('data TEXT') || false;

          if (!hasDataColumn) {
            // Create backup of existing data
            db.prepare(`
              CREATE TABLE project_versions_backup AS 
              SELECT 
                id,
                project_id,
                user_id,
                version_number,
                message,
                COALESCE(is_auto, 0) as is_auto,
                datetime('now') as created_at
              FROM project_versions;
            `).run();

            // Drop existing table
            db.prepare(`DROP TABLE IF EXISTS project_versions;`).run();
          }
        }

        // Create new table with updated schema
        db.prepare(`
          CREATE TABLE IF NOT EXISTS project_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            user_id TEXT NOT NULL,
            version_number INTEGER NOT NULL,
            data TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            message TEXT,
            is_auto INTEGER DEFAULT 0,
            CONSTRAINT unique_project_version UNIQUE (project_id, version_number),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
          )
        `).run();

        // Create indices
        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_project_versions_latest 
          ON project_versions (project_id, version_number DESC)
        `).run();

        db.prepare(`
          CREATE INDEX IF NOT EXISTS idx_project_versions_user 
          ON project_versions (user_id)
        `).run();

        // Migrate existing data if backup exists
        const backupExists = db.prepare(`
          SELECT name FROM sqlite_master 
          WHERE type='table' AND name='project_versions_backup'
        `).get();

        if (backupExists) {
          interface BackupRecord {
            id: number;
            project_id: number;
            user_id: string;
            version_number: number;
            message: string | null;
            created_at: string;
            is_auto: number;
          }

          interface ProjectInfo {
            project_name: string;
          }

          // Get project names from projects table
          const getProjectName = db.prepare(`
            SELECT project_name FROM projects WHERE id = ?
          `);

          // Get all backup records
          const backupRecords = db.prepare(`
            SELECT * FROM project_versions_backup
          `).all() as BackupRecord[];

          // Insert each record with proper data structure
          const insertStmt = db.prepare(`
            INSERT INTO project_versions (
              id, project_id, user_id, version_number, data, created_at, message, is_auto
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `);

          backupRecords.forEach(record => {
            const projectInfo = getProjectName.get(record.project_id) as ProjectInfo | undefined;
            const projectName = projectInfo?.project_name || 'Migrated Project';

            const versionData = {
              projectMetadata: {
                id: record.project_id,
                project_name: projectName,
                metadata: {}
              },
              timestamp: Math.floor(Date.now() / 1000),
              version_info: {
                created_by: record.user_id,
                created_at: record.created_at,
                message: record.message || 'Migrated version'
              }
            };

            insertStmt.run(
              record.id,
              record.project_id,
              record.user_id,
              record.version_number,
              JSON.stringify(versionData),
              record.created_at,
              record.message,
              record.is_auto
            );
          });

          // Drop backup table
          db.prepare(`DROP TABLE IF EXISTS project_versions_backup;`).run();
        }
      });

      // Run the migration
      migration();
      console.log('✅ Project versions table initialized with data column');
    } catch (error) {
      console.error('Error initializing project versions table:', error);
      throw error;
    }

    // Create audit table
    const auditStmt = db.prepare(`
      CREATE TABLE IF NOT EXISTS project_version_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        action TEXT NOT NULL,
        version_number INTEGER,
        metadata TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        ip_address TEXT,
        user_agent TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      )
    `);
    auditStmt.run();

    // Create audit indices
    const auditIndexStmts = [
      `CREATE INDEX IF NOT EXISTS idx_version_audit_project ON project_version_audit (project_id)`,
      `CREATE INDEX IF NOT EXISTS idx_version_audit_user ON project_version_audit (user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_version_audit_action ON project_version_audit (action)`
    ];

    auditIndexStmts.forEach(sql => {
      const stmt = db.prepare(sql);
      stmt.run();
    });

    console.log('✅ Enhanced project versions tables initialized');
  }

  // Cleanup old versions (keep last N versions)
  static async cleanupOldVersions(projectId: number, keepCount: number = 50): Promise<number> {
    const stmt = db.prepare(`
      DELETE FROM project_versions 
      WHERE project_id = ? 
      AND version_number NOT IN (
        SELECT version_number 
        FROM project_versions 
        WHERE project_id = ? 
        ORDER BY version_number DESC 
        LIMIT ?
      )
    `);

    const result = stmt.run(projectId, projectId, keepCount);
    return result.changes || 0;
  }
}