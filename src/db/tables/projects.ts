import db from '../index';

export interface Project {
  id: number;
  user_id: string;
  project_name: string;
  client_name?: string;
  project_type?: string;
  description?: string;
  target_plc_vendor?: 'siemens' | 'rockwell' | 'beckhoff';
  autosave_state?: string; // JSON string
  created_at: string;
  updated_at: string;
}

export interface CreateProjectData {
  user_id: string;
  project_name: string;
  client_name?: string;
  project_type?: string;
  description?: string;
  target_plc_vendor?: 'siemens' | 'rockwell' | 'beckhoff';
}

export interface UpdateProjectData {
  project_name?: string;
  client_name?: string;
  project_type?: string;
  description?: string;
  target_plc_vendor?: 'siemens' | 'rockwell' | 'beckhoff';
}

export class ProjectsTable {
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
      db.exec(createTableSQL);
      createIndexSQL.forEach(indexSQL => db.exec(indexSQL));
      console.log('Projects table initialized successfully');
    } catch (error) {
      console.error('Error initializing projects table:', error);
      throw error;
    }
  }

  static createProject(projectData: CreateProjectData): Project {
    const stmt = db.prepare(`
      INSERT INTO projects (
        user_id, project_name, client_name, project_type, 
        description, target_plc_vendor, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      RETURNING *
    `);

    try {
      const result = stmt.get(
        projectData.user_id,
        projectData.project_name.trim(),
        projectData.client_name?.trim() || null,
        projectData.project_type?.trim() || null,
        projectData.description?.trim() || null,
        projectData.target_plc_vendor?.toLowerCase() || null
      ) as Project;
      
      return result;
    } catch (error) {
      console.error('Error creating project:', error);
      throw error;
    }
  }

  static getProjectsByUserId(userId: string): Project[] {
    const stmt = db.prepare(`
      SELECT * FROM projects 
      WHERE user_id = ? 
      ORDER BY updated_at DESC
    `);

    try {
      return stmt.all(userId) as Project[];
    } catch (error) {
      console.error('Error fetching projects:', error);
      throw error;
    }
  }

  static getProjectById(projectId: number, userId: string): Project | null {
    const stmt = db.prepare(`
      SELECT * FROM projects 
      WHERE id = ? AND user_id = ?
    `);

    try {
      return stmt.get(projectId, userId) as Project || null;
    } catch (error) {
      console.error('Error fetching project by ID:', error);
      throw error;
    }
  }

  static updateProject(projectId: number, userId: string, updates: UpdateProjectData): Project | null {
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

    const stmt = db.prepare(`
      UPDATE projects 
      SET ${updateFields.join(', ')} 
      WHERE id = ? AND user_id = ?
      RETURNING *
    `);

    try {
      return stmt.get(...values) as Project || null;
    } catch (error) {
      console.error('Error updating project:', error);
      throw error;
    }
  }

  static updateAutosaveState(projectId: number, userId: string, autosaveState: any): boolean {
    const stmt = db.prepare(`
      UPDATE projects 
      SET autosave_state = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ? AND user_id = ?
    `);

    try {
      const result = stmt.run(JSON.stringify(autosaveState), projectId, userId);
      return result.changes > 0;
    } catch (error) {
      console.error('Error updating autosave state:', error);
      throw error;
    }
  }

  static deleteProject(projectId: number, userId: string): boolean {
    const stmt = db.prepare(`
      DELETE FROM projects 
      WHERE id = ? AND user_id = ?
    `);

    try {
      const result = stmt.run(projectId, userId);
      return result.changes > 0;
    } catch (error) {
      console.error('Error deleting project:', error);
      throw error;
    }
  }

  static checkProjectOwnership(projectId: number, userId: string): boolean {
    const stmt = db.prepare(`
      SELECT 1 FROM projects 
      WHERE id = ? AND user_id = ?
    `);

    try {
      const result = stmt.get(projectId, userId);
      return !!result;
    } catch (error) {
      console.error('Error checking project ownership:', error);
      throw error;
    }
  }
}
