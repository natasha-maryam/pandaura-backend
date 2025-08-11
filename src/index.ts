
console.log("Welcome to Pandaura Backend");

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { initializeTables } from './db/database-adapter';
import authRoutes from './routes/auth';
import orgRoutes from './routes/orgs';
import testRoutes from './routes/test';

const app = express();
const port = process.env.PORT || 5000;

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true
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

app.get('/', (req, res) => {
  res.json({ 
    message: 'Pandaura AS Backend API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      auth: '/api/v1/auth',
      organizations: '/api/v1/orgs',
      test: '/api/v1/test'
    }
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