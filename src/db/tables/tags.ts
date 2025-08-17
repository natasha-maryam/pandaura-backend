import db from '../index';
import { v4 as uuidv4 } from 'uuid';

export interface Tag {
  id: string;
  project_id: number;
  user_id: string;
  name: string;
  description: string;
  type: 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'STRING';
  data_type: string;
  address: string;
  default_value: string;
  vendor: 'rockwell' | 'siemens' | 'beckhoff';
  scope: 'global' | 'local' | 'input' | 'output';
  tag_type: 'input' | 'output' | 'memory' | 'temp' | 'constant';
  is_ai_generated: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateTagData {
  project_id: number;
  user_id: string;
  name: string;
  description: string;
  type: 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'STRING';
  data_type?: string;
  address: string;
  default_value?: string;
  vendor: 'rockwell' | 'siemens' | 'beckhoff';
  scope: 'global' | 'local' | 'input' | 'output';
  tag_type: 'input' | 'output' | 'memory' | 'temp' | 'constant';
  is_ai_generated?: boolean;
}

export interface UpdateTagData {
  name?: string;
  description?: string;
  type?: 'BOOL' | 'INT' | 'DINT' | 'REAL' | 'STRING';
  data_type?: string;
  address?: string;
  default_value?: string;
  vendor?: 'rockwell' | 'siemens' | 'beckhoff';
  scope?: 'global' | 'local' | 'input' | 'output';
  tag_type?: 'input' | 'output' | 'memory' | 'temp' | 'constant';
  is_ai_generated?: boolean;
}

export class TagsTable {
  static initializeTable(): void {
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY,
        project_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('BOOL', 'INT', 'DINT', 'REAL', 'STRING')),
        data_type TEXT,
        address TEXT NOT NULL,
        default_value TEXT DEFAULT '',
        vendor TEXT NOT NULL CHECK (vendor IN ('rockwell', 'siemens', 'beckhoff')),
        scope TEXT NOT NULL CHECK (scope IN ('global', 'local', 'input', 'output')),
        tag_type TEXT NOT NULL CHECK (tag_type IN ('input', 'output', 'memory', 'temp', 'constant')),
        is_ai_generated BOOLEAN DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(project_id, name)
      )
    `;
    
    db.prepare(createTableSQL).run();

    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_tags_project_id ON tags(project_id)',
      'CREATE INDEX IF NOT EXISTS idx_tags_user_id ON tags(user_id)',
      'CREATE INDEX IF NOT EXISTS idx_tags_vendor ON tags(vendor)',
      'CREATE INDEX IF NOT EXISTS idx_tags_type ON tags(type)',
      'CREATE INDEX IF NOT EXISTS idx_tags_scope ON tags(scope)',
      'CREATE INDEX IF NOT EXISTS idx_tags_tag_type ON tags(tag_type)',
      'CREATE INDEX IF NOT EXISTS idx_tags_is_ai_generated ON tags(is_ai_generated)'
    ];

    indexes.forEach(indexSQL => {
      db.prepare(indexSQL).run();
    });

    console.log('✅ Tags table and indexes initialized');
  }

  static create(data: CreateTagData): Tag {
    const id = uuidv4();
    const now = new Date().toISOString();

    const stmt = db.prepare(`
      INSERT INTO tags (
        id,
        project_id,
        user_id,
        name,
        description,
        type,
        data_type,
        address,
        default_value,
        vendor,
        scope,
        tag_type,
        is_ai_generated,
        created_at,
        updated_at
      ) VALUES (
        @id,
        @project_id,
        @user_id,
        @name,
        @description,
        @type,
        @data_type,
        @address,
        @default_value,
        @vendor,
        @scope,
        @tag_type,
        @is_ai_generated,
        @created_at,
        @updated_at
      )
    `);

    stmt.run({
      id,
      project_id: data.project_id,
      user_id: data.user_id,
      name: data.name,
      description: data.description,
      type: data.type,
      data_type: data.data_type || data.type,
      address: data.address,
      default_value: data.default_value || '',
      vendor: data.vendor,
      scope: data.scope,
      tag_type: data.tag_type,
      is_ai_generated: data.is_ai_generated ? 1 : 0,
      created_at: now,
      updated_at: now
    });

    return this.getById(id);
  }

  static createTag(data: CreateTagData): Tag {
    return this.create(data);
  }

  static getById(id: string): Tag {
    const stmt = db.prepare('SELECT * FROM tags WHERE id = ?');
    const row = stmt.get(id) as any;
    
    if (!row) throw new Error('Tag not found');

    return {
      ...row,
      is_ai_generated: Boolean(row.is_ai_generated)
    };
  }

  static getByProjectId(projectId: number): Tag[] {
    const stmt = db.prepare('SELECT * FROM tags WHERE project_id = ? ORDER BY name');
    const rows = stmt.all(projectId) as any[];
    return rows.map(row => ({
      ...row,
      is_ai_generated: Boolean(row.is_ai_generated)
    }));
  }

  static update(id: string, data: UpdateTagData): Tag {
    const updates = Object.entries(data)
      .filter(([_, value]) => value !== undefined)
      .map(([key, _]) => `${key} = @${key}`)
      .join(', ');

    if (!updates) return this.getById(id);

    const sql = `
      UPDATE tags
      SET ${updates}, updated_at = @updated_at
      WHERE id = @id
    `;

    const stmt = db.prepare(sql);
    const now = new Date().toISOString();
    
    stmt.run({
      ...data,
      id,
      updated_at: now,
      is_ai_generated: data.is_ai_generated ? 1 : 0
    });

    return this.getById(id);
  }

  static delete(id: string): void {
    const stmt = db.prepare('DELETE FROM tags WHERE id = ?');
    stmt.run(id);
  }

  static getTags(filters: {
    project_id?: number;
    user_id?: string;
    vendor?: string;
    type?: string;
    data_type?: string;
    scope?: string;
    tag_type?: string;
    is_ai_generated?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): { tags: Tag[]; total: number } {
    let whereClause = 'WHERE 1=1';
    const params: Record<string, any> = {};

    if (filters.project_id) {
      whereClause += ' AND project_id = @project_id';
      params.project_id = filters.project_id;
    }

    if (filters.user_id) {
      whereClause += ' AND user_id = @user_id';
      params.user_id = filters.user_id;
    }

    if (filters.vendor) {
      whereClause += ' AND vendor = @vendor';
      params.vendor = filters.vendor;
    }

    if (filters.type) {
      whereClause += ' AND type = @type';
      params.type = filters.type;
    }

    if (filters.data_type) {
      whereClause += ' AND data_type = @data_type';
      params.data_type = filters.data_type;
    }

    if (filters.scope) {
      whereClause += ' AND scope = @scope';
      params.scope = filters.scope;
    }

    if (filters.tag_type) {
      whereClause += ' AND tag_type = @tag_type';
      params.tag_type = filters.tag_type;
    }

    if (filters.is_ai_generated !== undefined) {
      whereClause += ' AND is_ai_generated = @is_ai_generated';
      params.is_ai_generated = filters.is_ai_generated ? 1 : 0;
    }

    if (filters.search) {
      whereClause += ' AND (name LIKE @search OR description LIKE @search OR address LIKE @search)';
      params.search = `%${filters.search}%`;
    }

    const page = filters.page || 1;
    const pageSize = filters.page_size || 50;
    const offset = (page - 1) * pageSize;

    // Get total count
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM tags ${whereClause}`);
    const { total } = countStmt.get(params) as { total: number };

    // Get paginated results
    const dataStmt = db.prepare(
      `SELECT * FROM tags ${whereClause} ORDER BY created_at DESC LIMIT @limit OFFSET @offset`
    );
    const rows = dataStmt.all({ ...params, limit: pageSize, offset }) as any[];

    return {
      tags: rows.map(row => ({
        ...row,
        is_ai_generated: Boolean(row.is_ai_generated)
      })),
      total
    };
  }

  static search(term: string, projectId?: number): Tag[] {
    let sql = 'SELECT * FROM tags WHERE (name LIKE ? OR description LIKE ? OR address LIKE ?)';
    const params: any[] = [`%${term}%`, `%${term}%`, `%${term}%`];

    if (projectId) {
      sql += ' AND project_id = ?';
      params.push(projectId);
    }

    sql += ' ORDER BY name LIMIT 100';

    const stmt = db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      ...row,
      is_ai_generated: Boolean(row.is_ai_generated)
    }));
  }

  static count(projectId?: number): number {
    let sql = 'SELECT COUNT(*) as count FROM tags';
    const params: any[] = [];

    if (projectId) {
      sql += ' WHERE project_id = ?';
      params.push(projectId);
    }

    const stmt = db.prepare(sql);
    const result = stmt.get(...params) as { count: number };
    return result.count;
  }
}
