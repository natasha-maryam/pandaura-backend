"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    // Create projects table
    await knex.schema.createTable('projects', (table) => {
        table.increments('id').primary();
        table.text('user_id').notNullable();
        table.text('project_name').notNullable();
        table.text('client_name');
        table.text('project_type');
        table.text('description');
        table.text('target_plc_vendor').checkIn(['siemens', 'rockwell', 'beckhoff']);
        table.jsonb('autosave_state');
        table.timestamps(true, true);
        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.index('user_id');
        table.index(['updated_at']);
    });
    // Create tags table
    await knex.schema.createTable('tags', (table) => {
        table.increments('id').primary();
        table.text('project_id').notNullable();
        table.text('name').notNullable();
        table.text('type');
        table.text('data_type');
        table.text('address');
        table.text('default_value');
        table.text('vendor');
        table.text('scope');
        table.unique(['project_id', 'name']);
    });
    // Create project_autosave table
    await knex.schema.createTable('project_autosave', (table) => {
        table.increments('id').primary();
        table.integer('project_id').notNullable();
        table.text('user_id').notNullable();
        table.jsonb('state').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
        table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');
        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.unique(['project_id', 'user_id']);
    });
    // Create project_versions table
    await knex.schema.createTable('project_versions', (table) => {
        table.increments('id').primary();
        table.integer('project_id').notNullable();
        table.text('user_id').notNullable();
        table.integer('version_number').notNullable();
        table.jsonb('data').notNullable();
        table.text('message');
        table.boolean('is_auto').defaultTo(false);
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');
        table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
        table.unique(['project_id', 'version_number']);
        table.index(['project_id', 'version_number']);
        table.index('user_id');
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists('project_versions');
    await knex.schema.dropTableIfExists('project_autosave');
    await knex.schema.dropTableIfExists('tags');
    await knex.schema.dropTableIfExists('projects');
}
