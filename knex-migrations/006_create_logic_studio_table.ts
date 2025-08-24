import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Create logic_studio table for storing current Logic Studio state
  await knex.schema.createTable('logic_studio', (table) => {
    table.increments('id').primary();
    table.integer('project_id').notNullable();
    table.text('user_id').notNullable();
    table.text('code').notNullable().defaultTo(''); // The PLC logic/program code
    table.text('ai_prompt').defaultTo(''); // AI prompt text
    table.text('vendor').defaultTo('siemens'); // PLC vendor selection
    table.jsonb('ui_state').defaultTo('{}'); // UI preferences (collapse level, panels, etc.)
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Foreign key constraints
    table.foreign('project_id').references('id').inTable('projects').onDelete('CASCADE');
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Ensure one Logic Studio record per project
    table.unique(['project_id']);
    
    // Indexes for performance
    table.index('project_id');
    table.index('user_id');
    table.index('updated_at');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('logic_studio');
}
