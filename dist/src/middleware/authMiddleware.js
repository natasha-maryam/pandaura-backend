"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
exports.generateToken = generateToken;
exports.authorizeProjectAccess = authorizeProjectAccess;
exports.requireAdmin = requireAdmin;
exports.requireOrgMember = requireOrgMember;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const knex_1 = __importDefault(require("../db/knex"));
const JWT_SECRET = process.env.JWT_SECRET || '69d215b3cc191323c79a3a264f6ad2f194d02486f0001b4ae287b13542fcd2212e39ffda859f71f450edcde3944567db1a694a82155f74c749c2aa4e45fa8c17';
function authenticateToken(req, res, next) {
    // ✅ Let preflight pass through
    if (req.method === 'OPTIONS')
        return next();
    const authHeader = req.headers['authorization'];
    const headerToken = authHeader && authHeader.split(' ')[1];
    const cookieToken = req.cookies?.pandaura_auth_token; // Fixed: use correct cookie name
    const token = headerToken || cookieToken;
    console.log('🔐 Auth middleware called:', {
        hasAuthHeader: !!authHeader,
        hasHeaderToken: !!headerToken,
        hasCookieToken: !!cookieToken,
        hasToken: !!token,
        tokenPrefix: token ? `${token.substring(0, 10)}...` : 'none',
        url: req.url,
        method: req.method,
        cookieNames: Object.keys(req.cookies || {})
    });
    if (!token) {
        console.log('❌ No token provided in header or cookie');
        return res.status(401).json({ error: 'No token provided' });
    }
    try {
        const decoded = jsonwebtoken_1.default.verify(token, JWT_SECRET);
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
    }
    catch (err) {
        console.log('❌ Token verification failed:', err);
        if (err instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res.status(401).json({ error: 'Your session has expired. Please login again.' });
        }
        else if (err instanceof jsonwebtoken_1.default.JsonWebTokenError) {
            return res.status(403).json({ error: 'Invalid token' });
        }
        return res.status(403).json({ error: 'Token verification failed' });
    }
}
function generateToken(payload, expiresIn = '8h') {
    // Ensure we only include necessary fields in the token
    const tokenPayload = {
        userId: payload.userId,
        orgId: payload.orgId,
        role: payload.role,
        email: payload.email
    };
    return jsonwebtoken_1.default.sign(tokenPayload, JWT_SECRET, { expiresIn });
}
async function authorizeProjectAccess(req, res, next) {
    // ✅ Let preflight pass through
    if (req.method === 'OPTIONS')
        return next();
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
        const project = await (0, knex_1.default)('projects')
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
                const projectOwner = await (0, knex_1.default)('users')
                    .select('id')
                    .join('team_members', 'users.id', 'team_members.user_id')
                    .where('users.id', project.user_id)
                    .where('team_members.organization_id', req.user.orgId)
                    .first();
                const currentUser = await (0, knex_1.default)('team_members')
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
            }
            catch (orgError) {
                console.error('Error checking organization access:', orgError);
            }
        }
        return res.status(403).json({ error: 'Not authorized to access this project' });
    }
    catch (error) {
        console.error('Error in project authorization:', error);
        res.status(500).json({ error: 'Authorization check failed' });
    }
}
// Optional middleware for admin-only routes
function requireAdmin(req, res, next) {
    if (req.user?.role !== 'Admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}
// Optional middleware for organization members
async function requireOrgMember(req, res, next) {
    // ✅ Let preflight pass through
    if (req.method === 'OPTIONS')
        return next();
    try {
        const userId = req.user?.userId;
        const orgId = req.params.orgId || req.user?.orgId;
        if (!userId || !orgId) {
            return res.status(400).json({ error: 'Missing user or organization information' });
        }
        const membership = await (0, knex_1.default)('team_members')
            .where('user_id', userId)
            .where('organization_id', orgId)
            .first();
        if (!membership) {
            return res.status(403).json({ error: 'Not a member of this organization' });
        }
        next();
    }
    catch (error) {
        console.error('Error checking organization membership:', error);
        res.status(500).json({ error: 'Organization membership check failed' });
    }
}
