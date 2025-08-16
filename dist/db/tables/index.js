"use strict";
// src/db/tables/index.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.initializeTables = initializeTables;
const users_1 = require("./users");
const deviceBindings_1 = require("./deviceBindings");
const activityLog_1 = require("./activityLog");
const projects_1 = require("./projects");
const tags_1 = require("./tags");
const project_autosave_1 = require("./project_autosave");
const project_versions_1 = require("./project_versions");
function initializeTables() {
    (0, users_1.createOrganizationsTable)();
    (0, users_1.createUsersTable)();
    (0, users_1.createTeamMembersTable)();
    (0, users_1.createInvitesTable)();
    (0, deviceBindings_1.createDeviceBindingsTable)();
    (0, activityLog_1.createAuditLogsTable)();
    projects_1.ProjectsTable.initializeTable();
    tags_1.TagsTable.initializeTable();
    project_autosave_1.ProjectAutoSaveTable.initTable();
    project_versions_1.ProjectVersionsTable.initTable();
}
