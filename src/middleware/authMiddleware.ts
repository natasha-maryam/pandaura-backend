import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import db from '../db/knex';

const JWT_SECRET = process.env.JWT_SECRET || '69d215b3cc191323c79a3a264f6ad2f194d02486f0001b4ae287b13542fcd2212e39ffda859f71f450edcde3944567db1a694a82155f74c749c2aa4e45fa8c17';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    orgId?: string;
    role?: string;
    email?: string;
  };
  project?: {
    id: number;
    user_id: string;
  };
}

export interface TokenPayload {
  userId: string;
  orgId?: string;
  role?: string;
  email?: string;
  iat?: number;
  exp?: number;
}

export function authenticateToken(req: AuthenticatedRequest, res: Response, next: NextFunction) {

   // ✅ Let preflight pass through
  if (req.method === 'OPTIONS') return next();

  const authHeader = req.headers['authorization'];
  const headerToken = authHeader && authHeader.split(' ')[1];
  const cookieToken = req.cookies?.authToken;
  const token = headerToken || cookieToken;

  console.log('🔐 Auth middleware called:', {
    hasAuthHeader: !!authHeader,
    hasHeaderToken: !!headerToken,
    hasCookieToken: !!cookieToken,
    hasToken: !!token,
    tokenPrefix: token ? `${token.substring(0, 10)}...` : 'none',
    url: req.url,
    method: req.method
  });

  if (!token) {
    console.log('❌ No token provided in header or cookie');
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as TokenPayload;
    
    // Validate required fields
    if (!decoded.userId) {
      console.log('❌ Invalid token payload: missing userId');
      return res.status(403).json({ error: 'Invalid token payload' });
    }

    req.user = {
      userId: decoded.userId,
      orgId: decoded.orgId,
      role: decoded.role,
      email: decoded.email
    };
    
    // console.log('✅ Token verified for user:', {
    //   userId: decoded.userId,
    //   role: decoded.role,
    //   orgId: decoded.orgId
    // });
    
    next();
  } catch (err) {
    console.log('❌ Token verification failed:', err);
    if (err instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ error: 'Token expired' });
    } else if (err instanceof jwt.JsonWebTokenError) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    return res.status(403).json({ error: 'Token verification failed' });
  }
}

export function generateToken(payload: TokenPayload, expiresIn: string = '8h'): string {
  
  // Ensure we only include necessary fields in the token
  const tokenPayload: TokenPayload = {
    userId: payload.userId,
    orgId: payload.orgId,
    role: payload.role,
    email: payload.email
  };
  
  return jwt.sign(tokenPayload, JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

export async function authorizeProjectAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {

   // ✅ Let preflight pass through
  if (req.method === 'OPTIONS') return next();

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
    const project = await db('projects')
      .where('id', projectId)
      .first();
    
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Check direct ownership
    if (project.user_id === userId) {
      req.project = {
        id: project.id,
        user_id: project.user_id
      };
      return next();
    }

    // Check organization-level access
    if (req.user?.orgId) {
      try {
        // Check if user is in the same organization as the project owner
        const projectOwner = await db('users')
          .select('id')
          .join('team_members', 'users.id', 'team_members.user_id')
          .where('users.id', project.user_id)
          .where('team_members.organization_id', req.user.orgId)
          .first();

        const currentUser = await db('team_members')
          .where('user_id', userId)
          .where('organization_id', req.user.orgId)
          .first();

        if (projectOwner && currentUser) {
          // User has organization-level access
          req.project = {
            id: project.id,
            user_id: project.user_id
          };
          return next();
        }
      } catch (orgError) {
        console.error('Error checking organization access:', orgError);
      }
    }

    return res.status(403).json({ error: 'Not authorized to access this project' });

  } catch (error) {
    console.error('Error in project authorization:', error);
    res.status(500).json({ error: 'Authorization check failed' });
  }
}

// Optional middleware for admin-only routes
export function requireAdmin(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (req.user?.role !== 'Admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Optional middleware for organization members
export async function requireOrgMember(req: AuthenticatedRequest, res: Response, next: NextFunction) {
   // ✅ Let preflight pass through
  if (req.method === 'OPTIONS') return next();
  
  try {
    const userId = req.user?.userId;
    const orgId = req.params.orgId || req.user?.orgId;

    if (!userId || !orgId) {
      return res.status(400).json({ error: 'Missing user or organization information' });
    }

    const membership = await db('team_members')
      .where('user_id', userId)
      .where('organization_id', orgId)
      .first();

    if (!membership) {
      return res.status(403).json({ error: 'Not a member of this organization' });
    }

    next();
  } catch (error) {
    console.error('Error checking organization membership:', error);
    res.status(500).json({ error: 'Organization membership check failed' });
  }
}
