"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const config = {
    development: {
        client: 'postgresql',
        connection: {
            host: process.env.POSTGRES_HOST || 'localhost',
            port: parseInt(process.env.POSTGRES_PORT || '5432'),
            user: process.env.POSTGRES_USER || 'postgres',
            password: process.env.POSTGRES_PASSWORD || 'password',
            database: process.env.POSTGRES_DB || 'pandaura_dev'
        },
        migrations: {
            directory: './knex-migrations',
            tableName: 'knex_migrations'
        },
        seeds: {
            directory: './knex-seeds'
        }
    },
    production: {
        client: 'postgresql',
        connection: process.env.POSTGRES_URL || process.env.DATABASE_URL,
        pool: {
            min: 2,
            max: 10
        },
        migrations: {
            directory: './knex-migrations',
            tableName: 'knex_migrations'
        },
        seeds: {
            directory: './knex-seeds'
        }
    }
};
exports.default = config;
