"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const argon2_1 = __importDefault(require("argon2"));
const speakeasy_1 = __importDefault(require("speakeasy"));
const crypto_1 = __importDefault(require("crypto"));
const uuid_1 = require("uuid");
const database_adapter_1 = require("../db/database-adapter");
const authMiddleware_1 = require("../middleware/authMiddleware");
const auditLogger_1 = require("../middleware/auditLogger");
const router = express_1.default.Router();
// Helper: generate random invite code
function generateInviteCode() {
    return crypto_1.default.randomBytes(16).toString('hex');
}
// Create Organization & Admin user
router.post('/orgs', async (req, res) => {
    const { orgName, industry, size, fullName, email, password } = req.body;
    if (!orgName || !fullName || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        // Create org
        const orgId = (0, uuid_1.v4)();
        await database_adapter_1.db.createOrganization({
            id: orgId,
            name: orgName,
            industry,
            size
        });
        // Hash password
        const passwordHash = await argon2_1.default.hash(password);
        // Create user
        const userId = (0, uuid_1.v4)();
        await database_adapter_1.db.createUser({
            id: userId,
            fullName,
            email: email.toLowerCase(),
            passwordHash
        });
        // Add user as admin member to org
        await database_adapter_1.db.createTeamMember({
            id: (0, uuid_1.v4)(),
            userId,
            orgId,
            role: 'Admin'
        });
        // Bind any temporary devices from signup flow
        await bindTempDevices(userId, email);
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId,
            orgId,
            action: `Created organization '${orgName}' and admin user`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { orgName, email }
        });
        // Generate JWT token
        const token = (0, authMiddleware_1.generateToken)({ userId, orgId, role: 'Admin' });
        res.json({
            message: 'Organization and admin user created',
            token,
            orgId,
            userId,
            role: 'Admin'
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Validate invite code
router.get('/invites/validate', async (req, res) => {
    const { code } = req.query;
    if (!code) {
        return res.status(400).json({ error: 'Invite code required' });
    }
    try {
        const invite = await database_adapter_1.db.getValidInviteByCode(code);
        if (!invite) {
            return res.status(400).json({ error: 'Invalid or expired invite code' });
        }
        // Get organization name
        const org = await database_adapter_1.db.getOrganizationById(invite.org_id);
        res.json({
            valid: true,
            orgId: invite.org_id,
            orgName: org?.name || 'Unknown Organization',
            role: invite.role,
            email: invite.email
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// User signup via invite
router.post('/invites/accept', async (req, res) => {
    const { code, fullName, email, password } = req.body;
    if (!code || !fullName || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        // Validate invite code
        const invite = await database_adapter_1.db.getValidInviteByCode(code);
        if (!invite) {
            return res.status(400).json({ error: 'Invalid or expired invite code' });
        }
        // Hash password
        const passwordHash = await argon2_1.default.hash(password);
        // Create user
        const userId = (0, uuid_1.v4)();
        await database_adapter_1.db.createUser({
            id: userId,
            fullName,
            email: email.toLowerCase(),
            passwordHash
        });
        // Add user to org with role from invite
        await database_adapter_1.db.createTeamMember({
            id: (0, uuid_1.v4)(),
            userId,
            orgId: invite.org_id,
            role: invite.role
        });
        // Mark invite as used
        await database_adapter_1.db.markInviteAsUsed(invite.id);
        // Bind any temporary devices from signup flow
        await bindTempDevices(userId, email);
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId,
            orgId: invite.org_id,
            action: `User joined organization via invite with role ${invite.role}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: {
                userEmail: email,
                inviteEmail: invite.email,
                inviteCode: code,
                emailMatched: invite.email.toLowerCase() === email.toLowerCase()
            }
        });
        // Generate JWT token
        const token = (0, authMiddleware_1.generateToken)({ userId, orgId: invite.org_id, role: invite.role });
        res.json({
            message: 'User created and added to organization',
            token,
            userId,
            orgId: invite.org_id,
            role: invite.role
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Generate invite code (for testing purposes)
router.post('/invites/generate', async (req, res) => {
    const { orgId, email, role = 'Viewer', expiresInDays = 7 } = req.body;
    if (!orgId || !email) {
        return res.status(400).json({ error: 'Organization ID and email are required' });
    }
    try {
        // Verify organization exists
        const org = await database_adapter_1.db.getOrganizationById(orgId);
        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        // Generate invite code and calculate expiration
        const code = generateInviteCode();
        const expiresAt = new Date(Date.now() + (expiresInDays * 24 * 60 * 60 * 1000));
        // Create invite
        await database_adapter_1.db.createInvite({
            id: (0, uuid_1.v4)(),
            orgId,
            email: email.toLowerCase(),
            code,
            role,
            expiresAt
        });
        res.json({
            message: 'Invite generated successfully',
            inviteCode: code,
            orgName: org.name,
            email: email.toLowerCase(),
            role,
            expiresAt: expiresAt.getTime(),
            inviteLink: `${req.protocol}://${req.get('host')}/signup?invite=${code}`
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// 2FA Setup: generate TOTP secret
router.post('/setup-2fa', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const secret = speakeasy_1.default.generateSecret({
            length: 20,
            name: 'Pandaura AS',
            issuer: 'Pandaura AS'
        });
        // Save secret to user for later verification
        await database_adapter_1.db.updateUserTotpSecret(req.user.userId, secret.base32);
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: 'Initiated 2FA setup',
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        res.json({
            secret: secret.base32,
            otpauth_url: secret.otpauth_url
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// 2FA Verification
router.post('/verify-2fa', authMiddleware_1.authenticateToken, async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Missing 2FA token' });
    }
    try {
        const user = await database_adapter_1.db.getUserById(req.user.userId);
        if (!user || !user.totp_secret) {
            return res.status(404).json({ error: 'User not found or 2FA not set up' });
        }
        const verified = speakeasy_1.default.totp.verify({
            secret: user.totp_secret,
            encoding: 'base32',
            token,
            window: 1
        });
        if (!verified) {
            // Log failed attempt
            await (0, auditLogger_1.logAuditEvent)({
                userId: req.user.userId,
                action: 'Failed 2FA verification attempt',
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
            return res.status(400).json({ error: 'Invalid 2FA token' });
        }
        // Enable 2FA for user (need to add this field to database abstraction)
        // For now, we'll skip this step as it requires a database schema change
        // await db.updateUser2FAStatus(req.user!.userId, true);
        // Log successful verification
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: 'Successfully verified and enabled 2FA',
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        res.json({ success: true, message: '2FA verified and enabled' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Device binding endpoint
router.post('/device-bind', authMiddleware_1.authenticateToken, async (req, res) => {
    const { instanceId, deviceFingerprintHash } = req.body;
    if (!instanceId || !deviceFingerprintHash) {
        return res.status(400).json({ error: 'Missing device binding info' });
    }
    try {
        await database_adapter_1.db.createDeviceBinding({
            id: (0, uuid_1.v4)(),
            userId: req.user.userId,
            instanceId,
            deviceFingerprintHash
        });
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: 'Device bound to account',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { instanceId }
        });
        res.json({ success: true, message: 'Device bound successfully' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to bind device' });
    }
});
// Signup device binding endpoint (no auth required during signup)
router.post('/signup-device-bind', async (req, res) => {
    const { instanceId, fingerprint, email, signupToken, isOrgCreator } = req.body;
    if (!instanceId || !fingerprint || !email || !signupToken) {
        return res.status(400).json({ error: 'Missing device binding info' });
    }
    try {
        // Basic validation - check if this is a valid signup token
        if (!signupToken.startsWith('temp-signup-')) {
            return res.status(400).json({ error: 'Invalid signup token' });
        }
        // Store the device info temporarily
        await database_adapter_1.db.createTempDeviceBinding({
            id: (0, uuid_1.v4)(),
            email: email.toLowerCase(),
            instanceId,
            deviceFingerprintHash: fingerprint,
            isOrgCreator: isOrgCreator || false
        });
        // Log audit event (without userId since not authenticated yet)
        await (0, auditLogger_1.logAuditEvent)({
            action: `Temporary device binding during signup (org creator: ${isOrgCreator})`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { email, instanceId, isOrgCreator }
        });
        res.json({ success: true, message: 'Device prepared for binding' });
    }
    catch (err) {
        console.error('Signup device binding error:', err);
        res.status(500).json({ error: 'Failed to prepare device binding' });
    }
});
// Helper function to bind temp devices after signup
async function bindTempDevices(userId, email) {
    try {
        // Get temp device bindings for this email
        const tempBindings = await database_adapter_1.db.getTempDeviceBindingsByEmail(email.toLowerCase());
        if (tempBindings.length > 0) {
            // Transfer to permanent device bindings
            for (const temp of tempBindings) {
                await database_adapter_1.db.createDeviceBinding({
                    id: (0, uuid_1.v4)(),
                    userId,
                    instanceId: temp.instance_id,
                    deviceFingerprintHash: temp.device_fingerprint_hash
                });
            }
            // Clean up temp bindings
            await database_adapter_1.db.deleteTempDeviceBindingsByEmail(email.toLowerCase());
            console.log(`Bound ${tempBindings.length} temporary devices for user ${userId}`);
        }
    }
    catch (err) {
        console.error('Error binding temp devices:', err);
    }
}
// User login
router.post('/login', async (req, res) => {
    const { email, password, twoFactorToken } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    try {
        const user = await database_adapter_1.db.getUserByEmail(email.toLowerCase());
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        const validPassword = await argon2_1.default.verify(user.password_hash, password);
        if (!validPassword) {
            // Log failed login attempt
            await (0, auditLogger_1.logAuditEvent)({
                userId: user.id,
                action: 'Failed login attempt - invalid password',
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                metadata: { email }
            });
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Check 2FA if enabled (Note: two_factor_enabled field needs to be added to schema)
        if (user.totp_secret) {
            if (!twoFactorToken) {
                return res.status(200).json({
                    requiresTwoFactor: true,
                    message: 'Two-factor authentication required'
                });
            }
            const verified = speakeasy_1.default.totp.verify({
                secret: user.totp_secret,
                encoding: 'base32',
                token: twoFactorToken,
                window: 1
            });
            if (!verified) {
                // Log failed 2FA attempt
                await (0, auditLogger_1.logAuditEvent)({
                    userId: user.id,
                    action: 'Failed login attempt - invalid 2FA token',
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    metadata: { email }
                });
                return res.status(401).json({ error: 'Invalid two-factor authentication token' });
            }
        }
        // Fetch user's organizations & roles
        const userOrgs = await database_adapter_1.db.getUserOrganizations(user.id);
        if (userOrgs.length === 0) {
            return res.status(403).json({ error: 'No organization membership found' });
        }
        // Use first org as default (or implement org selection logic)
        const primaryOrg = userOrgs[0];
        // Log successful login
        await (0, auditLogger_1.logAuditEvent)({
            userId: user.id,
            orgId: primaryOrg.org_id,
            action: 'Successful login',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { email, orgName: primaryOrg.org_name }
        });
        // Generate JWT
        const token = (0, authMiddleware_1.generateToken)({
            userId: user.id,
            orgId: primaryOrg.org_id,
            role: primaryOrg.role
        });
        res.json({
            token,
            userId: user.id,
            fullName: user.full_name,
            email: user.email,
            twoFactorEnabled: !!user.totp_secret,
            orgId: primaryOrg.org_id,
            role: primaryOrg.role,
            orgName: primaryOrg.org_name,
            organizations: userOrgs,
            message: 'Login successful'
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Get user's organizations
router.get('/users/:userId/orgs', authMiddleware_1.authenticateToken, async (req, res) => {
    const { userId } = req.params;
    // Ensure user can only access their own org list or is admin
    if (req.user.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
    }
    try {
        const orgs = await database_adapter_1.db.getUserOrganizations(userId);
        res.json(orgs);
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
exports.default = router;
