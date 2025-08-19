# PostgreSQL Database Connection Guide

## Overview
This guide explains how to connect and configure PostgreSQL database for the Pandaura Backend application using Knex.js ORM.

## Database Migration Summary
- **Before**: SQLite with database adapter pattern
- **After**: PostgreSQL with Knex.js ORM
- **Benefits**: 
  - Single database system for dev/prod
  - Better performance and scalability
  - Unified query interface
  - Production-ready configuration

## Configuration Files

### 1. Knex Configuration (`knexfile.ts`)
```typescript
import type { Knex } from 'knex';

const config: { [key: string]: Knex.Config } = {
  development: {
    client: 'pg',
    connection: {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_NAME || 'pandaura_dev'
    },
    migrations: {
      directory: './knex-migrations',
      extension: 'ts'
    }
  },
  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    },
    migrations: {
      directory: './knex-migrations',
      extension: 'ts'
    }
  }
};

export default config;
```

### 2. Database Connection (`src/db/knex.ts`)
```typescript
import knex from 'knex';
import config from '../../knexfile';

const environment = process.env.NODE_ENV || 'development';
const db = knex(config[environment]);

export default db;
```

## Environment Variables

### Development
Create a `.env` file in the root directory:
```env
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=your_password
DB_NAME=pandaura_dev
```

### Production
Set these environment variables on your deployment platform:
```env
NODE_ENV=production
DATABASE_URL=postgresql://username:password@hostname:port/database_name
```

## Local Development Setup

### 1. Install PostgreSQL
**Windows:**
```powershell
# Using Chocolatey
choco install postgresql

# Or download from: https://www.postgresql.org/download/windows/
```

**macOS:**
```bash
# Using Homebrew
brew install postgresql
brew services start postgresql
```

**Linux:**
```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql postgresql-contrib

# Start service
sudo systemctl start postgresql
sudo systemctl enable postgresql
```

### 2. Create Database
```sql
-- Connect to PostgreSQL as superuser
psql -U postgres

-- Create database
CREATE DATABASE pandaura_dev;

-- Create user (optional)
CREATE USER pandaura_user WITH ENCRYPTED PASSWORD 'your_password';
GRANT ALL PRIVILEGES ON DATABASE pandaura_dev TO pandaura_user;

-- Exit
\q
```

### 3. Run Migrations
```powershell
# Install dependencies
npm install

# Run migrations
npm run migrate

# Or using Knex CLI directly
npx knex migrate:latest
```

## Production Deployment

### 1. Railway
```json
// railway.json
{
  "deploy": {
    "startCommand": "npm run build && npm start",
    "buildCommand": "npm run build"
  }
}
```

Environment variables on Railway:
- `DATABASE_URL`: Provided by Railway PostgreSQL addon
- `NODE_ENV=production`

### 2. Vercel
```json
// vercel.json
{
  "buildCommand": "npm run build",
  "devCommand": "npm run dev",
  "installCommand": "npm install",
  "env": {
    "DATABASE_URL": "@database-url"
  }
}
```

### 3. Heroku
```bash
# Add PostgreSQL addon
heroku addons:create heroku-postgresql:hobby-dev

# Run migrations
heroku run npm run migrate
```

## Database Service Implementation

### 1. Database Service (`src/db/database-service-new.ts`)
```typescript
import db from './knex';

const DatabaseService = {
  // User operations
  async createUser(userData: any) {
    const [user] = await db('users').insert(userData).returning('*');
    return user;
  },

  async getUserByEmail(email: string) {
    return await db('users').where({ email }).first();
  },

  // Organization operations
  async createOrganization(orgData: any) {
    const [org] = await db('organizations').insert(orgData).returning('*');
    return org;
  },

  // Team member operations
  async createTeamMember(memberData: any) {
    const [member] = await db('team_members').insert(memberData).returning('*');
    return member;
  },

  // Activity logging
  async createActivityLog(logData: any) {
    const [log] = await db('activity_logs').insert(logData).returning('*');
    return log;
  },

  // Close connection (for cleanup)
  async closeConnection() {
    await db.destroy();
  }
};

export default DatabaseService;
```

### 2. Using Database Service in Routes
```typescript
import DatabaseService from '../db/database-service-new';

// Example: Create user
router.post('/signup', async (req, res) => {
  try {
    const user = await DatabaseService.createUser({
      email: req.body.email,
      passwordHash: hashedPassword,
      firstName: req.body.firstName
    });
    
    res.status(201).json({ user });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});
```

## Database Schema

### Migration Files (`knex-migrations/`)
- `001-init.ts`: Basic tables (users, organizations, team_members)
- `002-auth-system.ts`: Authentication and security
- `003-temp-device-bindings.ts`: Device management
- `004-projects.ts`: Project management
- `005-tags-users.ts`: Tag system
- `006-enhanced-versioning.ts`: Version control
- `007-version-data-column.ts`: Version data storage

### Key Tables
1. **users**: User accounts and profiles
2. **organizations**: Company/organization data
3. **team_members**: User-organization relationships
4. **projects**: Project management
5. **tags**: Tag definitions and metadata
6. **activity_logs**: Audit trail
7. **invites**: Organization invitations

## Testing Connection

### 1. Database Connection Test
```typescript
// test-db-connection.ts
import db from './src/db/knex';

async function testConnection() {
  try {
    await db.raw('SELECT 1');
    console.log('✅ Database connection successful');
    
    const users = await db('users').count('* as count').first();
    console.log(`👥 Users in database: ${users?.count || 0}`);
    
    await db.destroy();
  } catch (error) {
    console.error('❌ Database connection failed:', error);
  }
}

testConnection();
```

### 2. Run Test
```powershell
npx ts-node test-db-connection.ts
```

## Available NPM Scripts

```json
{
  "scripts": {
    "dev": "ts-node src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "migrate": "knex migrate:latest",
    "migrate:rollback": "knex migrate:rollback",
    "migrate:make": "knex migrate:make",
    "seed": "knex seed:run"
  }
}
```

## Common Issues & Solutions

### 1. Connection Refused
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Solution**: Ensure PostgreSQL is running and accepting connections.

### 2. Authentication Failed
```
Error: password authentication failed for user "postgres"
```
**Solution**: Check username/password in environment variables.

### 3. Database Does Not Exist
```
Error: database "pandaura_dev" does not exist
```
**Solution**: Create the database using `createdb` or psql.

### 4. Migration Errors
```
Error: Migration table is already locked
```
**Solution**: Run `npx knex migrate:unlock`

## Performance Optimization

### 1. Connection Pooling
Knex automatically handles connection pooling. Configure in knexfile.ts:
```typescript
pool: {
  min: 2,
  max: 10,
  createTimeoutMillis: 3000,
  acquireTimeoutMillis: 30000,
  idleTimeoutMillis: 30000,
  reapIntervalMillis: 1000,
  createRetryIntervalMillis: 100
}
```

### 2. Query Optimization
- Use indexes on frequently queried columns
- Limit result sets with `.limit()` and `.offset()`
- Use `.select()` to fetch only needed columns
- Batch operations where possible

## Security Considerations

1. **Environment Variables**: Never commit database credentials
2. **SSL Connections**: Use SSL in production
3. **Input Validation**: Validate all inputs before database operations
4. **SQL Injection**: Knex provides built-in protection
5. **Connection Limits**: Configure appropriate pool sizes

## Monitoring & Logging

### 1. Query Logging (Development)
```typescript
// In knexfile.ts development config
debug: true,
log: {
  warn(message) { console.log('⚠️', message); },
  error(message) { console.log('❌', message); },
  deprecate(message) { console.log('⚠️ Deprecated:', message); },
  debug(message) { console.log('🔍', message); }
}
```

### 2. Error Handling
```typescript
try {
  const result = await DatabaseService.createUser(userData);
  return result;
} catch (error) {
  if (error.code === '23505') {
    throw new Error('User already exists');
  }
  console.error('Database error:', error);
  throw error;
}
```

## Next Steps

1. **Complete Migration**: Ensure all routes use the new database service
2. **Data Migration**: Migrate existing SQLite data to PostgreSQL if needed
3. **Testing**: Run comprehensive tests on all endpoints
4. **Production Deployment**: Deploy with proper environment variables
5. **Monitoring**: Set up database monitoring and alerts

---

**Status**: ✅ PostgreSQL migration completed with Knex.js integration
**Files Updated**: All route files now use `database-service-new.ts`
**Ready for**: Production deployment and testing
