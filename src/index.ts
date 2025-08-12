
console.log("Welcome to Pandaura Backend");

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initializeTables } from './db/database-adapter';
import authRoutes from './routes/auth';
import orgRoutes from './routes/orgs';
import testRoutes from './routes/test';
import projectsRoutes from './routes/projects';

const app = express();
const port = process.env.PORT || 5000;

// Security middleware
app.use(helmet());

// Configure CORS to handle multiple origins
const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5173',
  process.env.CORS_ORIGIN,
  // Parse additional CORS origins from environment
  ...(process.env.ADDITIONAL_CORS_ORIGINS?.split(',') || []),
  // Default development origins
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:3000',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:3000',
  // Common production domains
  'https://pandaura.vercel.app',
  'https://pandaura-frontend.vercel.app',
].filter((origin): origin is string => Boolean(origin)).map(origin => origin.trim()); // Remove any undefined values and trim whitespace

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.some(allowedOrigin => 
      origin === allowedOrigin || 
      origin.endsWith('.vercel.app') ||
      origin.startsWith('http://localhost') ||
      origin.startsWith('http://127.0.0.1')
    )) {
      return callback(null, true);
    }
    
    console.log('CORS blocked origin:', origin);
    console.log('Allowed origins:', allowedOrigins);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Trust proxy for accurate IP addresses in audit logs
app.set('trust proxy', true);

// Initialize database tables
initializeTables().catch(console.error);

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/orgs', orgRoutes);
app.use('/api/v1/test', testRoutes);
app.use('/api/v1/projects', projectsRoutes);

app.get('/', (req, res) => {
  res.json({ 
    message: 'Pandaura AS Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: '/api/v1/auth',
      organizations: '/api/v1/orgs',
      projects: '/api/v1/projects',
      test: '/api/v1/test'
    }
  });
});

// CORS debug endpoint
app.get('/api/v1/cors-test', (req, res) => {
  res.json({
    message: 'CORS is working!',
    origin: req.headers.origin,
    timestamp: new Date().toISOString(),
    headers: req.headers
  });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:5173'}`);
});