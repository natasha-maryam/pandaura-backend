import { Response, NextFunction } from 'express';
import db from '../db';
import { AuthenticatedRequest } from './authMiddleware';

const ROLE_HIERARCHY = { Viewer: 1, Editor: 2, Admin: 3 };

export function rbacMiddleware(requiredRole: 'Viewer' | 'Editor' | 'Admin') {
  return async function (req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const user = req.user;
      const orgId = req.params.orgId || req.body.orgId || req.query.orgId;

      if (!user) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      if (!orgId) {
        return res.status(400).json({ error: 'Organization ID required' });
      }

      // Query current role fresh from DB (enforces zero trust)
      const stmt = db.prepare(`
        SELECT role FROM team_members 
        WHERE user_id = ? AND org_id = ?
      `);
      const result = stmt.get(user.userId, orgId) as { role: string } | undefined;

      if (!result) {
        return res.status(403).json({ error: 'User not a member of this organization' });
      }

      const userRole = result.role as 'Viewer' | 'Editor' | 'Admin';
      
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[requiredRole]) {
        return res.status(403).json({ error: `Requires ${requiredRole} role or higher` });
      }

      // Add userRole to request for use in handlers
      (req as any).userRole = userRole;
      next();
    } catch (err) {
      console.error('RBAC error:', err);
      res.status(500).json({ error: 'Server error' });
    }
  };
}
