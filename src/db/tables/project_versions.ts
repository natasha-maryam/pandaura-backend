import db from '../index';

export interface ProjectVersion {
  id: number;
  project_id: number;
  user_id: string;
  version_number: number;
  state: any;
  message?: string;
  timestamp: number;
  is_auto?: boolean;
}

export class ProjectVersionsTable {
  // Create new version
  static async createVersion(data: Omit<ProjectVersion, 'id' | 'version_number'>): Promise<number> {
    // Get current version number
    const versionStmt = db.prepare(`
      SELECT COALESCE(MAX(version_number), 0) as current_version 
      FROM project_versions 
      WHERE project_id = ?
    `);
    const { current_version } = versionStmt.get(data.project_id) as { current_version: number };
    const nextVersion = current_version + 1;

    // Insert new version
    const stmt = db.prepare(`
      INSERT INTO project_versions 
      (project_id, user_id, version_number, state, message, timestamp, is_auto) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      data.project_id,
      data.user_id,
      nextVersion,
      JSON.stringify(data.state),
      data.message || null,
      data.timestamp || Math.floor(Date.now() / 1000),
      data.is_auto ? 1 : 0
    );

    return result.lastInsertRowid as number;
  }

  // Get version history
  static async getVersionHistory(projectId: number): Promise<ProjectVersion[]> {
    const stmt = db.prepare(`
      SELECT * FROM project_versions 
      WHERE project_id = ? 
      ORDER BY version_number DESC
    `);

    const versions = stmt.all(projectId) as Array<{
      id: number;
      project_id: number;
      user_id: string;
      version_number: number;
      state: string;
      message?: string;
      timestamp: number;
      is_auto: number;
    }>;
    
    return versions.map(v => ({
      ...v,
      state: JSON.parse(v.state),
      is_auto: Boolean(v.is_auto)
    }));
  }

  // Get specific version
  static async getVersion(projectId: number, versionNumber: number): Promise<ProjectVersion | null> {
    const stmt = db.prepare(`
      SELECT * FROM project_versions 
      WHERE project_id = ? AND version_number = ?
    `);

    const version = stmt.get(projectId, versionNumber) as {
      id: number;
      project_id: number;
      user_id: string;
      version_number: number;
      state: string;
      message?: string;
      timestamp: number;
      is_auto: number;
    } | undefined;
    
    if (!version) return null;

    return {
      ...version,
      state: JSON.parse(version.state),
      is_auto: Boolean(version.is_auto)
    };
  }

  // Restore to version
  static async restoreVersion(projectId: number, versionNumber: number, userId: string): Promise<void> {
    // Get version to restore
    const version = await this.getVersion(projectId, versionNumber);
    if (!version) throw new Error('Version not found');

    // Create new version with restored state
    await this.createVersion({
      project_id: projectId,
      user_id: userId,
      state: version.state,
      message: `Restored from version ${versionNumber}`,
      timestamp: Math.floor(Date.now() / 1000),
      is_auto: false
    });
  }

  // Initialize table
  static async initTable(): Promise<void> {
    const stmt = db.prepare(`
      CREATE TABLE IF NOT EXISTS project_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        version_number INTEGER NOT NULL,
        state TEXT NOT NULL,
        message TEXT,
        timestamp INTEGER NOT NULL,
        is_auto INTEGER DEFAULT 0,
        UNIQUE(project_id, version_number)
      )
    `);

    stmt.run();
    // console.log('✅ Project versions table initialized');
  }
}
