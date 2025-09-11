# Pandaura Backend - Industrial Automation Assistant API

Pandaura Backend is a comprehensive Node.js/TypeScript API server that provides intelligent automation engineering assistance for PLC programming, industrial control systems, and process automation. The platform specializes in parsing industrial formats, generating vendor-specific PLC code, and providing AI-powered automation consulting.

## 🚀 Features

### Core Capabilities
- **Multi-Vendor PLC Support**: Rockwell (Allen-Bradley), Siemens, Beckhoff PLC programming
- **Intelligent Code Generation**: AI-powered PLC code generation with vendor-specific syntax
- **Document Processing**: Parse technical specifications, P&IDs, and automation documents
- **Tag Management**: Real-time synchronization and management of PLC tags and variables
- **Project Management**: Complete project lifecycle management for automation projects
- **File Format Support**: 
  - Rockwell (.l5x), Siemens (.xml), Beckhoff (.xml) project files
  - Technical documents (PDF, Word, Excel, CSV)
  - Structured Text (.st) programs

### AI-Powered Features
- **Multi-Perspective Analysis**: Technical validation from automation engineer, technical writer, and quality inspector viewpoints
- **Code Governor**: Ensures vendor-compliant, production-ready PLC code generation
- **Logic Studio Integration**: Real-time tag synchronization and code analysis
- **Document Intelligence**: Extract specifications and generate automation solutions from technical documents

### Security & Authentication
- **JWT-based Authentication**: Secure token-based user sessions
- **Role-Based Access Control (RBAC)**: Granular permissions system
- **Two-Factor Authentication (TOTP)**: Enhanced security with time-based OTP
- **Audit Logging**: Comprehensive activity tracking

## 📋 Prerequisites

- **Node.js**: v20.x or higher
- **PostgreSQL**: v13+ (local or cloud instance)
- **npm**: v8+ or **yarn**: v1.22+

## ⚙️ Installation

### 1. Clone the Repository
```bash
git clone repo_url
cd pandora-backend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Configuration
Create a `.env` file in the root directory with the following variables:

```env
# Database Configuration
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_DB=pandaura_dev
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/pandaura_dev

# Production Database (for Railway/Vercel)
DATABASE_URL_PRODUCTION=your_production_database_url

# Server Configuration
PORT=5001
NODE_ENV=development

# AI Configuration
OPENAI_API_KEY=your_openai_api_key
OPENAI_MODEL_NAME=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com/v1

# JWT Configuration
JWT_SECRET=your_jwt_secret_key_here

# CORS Configuration
ALLOWED_ORIGINS=http://localhost:5173,https://pandaura.vercel.app
```

### 4. Database Setup

#### Option A: Local PostgreSQL
```bash
# Start PostgreSQL service
# Create database
createdb pandaura_dev

# Run migrations
npm run migrate
```

#### Option B: Railway/Cloud Database
```bash
# For production deployment
npm run migrate:railway
```

### 5. Build the Application
```bash
npm run build
```

## 🚀 Running the Application

### Development Mode
```bash
# TypeScript watch mode with auto-restart
npm run dev:ts

# or with compilation watch
npm run dev
```

### Production Mode
```bash
npm start
```

### Database Management
```bash
# Check database health
npm run db:health

# Test database connection
npm run db:test

# Get connection info
npm run db:info

# Reset database (⚠️ destroys all data)
npm run db:reset

# Reset and migrate
npm run db:reset-and-migrate
```

## 📚 API Documentation

### Base URL
- **Development**: `http://localhost:5001`
- **Production**: `https://your-domain.com`

### Core Endpoints

#### Authentication (`/api/v1/auth`)
- `POST /register` - User registration
- `POST /login` - User login
- `POST /logout` - User logout
- `POST /verify-2fa` - Two-factor authentication
- `GET /me` - Get current user profile

#### Projects (`/api/v1/projects`)
- `GET /` - List user projects
- `POST /` - Create new project
- `GET /:id` - Get project details
- `PUT /:id` - Update project
- `DELETE /:id` - Delete project

#### Tags (`/api/v1/tags`)
- `GET /?projectId=:id` - Get project tags
- `POST /` - Create/update tags
- `DELETE /:id` - Delete tag
- `POST /import` - Import tags from files

#### AI Assistant (`/api/assistant`)
- `POST /chat` - General automation assistance
- `POST /document-analysis` - Analyze technical documents
- `POST /code-generation` - Generate PLC code
- `POST /wrapper-b` - Document & Logic Analysis
- `POST /code-governor` - Vendor-compliant code generation

#### Organizations (`/api/v1/orgs`)
- `GET /` - List organizations
- `POST /` - Create organization
- `GET /:id` - Get organization details

### Health Check
- `GET /api/v1/health` - System health status

## 🏗️ Project Structure

```
src/
├── ai/                     # AI-powered automation assistance
│   ├── openai-wrapper.ts   # Main AI chat interface
│   ├── wrapper-B-*.ts      # Document analysis & logic generation
│   ├── wrapper-C-*.ts      # Verification systems
│   ├── code-governor/      # PLC code generation engine
│   └── top-level-system.ts # Core AI system prompts
├── config/                 # Application configuration
├── db/                     # Database layer
│   ├── knex.ts            # Knex.js configuration
│   ├── database-manager.ts # Database utilities
│   └── tables/            # Table definitions
├── middleware/            # Express middleware
│   ├── authMiddleware.ts  # JWT authentication
│   ├── rbacMiddleware.ts  # Role-based access control
│   └── auditLogger.ts     # Activity logging
├── routes/                # API route handlers
├── services/              # Business logic services
│   ├── tagSyncService.ts  # Real-time tag synchronization
│   └── tagImportService.ts # File parsing and import
├── types/                 # TypeScript type definitions
├── utils/                 # Utility functions
│   ├── *TagIO.ts         # Vendor-specific parsers
│   ├── documentProcessor.ts # Document analysis
│   └── stParser.ts       # Structured Text parser
└── index.ts              # Application entry point

knex-migrations/           # Database migration files
test-files/               # Sample files for testing
uploads/                  # File upload storage
```

## 🔧 Configuration Files

- **`knexfile.ts`**: Database migration and connection configuration
- **`tsconfig.json`**: TypeScript compiler configuration
- **`vercel.json`**: Vercel deployment configuration
- **`nixpacks.toml`**: Railway deployment configuration
- **`railway.json`**: Railway-specific settings

## 🚀 Deployment

### Vercel Deployment
```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel

# Set environment variables in Vercel dashboard
```

### Railway Deployment
```bash
# Connect to Railway
railway login
railway link

# Deploy
railway up

# Run migrations
railway run npm run migrate:railway
```

### Docker Deployment
```bash
# Build image
docker build -t pandaura-backend .

# Run container
docker run -p 5001:5001 --env-file .env pandaura-backend
```

## 🧪 Testing

### API Testing
```bash
# Test simple endpoint
curl http://localhost:5001/api/v1/simple-test

# Health check
curl http://localhost:5001/api/v1/health
```

### Database Testing
```bash
# Test connection
npm run db:test

# Check migration status
npm run migrate:status
```

## 📁 Supported File Formats

### PLC Project Files
- **Rockwell**: `.l5x` (RSLogix 5000/Studio 5000)
- **Siemens**: `.xml` (TIA Portal exports)
- **Beckhoff**: `.xml` (TwinCAT projects)

### Programming Files
- **Structured Text**: `.st` files
- **Tag Databases**: `.csv` files

### Documentation
- **PDF**: Technical specifications, P&IDs
- **Microsoft Office**: Word (.docx), Excel (.xlsx), PowerPoint (.pptx)
- **Text**: Plain text (.txt), Markdown (.md)

## 🔒 Security Features

- **Helmet.js**: Security headers
- **CORS**: Configurable cross-origin resource sharing
- **Input Validation**: Zod schema validation
- **SQL Injection Protection**: Parameterized queries via Knex.js
- **Rate Limiting**: Built-in request throttling
- **Secure File Uploads**: Multer with file type validation

## 🌐 WebSocket Support

Real-time features for tag synchronization and project updates:
- Live tag updates during code analysis
- Project collaboration features
- Real-time status notifications

## 📊 Monitoring & Logging

- **Winston Logging**: Structured application logging
- **Audit Trail**: Complete user activity tracking
- **Health Monitoring**: Database and system health checks
- **Performance Metrics**: Request timing and memory usage

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue on GitHub
- Email: support@pandaura.com
- Documentation: [https://docs.pandaura.com](https://docs.pandaura.com)

## 🏷️ Version History

- **v1.0.0**: Initial release with core automation features
- **v1.1.0**: Added multi-vendor PLC support
- **v1.2.0**: Enhanced AI capabilities and document processing
- **v2.0.0**: Complete rewrite with TypeScript and modern architecture

---

**Pandaura Backend** - Empowering automation engineers with intelligent PLC programming assistance.
