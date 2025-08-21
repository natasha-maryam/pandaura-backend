import type { Knex } from "knex";

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'postgresql',
    connection: {
      host: process.env.POSTGRES_HOST,
      port: parseInt(process.env.POSTGRES_PORT || '5432'),
      user: process.env.POSTGRES_USER || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'password',
      database: process.env.POSTGRES_DB || 'pandaura_dev',
      ssl: false
    },
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
    },
    debug: process.env.NODE_ENV === 'development'
  },

  production: {
    client: 'postgresql',
    connection: {
      connectionString: process.env.DATABASE_URL || 
                       process.env.POSTGRES_URL || 
                       'postgresql://postgres:nqvmfspKeGFgvUcgiSMSfRvXfcXQxEva@nozomi.proxy.rlwy.net:42516/railway',
      ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false
    },
    pool: {
      min: 0,
      max: 3,
      acquireTimeoutMillis: 180000,
      createTimeoutMillis: 60000,
      destroyTimeoutMillis: 10000,
      idleTimeoutMillis: 60000,
      reapIntervalMillis: 10000,
      createRetryIntervalMillis: 2000,
      propagateCreateError: false
    },
    migrations: {
      directory: './knex-migrations',
      tableName: 'knex_migrations'
    },
    seeds: {
      directory: './knex-seeds'
    },
    acquireConnectionTimeout: 180000,
    asyncStackTraces: true
  },

  // Staging environment (optional)
  staging: {
    client: 'postgresql',
    connection: process.env.STAGING_DATABASE_URL || {
      host: process.env.STAGING_POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.STAGING_POSTGRES_PORT || '5432'),
      user: process.env.STAGING_POSTGRES_USER || 'postgres',
      password: process.env.STAGING_POSTGRES_PASSWORD,
      database: process.env.STAGING_POSTGRES_DB || 'pandaura_staging',
      ssl: process.env.STAGING_POSTGRES_SSL === 'true' ? { rejectUnauthorized: false } : false
    },
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
  },

  // Test environment
  test: {
    client: 'postgresql',
    connection: {
      host: process.env.TEST_POSTGRES_HOST || 'localhost',
      port: parseInt(process.env.TEST_POSTGRES_PORT || '5432'),
      user: process.env.TEST_POSTGRES_USER || 'postgres',
      password: process.env.TEST_POSTGRES_PASSWORD || 'password',
      database: process.env.TEST_POSTGRES_DB || 'pandaura_test'
    },
    pool: {
      min: 1,
      max: 5
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

export default config;
