import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  // Modify device_bindings table to support temporary bindings during signup
  await knex.schema.alterTable("device_bindings", (table) => {
    // Add email field for temporary bindings
    table.text("email");
    
    // Add expires_at for temporary bindings cleanup
    table.timestamp("expires_at");
    
    // Make user_id nullable to allow temporary bindings
    table.text("user_id").nullable().alter();
    
    // Add index for email lookups
    table.index(["email"]);
    table.index(["expires_at"]);
  });

  // Drop the unique constraint on user_id and device_fingerprint
  await knex.schema.alterTable("device_bindings", (table) => {
    table.dropUnique(["user_id", "device_fingerprint"]);
  });

  // Add new unique constraint that allows nulls for user_id
  await knex.raw(`
    CREATE UNIQUE INDEX device_bindings_user_fingerprint_unique 
    ON device_bindings (user_id, device_fingerprint) 
    WHERE user_id IS NOT NULL
  `);

  // Add unique constraint for temporary bindings (email + fingerprint)
  await knex.raw(`
    CREATE UNIQUE INDEX device_bindings_email_fingerprint_unique 
    ON device_bindings (email, device_fingerprint) 
    WHERE email IS NOT NULL
  `);
}

export async function down(knex: Knex): Promise<void> {
  // Drop the conditional unique indexes
  await knex.raw(`DROP INDEX IF EXISTS device_bindings_user_fingerprint_unique`);
  await knex.raw(`DROP INDEX IF EXISTS device_bindings_email_fingerprint_unique`);
  
  await knex.schema.alterTable("device_bindings", (table) => {
    // Remove new fields
    table.dropColumn("email");
    table.dropColumn("expires_at");
    
    // Make user_id not nullable again
    table.text("user_id").notNullable().alter();
    
    // Restore original unique constraint
    table.unique(["user_id", "device_fingerprint"]);
  });
}
