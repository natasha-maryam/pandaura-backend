"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticateToken = authenticateToken;
exports.generateToken = generateToken;
exports.authorizeProjectAccess = authorizeProjectAccess;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const projects_1 = require("../db/tables/projects");
const JWT_SECRET = process.env.JWT_SECRET || '69d215b3cc191323c79a3a264f6ad2f194d02486f0001b4ae287b13542fcd2212e39ffda859f71f450edcde3944567db1a694a82155f74c749c2aa4e45fa8c17';
function authenticateToken(req, res, next) {
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
        const user = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        req.user = user;
        console.log('✅ Token verified for user:', user.userId);
        next();
    }
    catch (err) {
        console.log('❌ Token verification failed:', err);
        return res.status(403).json({ error: 'Invalid or expired token' });
    }
}
function generateToken(payload, expiresIn = '8h') {
    return jsonwebtoken_1.default.sign(payload, JWT_SECRET, { expiresIn });
}
async function authorizeProjectAccess(req, res, next) {
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
        const project = await projects_1.ProjectsTable.getById(projectId);
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
    }
    catch (error) {
        console.error('Error in project authorization:', error);
        res.status(500).json({ error: 'Authorization check failed' });
    }
}
