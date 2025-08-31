"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    await knex.schema.alterTable('logic_studio', (table) => {
        // Remove vendor column
        table.dropColumn('vendor');
        // Add version_id column
        table.integer('version_id').nullable().references('id').inTable('project_versions').onDelete('SET NULL');
        // Add index for better performance
        table.index('version_id');
    });
    console.log('✅ Updated logic_studio table: removed vendor, added version_id');
}
async function down(knex) {
    await knex.schema.alterTable('logic_studio', (table) => {
        // Remove version_id column
        table.dropIndex('version_id');
        table.dropColumn('version_id');
        // Add back vendor column
        table.text('vendor').defaultTo('siemens');
    });
    console.log('✅ Reverted logic_studio table: added vendor, removed version_id');
}
