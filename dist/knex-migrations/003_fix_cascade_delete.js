"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    // Drop the existing foreign key constraint and add a new one with CASCADE
    await knex.schema.alterTable("users", (table) => {
        // Drop the existing foreign key
        table.dropForeign(["org_id"]);
        // Add new foreign key with CASCADE delete
        table
            .foreign("org_id")
            .references("id")
            .inTable("organizations")
            .onDelete("CASCADE");
    });
    console.log("✅ Updated users table foreign key to CASCADE on delete");
}
async function down(knex) {
    // Revert back to SET NULL
    await knex.schema.alterTable("users", (table) => {
        // Drop the CASCADE foreign key
        table.dropForeign(["org_id"]);
        // Add back the SET NULL foreign key
        table
            .foreign("org_id")
            .references("id")
            .inTable("organizations")
            .onDelete("SET NULL");
    });
    console.log("✅ Reverted users table foreign key to SET NULL on delete");
}
