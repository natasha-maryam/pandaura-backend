"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectAutoSaveTable = void 0;
const index_1 = __importDefault(require("../index"));
class ProjectAutoSaveTable {
    // Save project state
    static async saveState(data) {
        const stmt = index_1.default.prepare(`
      INSERT OR REPLACE INTO project_autosave 
      (project_id, user_id, state, timestamp) 
      VALUES (?, ?, ?, ?)
    `);
        stmt.run(data.project_id, data.user_id, JSON.stringify(data.state), data.timestamp || Math.floor(Date.now() / 1000));
    }
    // Get latest auto-saved state
    static async getLatestState(projectId, userId) {
        const stmt = index_1.default.prepare(`
      SELECT state, timestamp 
      FROM project_autosave 
      WHERE project_id = ? AND user_id = ?
      ORDER BY timestamp DESC 
      LIMIT 1
    `);
        const result = stmt.get(projectId, userId);
        if (!result)
            return null;
        return {
            state: JSON.parse(result.state),
            timestamp: result.timestamp
        };
    }
    // Clear old auto-saves (keep last N versions)
    static async cleanOldStates(projectId, keepCount = 5) {
        const stmt = index_1.default.prepare(`
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
    static async initTable() {
        const stmt = index_1.default.prepare(`
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
        // console.log('✅ Project auto-save table initialized');
    }
}
exports.ProjectAutoSaveTable = ProjectAutoSaveTable;
