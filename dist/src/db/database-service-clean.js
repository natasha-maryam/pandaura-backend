"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const knex_1 = __importDefault(require("./knex"));
const uuid_1 = require("uuid");
const DatabaseService = {
    // User operations
    async createUser(userData) {
        const { id = (0, uuid_1.v4)(), email, passwordHash, firstName, lastName, name, orgName, industry, role } = userData;
        const [user] = await (0, knex_1.default)('users')
            .insert({
            id,
            email,
            password_hash: passwordHash,
            first_name: firstName,
            last_name: lastName,
            name,
            org_name: orgName,
            industry,
            role,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .returning('*');
        return user;
    },
    async getUserByEmail(email) {
        return await (0, knex_1.default)('users').where({ email }).first();
    },
    async getUserById(id) {
        return await (0, knex_1.default)('users').where({ id }).first();
    },
    async updateUser(id, updates) {
        const [user] = await (0, knex_1.default)('users')
            .where({ id })
            .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
            .returning('*');
        return user;
    },
    async getUsersByOrganization(organizationId) {
        const users = await (0, knex_1.default)('team_members as tm')
            .join('users as u', 'tm.user_id', 'u.id')
            .select('u.*', 'tm.role as team_role')
            .where('tm.organization_id', organizationId);
        return users;
    },
    async getAllUsers() {
        return await (0, knex_1.default)('users').select('*');
    },
    // Organization operations
    async createOrganization(orgData) {
        const { id = (0, uuid_1.v4)(), name, description, industry, size, country, website, created_by } = orgData;
        const [organization] = await (0, knex_1.default)('organizations')
            .insert({
            id,
            name,
            description,
            industry,
            size,
            country,
            website,
            created_by,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .returning('*');
        return organization;
    },
    async getOrganizationById(id) {
        return await (0, knex_1.default)('organizations').where({ id }).first();
    },
    async getAllOrganizations() {
        return await (0, knex_1.default)('organizations').select('*');
    },
    async updateOrganization(id, updates) {
        const [organization] = await (0, knex_1.default)('organizations')
            .where({ id })
            .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
            .returning('*');
        return organization;
    },
    async deleteOrganization(id) {
        const deleted = await (0, knex_1.default)('organizations')
            .where({ id })
            .del();
        return deleted > 0;
    },
    async getOrganizationsByUser(userId) {
        const orgs = await (0, knex_1.default)('team_members as tm')
            .join('organizations as o', 'tm.organization_id', 'o.id')
            .select('o.*', 'tm.role as user_role')
            .where('tm.user_id', userId);
        return orgs;
    },
    // Project operations
    async createProject(projectData) {
        const [project] = await (0, knex_1.default)('projects')
            .insert({
            ...projectData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .returning('*');
        return project;
    },
    async getProjectsByUserId(userId) {
        const projects = await (0, knex_1.default)('projects')
            .where({ user_id: userId })
            .orderBy('created_at', 'desc');
        return projects;
    },
    async getProjectById(projectId, userId) {
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId, user_id: userId })
            .first();
        return project || null;
    },
    async getProjectByIdInternal(projectId) {
        const project = await (0, knex_1.default)('projects')
            .where({ id: projectId })
            .first();
        return project || null;
    },
    async updateProject(projectId, updates) {
        const [project] = await (0, knex_1.default)('projects')
            .where({ id: projectId })
            .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
            .returning('*');
        return project;
    },
    async deleteProject(projectId) {
        const deleted = await (0, knex_1.default)('projects')
            .where({ id: projectId })
            .del();
        return deleted > 0;
    },
    async saveProjectAutosave(autosaveData) {
        const existingAutosave = await (0, knex_1.default)('project_autosave')
            .where({ project_id: autosaveData.project_id, user_id: autosaveData.user_id })
            .first();
        if (existingAutosave) {
            const [updated] = await (0, knex_1.default)('project_autosave')
                .where({ project_id: autosaveData.project_id, user_id: autosaveData.user_id })
                .update({
                data: JSON.stringify(autosaveData.data),
                updated_at: new Date().toISOString()
            })
                .returning('*');
            return updated;
        }
        else {
            const [created] = await (0, knex_1.default)('project_autosave')
                .insert({
                project_id: autosaveData.project_id,
                user_id: autosaveData.user_id,
                data: JSON.stringify(autosaveData.data),
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            })
                .returning('*');
            return created;
        }
    },
    async getProjectAutosave(projectId, userId) {
        const autosave = await (0, knex_1.default)('project_autosave')
            .where({ project_id: projectId, user_id: userId })
            .first();
        if (autosave && autosave.data) {
            try {
                autosave.data = JSON.parse(autosave.data);
            }
            catch (error) {
                console.error('Error parsing autosave data:', error);
            }
        }
        return autosave || null;
    },
    // Team member operations
    async createTeamMember(memberData) {
        const { id = (0, uuid_1.v4)(), user_id, organization_id, role, invited_by } = memberData;
        const [member] = await (0, knex_1.default)('team_members')
            .insert({
            id,
            user_id,
            organization_id,
            role,
            invited_by,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .returning('*');
        return member;
    },
    async getTeamMemberByUserAndOrg(userId, organizationId) {
        const member = await (0, knex_1.default)('team_members as tm')
            .join('organizations as o', 'tm.organization_id', 'o.id')
            .select('tm.*', 'o.name as org_name')
            .where('tm.user_id', userId)
            .where('tm.organization_id', organizationId)
            .first();
        return member || null;
    },
    async getTeamMembersByUser(userId) {
        const members = await (0, knex_1.default)('team_members as tm')
            .join('organizations as o', 'tm.organization_id', 'o.id')
            .select('tm.*', 'o.name as org_name')
            .where('tm.user_id', userId);
        return members;
    },
    async getAdminCountByOrganization(organizationId) {
        const result = await (0, knex_1.default)('team_members')
            .where({ organization_id: organizationId, role: 'Admin' })
            .count('* as count')
            .first();
        return Number(result?.count) || 0;
    },
    async removeTeamMember(userId, organizationId) {
        const deleted = await (0, knex_1.default)('team_members')
            .where({ user_id: userId, organization_id: organizationId })
            .del();
        return deleted > 0;
    },
    async updateTeamMemberRole(userId, organizationId, role) {
        const [member] = await (0, knex_1.default)('team_members')
            .where({ user_id: userId, organization_id: organizationId })
            .update({
            role,
            updated_at: new Date().toISOString()
        })
            .returning('*');
        return member;
    },
    // Invite operations
    async createInvite(inviteData) {
        const { id = (0, uuid_1.v4)(), email, organization_id, role, invited_by, token, expires_at } = inviteData;
        const [invite] = await (0, knex_1.default)('invites')
            .insert({
            id,
            email,
            organization_id,
            role,
            invited_by,
            token,
            expires_at,
            created_at: new Date().toISOString()
        })
            .returning('*');
        return invite;
    },
    async getInviteByToken(token) {
        const invite = await (0, knex_1.default)('invites as i')
            .join('organizations as o', 'i.organization_id', 'o.id')
            .join('users as u', 'i.invited_by', 'u.id')
            .select('i.*', 'o.name as org_name', 'u.first_name as inviter_first_name', 'u.last_name as inviter_last_name')
            .where('i.token', token)
            .first();
        return invite || null;
    },
    async getInviteById(id) {
        const invite = await (0, knex_1.default)('invites')
            .where({ id })
            .first();
        return invite || null;
    },
    async getInvitesByOrganization(organizationId) {
        const invites = await (0, knex_1.default)('invites as i')
            .join('users as u', 'i.invited_by', 'u.id')
            .select('i.*', 'u.first_name as inviter_first_name', 'u.last_name as inviter_last_name')
            .where('i.organization_id', organizationId)
            .orderBy('i.created_at', 'desc');
        return invites;
    },
    async deleteInvite(id) {
        const deleted = await (0, knex_1.default)('invites')
            .where({ id })
            .del();
        return deleted > 0;
    },
    // Activity log operations
    async createActivityLog(logData) {
        const { id = (0, uuid_1.v4)(), user_id, organization_id, action, details, ip_address, user_agent } = logData;
        const [log] = await (0, knex_1.default)('activity_logs')
            .insert({
            id,
            user_id,
            organization_id,
            action,
            details,
            ip_address,
            user_agent,
            created_at: new Date().toISOString()
        })
            .returning('*');
        return log;
    },
    async getActivityLogByOrganization(organizationId, limit = 50, offset = 0) {
        const logs = await (0, knex_1.default)('activity_logs as al')
            .join('users as u', 'al.user_id', 'u.id')
            .select('al.*', 'u.first_name', 'u.last_name', 'u.email')
            .where('al.organization_id', organizationId)
            .orderBy('al.created_at', 'desc')
            .limit(limit)
            .offset(offset);
        return logs;
    },
    // Additional organization methods
    async getOrganizationMembers(organizationId) {
        const members = await (0, knex_1.default)('team_members as tm')
            .join('users as u', 'tm.user_id', 'u.id')
            .select('tm.*', 'u.first_name', 'u.last_name', 'u.email')
            .where('tm.organization_id', organizationId);
        return members;
    },
    async getUserByEmailForOrg(email, organizationId) {
        const user = await (0, knex_1.default)('users as u')
            .join('team_members as tm', 'u.id', 'tm.user_id')
            .select('u.*')
            .where('u.email', email)
            .where('tm.organization_id', organizationId)
            .first();
        return user || null;
    },
    async deleteInviteByIdAndOrg(inviteId, organizationId) {
        const deleted = await (0, knex_1.default)('invites')
            .where({ id: inviteId, organization_id: organizationId })
            .del();
        return deleted > 0;
    },
    async getActivityLogCount(organizationId) {
        const result = await (0, knex_1.default)('activity_logs')
            .where('organization_id', organizationId)
            .count('* as count')
            .first();
        return Number(result?.count) || 0;
    },
    async getActivityLogs(organizationId, userId, limit, offset) {
        let query = (0, knex_1.default)('activity_logs as al')
            .join('users as u', 'al.user_id', 'u.id')
            .select('al.*', 'u.first_name', 'u.last_name', 'u.email')
            .where('al.organization_id', organizationId)
            .orderBy('al.created_at', 'desc');
        if (userId) {
            query = query.where('al.user_id', userId);
        }
        if (limit) {
            query = query.limit(limit);
        }
        if (offset) {
            query = query.offset(offset);
        }
        return await query;
    },
    // Project Version methods
    async getVersionHistory(projectId) {
        const versions = await (0, knex_1.default)('project_versions')
            .where('project_id', projectId)
            .orderBy('version_number', 'desc');
        return versions;
    },
    async createProjectSnapshot(projectId, userId, message, isAuto = false) {
        // Get the current project data
        const project = await (0, knex_1.default)('projects').where('id', projectId).first();
        if (!project) {
            throw new Error('Project not found');
        }
        // Get the next version number
        const lastVersion = await (0, knex_1.default)('project_versions')
            .where('project_id', projectId)
            .orderBy('version_number', 'desc')
            .first();
        const nextVersionNumber = (lastVersion?.version_number || 0) + 1;
        // Create snapshot data
        const snapshotData = {
            projectMetadata: project,
            timestamp: new Date().toISOString(),
            tags: await (0, knex_1.default)('tags').where('project_id', projectId),
        };
        // Insert the new version
        const [version] = await (0, knex_1.default)('project_versions')
            .insert({
            project_id: projectId,
            user_id: userId,
            version_number: nextVersionNumber,
            data: JSON.stringify(snapshotData),
            message: message || null,
            is_auto: isAuto,
            created_at: new Date().toISOString()
        })
            .returning('version_number');
        return nextVersionNumber;
    },
    async getVersion(projectId, versionNumber) {
        const version = await (0, knex_1.default)('project_versions')
            .where({ project_id: projectId, version_number: versionNumber })
            .first();
        if (version && version.data) {
            try {
                version.data = JSON.parse(version.data);
            }
            catch (error) {
                console.error('Error parsing version data:', error);
            }
        }
        return version || null;
    },
    async rollbackToVersion(projectId, targetVersion, userId) {
        // Get the target version data
        const targetVersionData = await this.getVersion(projectId, targetVersion);
        if (!targetVersionData) {
            throw new Error('Target version not found');
        }
        // Create a new version with the target version's data
        const newVersionNumber = await this.createProjectSnapshot(projectId, userId, `Rollback to version ${targetVersion}`, false);
        return {
            rolledBackTo: targetVersion,
            newVersion: newVersionNumber
        };
    },
    async deleteVersion(projectId, versionNumber, userId) {
        // Check if this is the only version
        const totalVersions = await (0, knex_1.default)('project_versions')
            .where('project_id', projectId)
            .count('* as count')
            .first();
        if (Number(totalVersions?.count) <= 1) {
            throw new Error('Cannot delete the only version of a project');
        }
        // Delete the version
        const deleted = await (0, knex_1.default)('project_versions')
            .where({ project_id: projectId, version_number: versionNumber })
            .del();
        if (deleted === 0) {
            throw new Error('Version not found');
        }
        return true;
    },
    // Tag operations
    async getTagsByProjectId(projectId) {
        const tags = await (0, knex_1.default)('tags')
            .where('project_id', projectId)
            .orderBy('created_at', 'desc');
        return tags;
    },
    async createTag(tagData) {
        const [tag] = await (0, knex_1.default)('tags')
            .insert({
            ...tagData,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
            .returning('*');
        return tag;
    },
    async updateTag(tagId, updates) {
        const [tag] = await (0, knex_1.default)('tags')
            .where({ id: tagId })
            .update({
            ...updates,
            updated_at: new Date().toISOString()
        })
            .returning('*');
        return tag;
    },
    async deleteTag(tagId) {
        const deleted = await (0, knex_1.default)('tags')
            .where({ id: tagId })
            .del();
        return deleted > 0;
    },
    async deleteTagsByProjectId(projectId) {
        const deleted = await (0, knex_1.default)('tags')
            .where({ project_id: projectId })
            .del();
        return deleted;
    },
    async closeConnection() {
        await knex_1.default.destroy();
    }
};
exports.default = DatabaseService;
