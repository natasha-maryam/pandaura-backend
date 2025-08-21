import * as Knex from 'knex';

export async function up(knex: Knex.Knex): Promise<void> {
  // First, change project_id from text to integer to match projects.id type
  await knex.schema.alterTable('tags', (table) => {
    table.integer('project_id_temp');
  });

  // Copy data from text project_id to integer project_id_temp
  await knex.raw(`UPDATE tags SET project_id_temp = CAST(project_id AS INTEGER) WHERE project_id ~ '^[0-9]+$'`);

  // Drop the old project_id column and rename the new one
  await knex.schema.alterTable('tags', (table) => {
    table.dropColumn('project_id');
  });

  await knex.schema.alterTable('tags', (table) => {
    table.renameColumn('project_id_temp', 'project_id');
  });

  // Add missing fields to tags table
  await knex.schema.alterTable('tags', (table) => {
    table.text('description');
    table.text('tag_type').defaultTo('memory');
    table.boolean('is_ai_generated').defaultTo(false);
    table.text('user_id');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Add foreign key constraints
  await knex.schema.alterTable('tags', (table) => {
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');
  });
}

export async function down(knex: Knex.Knex): Promise<void> {
  // Remove the added fields and foreign keys
  await knex.schema.alterTable('tags', (table) => {
    table.dropForeign(['user_id']);
    table.dropForeign(['project_id']);
    table.dropColumn('description');
    table.dropColumn('tag_type');
    table.dropColumn('is_ai_generated');
    table.dropColumn('user_id');
    table.dropColumn('created_at');
    table.dropColumn('updated_at');
  });

  // Revert project_id back to text
  await knex.schema.alterTable('tags', (table) => {
    table.text('project_id_temp');
  });

  await knex.raw(`UPDATE tags SET project_id_temp = CAST(project_id AS TEXT)`);

  await knex.schema.alterTable('tags', (table) => {
    table.dropColumn('project_id');
  });

  await knex.schema.alterTable('tags', (table) => {
    table.renameColumn('project_id_temp', 'project_id');
  });
}
