import knex, { Knex } from 'knex';
import config from '../knexfile';

const environment = process.env.NODE_ENV || 'development';
const dbConfig = config[environment];

const db: Knex = knex(dbConfig);

export default db;
