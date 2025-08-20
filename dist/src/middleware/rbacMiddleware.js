"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rbacMiddleware = rbacMiddleware;
const knex_1 = __importDefault(require("../db/knex"));
const ROLE_HIERARCHY = { Viewer: 1, Editor: 2, Admin: 3 };
function rbacMiddleware(requiredRole) {
    return async function (req, res, next) {
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
            const result = await (0, knex_1.default)('team_members')
                .select('role')
                .where({ user_id: user.userId, org_id: orgId })
                .first();
            if (!result) {
                return res.status(403).json({ error: 'User not a member of this organization' });
            }
            const userRole = result.role;
            if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY[requiredRole]) {
                return res.status(403).json({ error: `Requires ${requiredRole} role or higher` });
            }
            // Add userRole to request for use in handlers
            req.userRole = userRole;
            next();
        }
        catch (err) {
            console.error('RBAC error:', err);
            res.status(500).json({ error: 'Server error' });
        }
    };
}
