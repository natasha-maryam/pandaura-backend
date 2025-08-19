import db from './knex';
import { v4 as uuidv4 } from 'uuid';

const DatabaseService = {
  // User operations
  async createUser(userData: {
    id?: string;
    email: string;
    passwordHash: string;
    firstName?: string;
    lastName?: string;
    name?: string;
    orgName?: string;
    industry?: string;
    role?: string;
  }) {
    const {
      id = uuidv4(),
      email,
      passwordHash,
      firstName,
      lastName,
      name,
      orgName,
      industry,
      role
    } = userData;

    const [user] = await db('users')
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

  async getUserByEmail(email: string) {
    return await db('users').where({ email }).first();
  },

  async getUserById(id: string) {
    return await db('users').where({ id }).first();
  },

  async updateUser(id: string, updates: any) {
    const [user] = await db('users')
      .where({ id })
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .returning('*');
    
    return user;
  },

  async getUsersByOrganization(organizationId: string) {
    const users = await db('team_members as tm')
      .join('users as u', 'tm.user_id', 'u.id')
      .select('u.*', 'tm.role as team_role')
      .where('tm.organization_id', organizationId);
    
    return users;
  },

  async getAllUsers() {
    return await db('users').select('*');
  },

  // Organization operations
  async createOrganization(orgData: {
    id?: string;
    name: string;
    description?: string;
    industry?: string;
    size?: string;
    country?: string;
    website?: string;
    created_by: string;
  }) {
    const {
      id = uuidv4(),
      name,
      description,
      industry,
      size,
      country,
      website,
      created_by
    } = orgData;

    const [organization] = await db('organizations')
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

  async getOrganizationById(id: string) {
    return await db('organizations').where({ id }).first();
  },

  async getAllOrganizations() {
    return await db('organizations').select('*');
  },

  async updateOrganization(id: string, updates: any) {
    const [organization] = await db('organizations')
      .where({ id })
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .returning('*');
    
    return organization;
  },

  async deleteOrganization(id: string) {
    const deleted = await db('organizations')
      .where({ id })
      .del();
    
    return deleted > 0;
  },

  async getOrganizationsByUser(userId: string) {
    const orgs = await db('team_members as tm')
      .join('organizations as o', 'tm.organization_id', 'o.id')
      .select('o.*', 'tm.role as user_role')
      .where('tm.user_id', userId);
    
    return orgs;
  },

  // Project operations
  async createProject(projectData: any) {
    const [project] = await db('projects')
      .insert({
        ...projectData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .returning('*');

    return project;
  },

  async getProjectsByUserId(userId: string) {
    const projects = await db('projects')
      .where({ user_id: userId })
      .orderBy('created_at', 'desc');
    
    return projects;
  },

  async getProjectById(projectId: number, userId: string) {
    const project = await db('projects')
      .where({ id: projectId, user_id: userId })
      .first();
    
    return project || null;
  },

  async getProjectByIdInternal(projectId: number) {
    const project = await db('projects')
      .where({ id: projectId })
      .first();
    
    return project || null;
  },

  async updateProject(projectId: number, updates: any) {
    const [project] = await db('projects')
      .where({ id: projectId })
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .returning('*');
    
    return project;
  },

  async deleteProject(projectId: number) {
    const deleted = await db('projects')
      .where({ id: projectId })
      .del();
    
    return deleted > 0;
  },

  async saveProjectAutosave(autosaveData: any) {
    const existingAutosave = await db('project_autosave')
      .where({ project_id: autosaveData.project_id, user_id: autosaveData.user_id })
      .first();

    if (existingAutosave) {
      const [updated] = await db('project_autosave')
        .where({ project_id: autosaveData.project_id, user_id: autosaveData.user_id })
        .update({
          data: JSON.stringify(autosaveData.data),
          updated_at: new Date().toISOString()
        })
        .returning('*');
      
      return updated;
    } else {
      const [created] = await db('project_autosave')
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

  async getProjectAutosave(projectId: number, userId: string) {
    const autosave = await db('project_autosave')
      .where({ project_id: projectId, user_id: userId })
      .first();
    
    if (autosave && autosave.data) {
      try {
        autosave.data = JSON.parse(autosave.data);
      } catch (error) {
        console.error('Error parsing autosave data:', error);
      }
    }
    
    return autosave || null;
  },

  // Team member operations
  async createTeamMember(memberData: {
    id?: string;
    user_id: string;
    organization_id: string;
    role: string;
    invited_by?: string;
  }) {
    const {
      id = uuidv4(),
      user_id,
      organization_id,
      role,
      invited_by
    } = memberData;

    const [member] = await db('team_members')
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

  async getTeamMemberByUserAndOrg(userId: string, organizationId: string) {
    const member = await db('team_members as tm')
      .join('organizations as o', 'tm.organization_id', 'o.id')
      .select('tm.*', 'o.name as org_name')
      .where('tm.user_id', userId)
      .where('tm.organization_id', organizationId)
      .first();
    
    return member || null;
  },

  async getTeamMembersByUser(userId: string) {
    const members = await db('team_members as tm')
      .join('organizations as o', 'tm.organization_id', 'o.id')
      .select('tm.*', 'o.name as org_name')
      .where('tm.user_id', userId);
    
    return members;
  },

  async getAdminCountByOrganization(organizationId: string) {
    const result = await db('team_members')
      .where({ organization_id: organizationId, role: 'Admin' })
      .count('* as count')
      .first();
    
    return Number(result?.count) || 0;
  },

  async removeTeamMember(userId: string, organizationId: string) {
    const deleted = await db('team_members')
      .where({ user_id: userId, organization_id: organizationId })
      .del();
    
    return deleted > 0;
  },

  async updateTeamMemberRole(userId: string, organizationId: string, role: string) {
    const [member] = await db('team_members')
      .where({ user_id: userId, organization_id: organizationId })
      .update({ 
        role, 
        updated_at: new Date().toISOString() 
      })
      .returning('*');
    
    return member;
  },

  // Invite operations
  async createInvite(inviteData: {
    id?: string;
    email: string;
    organization_id: string;
    role: string;
    invited_by: string;
    token: string;
    expires_at: string;
  }) {
    const {
      id = uuidv4(),
      email,
      organization_id,
      role,
      invited_by,
      token,
      expires_at
    } = inviteData;

    const [invite] = await db('invites')
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

  async getInviteByToken(token: string) {
    const invite = await db('invites as i')
      .join('organizations as o', 'i.organization_id', 'o.id')
      .join('users as u', 'i.invited_by', 'u.id')
      .select('i.*', 'o.name as org_name', 'u.first_name as inviter_first_name', 'u.last_name as inviter_last_name')
      .where('i.token', token)
      .first();
    
    return invite || null;
  },

  async getInviteById(id: string) {
    const invite = await db('invites')
      .where({ id })
      .first();
    
    return invite || null;
  },

  async getInvitesByOrganization(organizationId: string) {
    const invites = await db('invites as i')
      .join('users as u', 'i.invited_by', 'u.id')
      .select('i.*', 'u.first_name as inviter_first_name', 'u.last_name as inviter_last_name')
      .where('i.organization_id', organizationId)
      .orderBy('i.created_at', 'desc');
    
    return invites;
  },

  async deleteInvite(id: string) {
    const deleted = await db('invites')
      .where({ id })
      .del();
    
    return deleted > 0;
  },

  // Activity log operations
  async createActivityLog(logData: {
    id?: string;
    user_id: string;
    organization_id: string;
    action: string;
    details?: string;
    ip_address?: string;
    user_agent?: string;
  }) {
    const {
      id = uuidv4(),
      user_id,
      organization_id,
      action,
      details,
      ip_address,
      user_agent
    } = logData;

    const [log] = await db('activity_logs')
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

  async getActivityLogByOrganization(organizationId: string, limit: number = 50, offset: number = 0) {
    const logs = await db('activity_logs as al')
      .join('users as u', 'al.user_id', 'u.id')
      .select('al.*', 'u.first_name', 'u.last_name', 'u.email')
      .where('al.organization_id', organizationId)
      .orderBy('al.created_at', 'desc')
      .limit(limit)
      .offset(offset);

    return logs;
  },

  // Additional organization methods
  async getOrganizationMembers(organizationId: string) {
    const members = await db('team_members as tm')
      .join('users as u', 'tm.user_id', 'u.id')
      .select('tm.*', 'u.first_name', 'u.last_name', 'u.email')
      .where('tm.organization_id', organizationId);
    
    return members;
  },

  async getUserByEmailForOrg(email: string, organizationId: string) {
    const user = await db('users as u')
      .join('team_members as tm', 'u.id', 'tm.user_id')
      .select('u.*')
      .where('u.email', email)
      .where('tm.organization_id', organizationId)
      .first();
    
    return user || null;
  },

  async deleteInviteByIdAndOrg(inviteId: string, organizationId: string) {
    const deleted = await db('invites')
      .where({ id: inviteId, organization_id: organizationId })
      .del();
    
    return deleted > 0;
  },

  async getActivityLogCount(organizationId: string) {
    const result = await db('activity_logs')
      .where('organization_id', organizationId)
      .count('* as count')
      .first();
    
    return Number(result?.count) || 0;
  },

  async getActivityLogs(organizationId: string, userId?: string, limit?: number, offset?: number) {
    let query = db('activity_logs as al')
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
  async getVersionHistory(projectId: number) {
    const versions = await db('project_versions')
      .where('project_id', projectId)
      .orderBy('version_number', 'desc');
    
    return versions;
  },

  async createProjectSnapshot(projectId: number, userId: string, message?: string, isAuto: boolean = false) {
    // Get the current project data
    const project = await db('projects').where('id', projectId).first();
    if (!project) {
      throw new Error('Project not found');
    }

    // Get the next version number
    const lastVersion = await db('project_versions')
      .where('project_id', projectId)
      .orderBy('version_number', 'desc')
      .first();
    
    const nextVersionNumber = (lastVersion?.version_number || 0) + 1;

    // Create snapshot data
    const snapshotData = {
      projectMetadata: project,
      timestamp: new Date().toISOString(),
      tags: await db('tags').where('project_id', projectId),
    };

    // Insert the new version
    const [version] = await db('project_versions')
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

  async getVersion(projectId: number, versionNumber: number) {
    const version = await db('project_versions')
      .where({ project_id: projectId, version_number: versionNumber })
      .first();
    
    if (version && version.data) {
      try {
        version.data = JSON.parse(version.data);
      } catch (error) {
        console.error('Error parsing version data:', error);
      }
    }
    
    return version || null;
  },

  async rollbackToVersion(projectId: number, targetVersion: number, userId: string) {
    // Get the target version data
    const targetVersionData = await this.getVersion(projectId, targetVersion);
    if (!targetVersionData) {
      throw new Error('Target version not found');
    }

    // Create a new version with the target version's data
    const newVersionNumber = await this.createProjectSnapshot(
      projectId,
      userId,
      `Rollback to version ${targetVersion}`,
      false
    );

    return {
      rolledBackTo: targetVersion,
      newVersion: newVersionNumber
    };
  },

  async deleteVersion(projectId: number, versionNumber: number, userId: string) {
    // Check if this is the only version
    const totalVersions = await db('project_versions')
      .where('project_id', projectId)
      .count('* as count')
      .first();

    if (Number(totalVersions?.count) <= 1) {
      throw new Error('Cannot delete the only version of a project');
    }

    // Delete the version
    const deleted = await db('project_versions')
      .where({ project_id: projectId, version_number: versionNumber })
      .del();

    if (deleted === 0) {
      throw new Error('Version not found');
    }

    return true;
  },

  // Tag operations
  async getTagsByProjectId(projectId: string) {
    const tags = await db('tags')
      .where('project_id', projectId)
      .orderBy('created_at', 'desc');
    
    return tags;
  },

  async createTag(tagData: any) {
    const [tag] = await db('tags')
      .insert({
        ...tagData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .returning('*');

    return tag;
  },

  async updateTag(tagId: string, updates: any) {
    const [tag] = await db('tags')
      .where({ id: tagId })
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .returning('*');
    
    return tag;
  },

  async deleteTag(tagId: string) {
    const deleted = await db('tags')
      .where({ id: tagId })
      .del();
    
    return deleted > 0;
  },

  async deleteTagsByProjectId(projectId: string) {
    const deleted = await db('tags')
      .where({ project_id: projectId })
      .del();
    
    return deleted;
  },

  async closeConnection() {
    await db.destroy();
  }
};

export default DatabaseService;
