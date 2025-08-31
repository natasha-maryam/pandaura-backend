"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.up = up;
exports.down = down;
async function up(knex) {
    // Create organizations table
    await knex.schema.createTable("organizations", (table) => {
        table.text("id").primary();
        table.text("name").notNullable();
        table.text("industry").notNullable();
        table.text("size").notNullable();
        table.timestamps(true, true);
    });
    // Create users table
    await knex.schema.createTable("users", (table) => {
        table.text("id").primary();
        table.text("email").notNullable().unique();
        table.text("password_hash").notNullable();
        table.text("first_name").defaultTo("");
        table.text("last_name").defaultTo("");
        table.text("name"); // Legacy field for compatibility
        table.text("org_name");
        table.text("role");
        table.boolean("is_active").defaultTo(true);
        table.boolean("email_verified").defaultTo(false);
        table.text("totp_secret");
        table.text("totp_secret_encrypted"); // Legacy field
        table.boolean("totp_enabled").defaultTo(false);
        table.boolean("two_factor_enabled").defaultTo(false); // Legacy field
        table.boolean("account_active").defaultTo(true); // Legacy field
        // Foreign key: org_id → organizations.id
        table
            .text("org_id")
            .references("id")
            .inTable("organizations")
            .onDelete("SET NULL");
        table.timestamps(true, true);
    });
    // Create team_members table
    await knex.schema.createTable("team_members", (table) => {
        table.text("id").primary();
        table.text("user_id").notNullable();
        table.text("organization_id").notNullable();
        table.text("role").notNullable();
        table.timestamps(true, true);
        table
            .foreign("user_id")
            .references("id")
            .inTable("users")
            .onDelete("CASCADE");
        table
            .foreign("organization_id")
            .references("id")
            .inTable("organizations")
            .onDelete("CASCADE");
    });
    // Create invites table
    await knex.schema.createTable("invites", (table) => {
        table.text("id").primary();
        table.text("email").notNullable();
        table.text("token").notNullable();
        table.text("organization_id");
        table.text("role").defaultTo("user");
        table.timestamp("used_at");
        table.timestamps(true, true);
        table
            .foreign("organization_id")
            .references("id")
            .inTable("organizations")
            .onDelete("CASCADE");
    });
    // Create device_bindings table
    await knex.schema.createTable("device_bindings", (table) => {
        table.text("id").primary();
        table.text("user_id").notNullable();
        table.text("device_fingerprint").notNullable();
        table.text("device_fingerprint_hash"); // Legacy field
        table.text("instance_id_hash"); // Legacy field
        table.timestamp("last_used").defaultTo(knex.fn.now());
        table.timestamp("bound_at").defaultTo(knex.fn.now()); // Legacy field
        table.timestamps(true, true);
        table
            .foreign("user_id")
            .references("id")
            .inTable("users")
            .onDelete("CASCADE");
        table.unique(["user_id", "device_fingerprint"]);
    });
    // Create activity_log table
    await knex.schema.createTable("activity_log", (table) => {
        table.text("id").primary();
        table.text("user_id");
        table.text("action").notNullable();
        table.text("event"); // Legacy field
        table.text("ip_address").notNullable();
        table.text("ip"); // Legacy field
        table.text("user_agent").notNullable();
        table.boolean("success").notNullable();
        table.jsonb("details").defaultTo("{}");
        table.timestamp("created_at").defaultTo(knex.fn.now());
        table
            .foreign("user_id")
            .references("id")
            .inTable("users")
            .onDelete("SET NULL");
    });
    // Create session_policy table (optional/legacy)
    await knex.schema.createTable("session_policy", (table) => {
        table.increments("id").primary();
        table.text("policy_json").notNullable();
        table.timestamp("updated_at").defaultTo(knex.fn.now());
    });
}
async function down(knex) {
    await knex.schema.dropTableIfExists("session_policy");
    await knex.schema.dropTableIfExists("activity_log");
    await knex.schema.dropTableIfExists("device_bindings");
    await knex.schema.dropTableIfExists("team_members");
    await knex.schema.dropTableIfExists("invites");
    await knex.schema.dropTableIfExists("organizations");
    await knex.schema.dropTableIfExists("users");
}
