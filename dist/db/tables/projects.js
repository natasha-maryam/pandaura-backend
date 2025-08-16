"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectsTable = void 0;
const index_1 = __importDefault(require("../index"));
class ProjectsTable {
    static initializeTable() {
        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS projects (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        project_name TEXT NOT NULL,
        client_name TEXT,
        project_type TEXT,
        description TEXT,
        target_plc_vendor TEXT CHECK (target_plc_vendor IN ('siemens', 'rockwell', 'beckhoff')),
        autosave_state TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `;
        const createIndexSQL = [
            'CREATE INDEX IF NOT EXISTS idx_projects_user_id ON projects(user_id)',
            'CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON projects(updated_at DESC)'
        ];
        try {
            index_1.default.exec(createTableSQL);
            createIndexSQL.forEach(indexSQL => index_1.default.exec(indexSQL));
            // console.log('Projects table initialized successfully');
        }
        catch (error) {
            console.error('Error initializing projects table:', error);
            throw error;
        }
    }
    static createProject(projectData) {
        const stmt = index_1.default.prepare(`
      INSERT INTO projects (
        user_id, project_name, client_name, project_type, 
        description, target_plc_vendor, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      RETURNING *
    `);
        try {
            const result = stmt.get(projectData.user_id, projectData.project_name.trim(), projectData.client_name?.trim() || null, projectData.project_type?.trim() || null, projectData.description?.trim() || null, projectData.target_plc_vendor?.toLowerCase() || null);
            return result;
        }
        catch (error) {
            console.error('Error creating project:', error);
            throw error;
        }
    }
    static getProjectsByUserId(userId) {
        const stmt = index_1.default.prepare(`
      SELECT * FROM projects 
      WHERE user_id = ? 
      ORDER BY updated_at DESC
    `);
        try {
            return stmt.all(userId);
        }
        catch (error) {
            console.error('Error fetching projects:', error);
            throw error;
        }
    }
    static getProjectById(projectId, userId) {
        const stmt = index_1.default.prepare(`
      SELECT * FROM projects 
      WHERE id = ? AND user_id = ?
    `);
        try {
            return stmt.get(projectId, userId) || null;
        }
        catch (error) {
            console.error('Error fetching project by ID:', error);
            throw error;
        }
    }
    static updateProject(projectId, userId, updates) {
        // Build dynamic SQL for updates
        const updateFields = [];
        const values = [];
        if (updates.project_name !== undefined) {
            updateFields.push('project_name = ?');
            values.push(updates.project_name.trim());
        }
        if (updates.client_name !== undefined) {
            updateFields.push('client_name = ?');
            values.push(updates.client_name?.trim() || null);
        }
        if (updates.project_type !== undefined) {
            updateFields.push('project_type = ?');
            values.push(updates.project_type?.trim() || null);
        }
        if (updates.description !== undefined) {
            updateFields.push('description = ?');
            values.push(updates.description?.trim() || null);
        }
        if (updates.target_plc_vendor !== undefined) {
            updateFields.push('target_plc_vendor = ?');
            values.push(updates.target_plc_vendor?.toLowerCase() || null);
        }
        if (updateFields.length === 0) {
            throw new Error('No valid fields provided to update');
        }
        updateFields.push('updated_at = CURRENT_TIMESTAMP');
        values.push(projectId, userId);
        const stmt = index_1.default.prepare(`
      UPDATE projects 
      SET ${updateFields.join(', ')} 
      WHERE id = ? AND user_id = ?
      RETURNING *
    `);
        try {
            return stmt.get(...values) || null;
        }
        catch (error) {
            console.error('Error updating project:', error);
            throw error;
        }
    }
    static updateAutosaveState(projectId, userId, autosaveState) {
        const stmt = index_1.default.prepare(`
      UPDATE projects 
      SET autosave_state = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND user_id = ?
    `);
        try {
            const result = stmt.run(JSON.stringify(autosaveState), projectId, userId);
            return result.changes > 0;
        }
        catch (error) {
            console.error('Error updating autosave state:', error);
            throw error;
        }
    }
    static deleteProject(projectId, userId) {
        const stmt = index_1.default.prepare(`
      DELETE FROM projects 
      WHERE id = ? AND user_id = ?
    `);
        try {
            const result = stmt.run(projectId, userId);
            return result.changes > 0;
        }
        catch (error) {
            console.error('Error deleting project:', error);
            throw error;
        }
    }
    static checkProjectOwnership(projectId, userId) {
        const stmt = index_1.default.prepare(`
      SELECT 1 FROM projects 
      WHERE id = ? AND user_id = ?
    `);
        try {
            const result = stmt.get(projectId, userId);
            return !!result;
        }
        catch (error) {
            console.error('Error checking project ownership:', error);
            throw error;
        }
    }
}
exports.ProjectsTable = ProjectsTable;
