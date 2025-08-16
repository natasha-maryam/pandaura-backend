import db from '../index';

export interface AutoSaveData {
  project_id: number;
  user_id: string;
  state: any;
  timestamp: number;
}

export class ProjectAutoSaveTable {
  // Save project state
  static async saveState(data: AutoSaveData): Promise<void> {
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO project_autosave 
      (project_id, user_id, state, timestamp) 
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(
      data.project_id,
      data.user_id,
      JSON.stringify(data.state),
      data.timestamp || Math.floor(Date.now() / 1000)
    );
  }

  // Get latest auto-saved state
  static async getLatestState(projectId: number, userId: string): Promise<any | null> {
    const stmt = db.prepare(`
      SELECT state, timestamp 
      FROM project_autosave 
      WHERE project_id = ? AND user_id = ?
      ORDER BY timestamp DESC 
      LIMIT 1
    `);

    const result = stmt.get(projectId, userId) as { state: string; timestamp: number } | undefined;
    if (!result) return null;

    return {
      state: JSON.parse(result.state),
      timestamp: result.timestamp
    };
  }

  // Clear old auto-saves (keep last N versions)
  static async cleanOldStates(projectId: number, keepCount: number = 5): Promise<void> {
    const stmt = db.prepare(`
      DELETE FROM project_autosave 
      WHERE project_id = ? 
      AND timestamp NOT IN (
        SELECT timestamp 
        FROM project_autosave 
        WHERE project_id = ? 
        ORDER BY timestamp DESC 
        LIMIT ?
      )
    `);

    stmt.run(projectId, projectId, keepCount);
  }

  // Initialize table
  static async initTable(): Promise<void> {
    const stmt = db.prepare(`
      CREATE TABLE IF NOT EXISTS project_autosave (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        state TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        UNIQUE(project_id, user_id, timestamp)
      )
    `);

    stmt.run();
    console.log('✅ Project auto-save table initialized');
  }
}
