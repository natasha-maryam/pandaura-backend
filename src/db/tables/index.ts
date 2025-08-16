// src/db/tables/index.ts

import { createUsersTable, createOrganizationsTable, createTeamMembersTable, createInvitesTable } from './users';
import { createDeviceBindingsTable } from './deviceBindings';
import { createAuditLogsTable } from './activityLog';
import { ProjectsTable } from './projects';
import { TagsTable } from './tags';
import { ProjectAutoSaveTable } from './project_autosave';
import { ProjectVersionsTable } from './project_versions';

export function initializeTables() {
  createOrganizationsTable();
  createUsersTable();
  createTeamMembersTable();
  createInvitesTable();
  createDeviceBindingsTable();
  createAuditLogsTable();
  ProjectsTable.initializeTable();
  TagsTable.initializeTable();
  ProjectAutoSaveTable.initTable();
  ProjectVersionsTable.initTable();
}
