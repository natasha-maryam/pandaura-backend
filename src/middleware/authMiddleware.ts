import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ProjectsTable } from '../db/tables/projects';

const JWT_SECRET = process.env.JWT_SECRET || '69d215b3cc191323c79a3a264f6ad2f194d02486f0001b4ae287b13542fcd2212e39ffda859f71f450edcde3944567db1a694a82155f74c749c2aa4e45fa8c17';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    orgId?: string;
    role?: string;
  };
  project?: {
    id: number;
    user_id: string;
  };
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  console.log('🔐 Auth middleware called:', {
    hasAuthHeader: !!authHeader,
    hasToken: !!token,
    tokenPrefix: token ? `${token.substring(0, 10)}...` : 'none',
    url: req.url,
    method: req.method
  });

  if (!token) {
    console.log('❌ No token provided');
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET) as any;
    req.user = user;
    console.log('✅ Token verified for user:', user.userId);
    next();
  } catch (err) {
    console.log('❌ Token verification failed:', err);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

export function generateToken(payload: any, expiresIn: string = '8h'): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export async function authorizeProjectAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const userId = req.user?.userId;
    if (!userId) {
      return res.status(401).json({ error: 'User not authenticated' });
    }

    // Check if project exists and user has access
    const project = await ProjectsTable.getById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    if (project.user_id !== userId) {
      // TODO: Add organization-level access check here
      return res.status(403).json({ error: 'Not authorized to access this project' });
    }

    req.project = {
      id: project.id,
      user_id: project.user_id
    };

    next();
  } catch (error) {
    console.error('Error in project authorization:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}
