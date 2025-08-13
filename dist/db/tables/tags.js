"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TagsTable = void 0;
const index_1 = __importDefault(require("../index"));
class TagsTable {
    static initializeTable() {
        const createTableSQL = `
      CREATE TABLE IF NOT EXISTS tags (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        project_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('BOOL', 'INT', 'DINT', 'REAL', 'STRING', 'TIMER', 'COUNTER')),
        data_type TEXT,
        address TEXT NOT NULL,
        default_value TEXT DEFAULT '',
        vendor TEXT NOT NULL CHECK (vendor IN ('rockwell', 'siemens', 'beckhoff')),
        scope TEXT NOT NULL CHECK (scope IN ('global', 'local', 'input', 'output')),
        tag_type TEXT NOT NULL CHECK (tag_type IN ('input', 'output', 'memory', 'temp', 'constant')),
        is_ai_generated BOOLEAN DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now')),
        updated_at TEXT DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE(project_id, name)
      )
    `;
        index_1.default.prepare(createTableSQL).run();
        // Create indexes for better performance
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
            index_1.default.prepare(indexSQL).run();
        });
        console.log('✅ Tags table and indexes created successfully');
    }
    // Create a new tag
    static createTag(data) {
        const insertSQL = `
      INSERT INTO tags (
        project_id, user_id, name, description, type, data_type, address, 
        default_value, vendor, scope, tag_type, is_ai_generated
      ) VALUES (
        @project_id, @user_id, @name, @description, @type, @data_type, @address,
        @default_value, @vendor, @scope, @tag_type, @is_ai_generated
      )
    `;
        const stmt = index_1.default.prepare(insertSQL);
        const result = stmt.run({
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
            is_ai_generated: data.is_ai_generated ? 1 : 0
        });
        // Get the created tag
        const selectSQL = 'SELECT * FROM tags WHERE rowid = ?';
        return index_1.default.prepare(selectSQL).get(result.lastInsertRowid);
    }
    // Get tags with filters
    static getTags(filters) {
        let whereClause = 'WHERE 1=1';
        const params = {};
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
            whereClause += ' AND (name LIKE @search OR description LIKE @search)';
            params.search = `%${filters.search}%`;
        }
        // Get total count
        const countSQL = `SELECT COUNT(*) as total FROM tags ${whereClause}`;
        const countResult = index_1.default.prepare(countSQL).get(params);
        // Get paginated results
        let dataSQL = `SELECT * FROM tags ${whereClause} ORDER BY created_at DESC`;
        const page = filters.page || 1;
        const pageSize = filters.page_size || 50;
        const offset = (page - 1) * pageSize;
        dataSQL += ' LIMIT @limit OFFSET @offset';
        params.limit = pageSize;
        params.offset = offset;
        const tags = index_1.default.prepare(dataSQL).all(params);
        return {
            tags,
            total: countResult.total
        };
    }
    // Get tag by ID
    static getTagById(id, user_id) {
        let sql = 'SELECT * FROM tags WHERE id = ?';
        const params = [id];
        if (user_id) {
            sql += ' AND user_id = ?';
            params.push(user_id);
        }
        return index_1.default.prepare(sql).get(...params);
    }
    // Update tag
    static updateTag(id, data, user_id) {
        const updates = [];
        const params = { id };
        // Build dynamic update query
        Object.entries(data).forEach(([key, value]) => {
            if (value !== undefined) {
                if (key === 'is_ai_generated') {
                    updates.push(`${key} = @${key}`);
                    params[key] = value ? 1 : 0;
                }
                else {
                    updates.push(`${key} = @${key}`);
                    params[key] = value;
                }
            }
        });
        if (updates.length === 0) {
            return this.getTagById(id, user_id);
        }
        // Add updated_at
        updates.push('updated_at = datetime(\'now\')');
        let sql = `UPDATE tags SET ${updates.join(', ')} WHERE id = @id`;
        if (user_id) {
            sql += ' AND user_id = @user_id';
            params.user_id = user_id;
        }
        const result = index_1.default.prepare(sql).run(params);
        if (result.changes === 0) {
            return null; // No rows updated
        }
        return this.getTagById(id, user_id);
    }
    // Delete tag
    static deleteTag(id, user_id) {
        let sql = 'DELETE FROM tags WHERE id = ?';
        const params = [id];
        if (user_id) {
            sql += ' AND user_id = ?';
            params.push(user_id);
        }
        const result = index_1.default.prepare(sql).run(...params);
        return result.changes > 0;
    }
    // Delete all tags for a project
    static deleteTagsByProject(project_id, user_id) {
        let sql = 'DELETE FROM tags WHERE project_id = ?';
        const params = [project_id];
        if (user_id) {
            sql += ' AND user_id = ?';
            params.push(user_id);
        }
        const result = index_1.default.prepare(sql).run(...params);
        return result.changes;
    }
    // Get tag statistics
    static getTagStats(project_id, user_id) {
        let whereClause = 'WHERE 1=1';
        const params = {};
        if (project_id) {
            whereClause += ' AND project_id = @project_id';
            params.project_id = project_id;
        }
        if (user_id) {
            whereClause += ' AND user_id = @user_id';
            params.user_id = user_id;
        }
        const statsSQL = `
      SELECT 
        COUNT(*) as total_tags,
        COUNT(CASE WHEN is_ai_generated = 1 THEN 1 END) as ai_generated_tags,
        COUNT(CASE WHEN vendor = 'rockwell' THEN 1 END) as rockwell_tags,
        COUNT(CASE WHEN vendor = 'siemens' THEN 1 END) as siemens_tags,
        COUNT(CASE WHEN vendor = 'beckhoff' THEN 1 END) as beckhoff_tags,
        COUNT(CASE WHEN type = 'BOOL' THEN 1 END) as bool_tags,
        COUNT(CASE WHEN type = 'INT' THEN 1 END) as int_tags,
        COUNT(CASE WHEN type = 'REAL' THEN 1 END) as real_tags,
        COUNT(CASE WHEN tag_type = 'input' THEN 1 END) as input_tags,
        COUNT(CASE WHEN tag_type = 'output' THEN 1 END) as output_tags,
        COUNT(CASE WHEN tag_type = 'memory' THEN 1 END) as memory_tags
      FROM tags ${whereClause}
    `;
        return index_1.default.prepare(statsSQL).get(params);
    }
}
exports.TagsTable = TagsTable;
