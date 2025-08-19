import { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
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

export async function down(knex: Knex): Promise<void> {
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
