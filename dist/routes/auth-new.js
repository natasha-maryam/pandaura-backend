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
const authMiddleware_1 = require("../middleware/authMiddleware");
const auditLogger_1 = require("../middleware/auditLogger");
const knex_1 = __importDefault(require("../db/knex"));
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
        await (0, knex_1.default)('organizations').insert({
            id: orgId,
            name: orgName,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        // Hash password
        const passwordHash = await argon2_1.default.hash(password);
        // Create user
        const userId = (0, uuid_1.v4)();
        await (0, knex_1.default)('users').insert({
            id: userId,
            email: email.toLowerCase(),
            password_hash: passwordHash,
            first_name: fullName.split(' ')[0] || '',
            last_name: fullName.split(' ').slice(1).join(' ') || '',
            name: fullName, // Keep legacy field
            org_name: orgName, // Set organization name
            industry,
            role: 'Admin',
            org_id: orgId,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        // Add user as admin member to org
        await (0, knex_1.default)('team_members').insert({
            id: (0, uuid_1.v4)(),
            user_id: userId,
            organization_id: orgId,
            role: 'Admin',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
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
        const invite = await (0, knex_1.default)('invites as i')
            .join('organizations as o', 'i.organization_id', 'o.id')
            .select('i.*', 'o.name as org_name')
            .where('i.token', code)
            .whereNull('i.used_at')
            .first();
        if (!invite) {
            return res.status(400).json({ error: 'Invalid or expired invite code' });
        }
        res.json({
            valid: true,
            orgId: invite.organization_id,
            orgName: invite.org_name,
            role: invite.role || 'user',
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
        const invite = await (0, knex_1.default)('invites')
            .where('token', code)
            .whereNull('used_at')
            .first();
        if (!invite) {
            return res.status(400).json({ error: 'Invalid or expired invite code' });
        }
        // Hash password
        const passwordHash = await argon2_1.default.hash(password);
        // Get organization name for user record
        let orgName = '';
        if (invite.organization_id) {
            const org = await (0, knex_1.default)('organizations')
                .where('id', invite.organization_id)
                .first();
            orgName = org?.name || '';
        }
        // Create user
        const userId = (0, uuid_1.v4)();
        await (0, knex_1.default)('users').insert({
            id: userId,
            email: email.toLowerCase(),
            password_hash: passwordHash,
            first_name: fullName.split(' ')[0] || '',
            last_name: fullName.split(' ').slice(1).join(' ') || '',
            name: fullName, // Keep legacy field
            org_name: orgName, // Set organization name
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        // Add user as member to org (if invite has org_id)
        if (invite.organization_id) {
            await (0, knex_1.default)('team_members').insert({
                id: (0, uuid_1.v4)(),
                user_id: userId,
                organization_id: invite.organization_id,
                role: invite.role || 'user',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });
        }
        // Mark invite as used
        await (0, knex_1.default)('invites')
            .where('id', invite.id)
            .update({ used_at: new Date().toISOString() });
        // Bind any temporary devices from signup flow
        await bindTempDevices(userId, email);
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId,
            action: 'User signed up via invite',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { inviteCode: code, email }
        });
        // Generate JWT token
        const token = (0, authMiddleware_1.generateToken)({
            userId,
            orgId: invite.organization_id,
            role: invite.role || 'user'
        });
        res.json({
            message: 'User account created successfully',
            token,
            userId,
            orgId: invite.organization_id,
            role: invite.role || 'user'
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Send invite
router.post('/invites', authMiddleware_1.authenticateToken, async (req, res) => {
    const { email, role, orgId } = req.body;
    if (!email || !role || !orgId) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        // Verify org exists
        const org = await (0, knex_1.default)('organizations')
            .where('id', orgId)
            .first();
        if (!org) {
            return res.status(404).json({ error: 'Organization not found' });
        }
        // Generate invite
        const inviteId = (0, uuid_1.v4)();
        const code = generateInviteCode();
        await (0, knex_1.default)('invites').insert({
            id: inviteId,
            email: email.toLowerCase(),
            token: code,
            organization_id: orgId,
            role: role,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        });
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            orgId,
            action: `Sent invite to ${email}`,
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { email, role, inviteCode: code }
        });
        res.json({ message: 'Invite sent', code });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Enable TOTP/2FA (legacy endpoint for frontend compatibility)
router.post('/setup-2fa', authMiddleware_1.authenticateToken, async (req, res) => {
    console.log('🔒 Setup 2FA endpoint called for user:', req.user?.userId);
    try {
        // Get user information for the TOTP secret
        const user = await (0, knex_1.default)('users')
            .where('id', req.user.userId)
            .first();
        if (!user) {
            console.error('❌ User not found:', req.user?.userId);
            return res.status(404).json({ error: 'User not found' });
        }
        console.log('✅ User found for 2FA setup:', user.email);
        const secret = speakeasy_1.default.generateSecret({
            name: `Pandaura (${user.email})`,
            issuer: 'Pandaura',
            length: 32
        });
        console.log('🔑 TOTP secret generated successfully');
        // Store secret in database
        await (0, knex_1.default)('users')
            .where('id', req.user.userId)
            .update({
            totp_secret: secret.base32,
            updated_at: new Date().toISOString()
        });
        console.log('💾 TOTP secret stored in database');
        const response = {
            secret: secret.base32,
            qrCode: secret.otpauth_url,
            otpauth_url: secret.otpauth_url
        };
        console.log('📤 Sending 2FA setup response:', {
            hasSecret: !!response.secret,
            hasQrCode: !!response.qrCode,
            hasOtpauthUrl: !!response.otpauth_url
        });
        res.json(response);
    }
    catch (err) {
        console.error('TOTP setup error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Enable TOTP/2FA
router.post('/totp/enable', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        // Get user information for the TOTP secret
        const user = await (0, knex_1.default)('users')
            .where('id', req.user.userId)
            .first();
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        const secret = speakeasy_1.default.generateSecret({
            name: `Pandaura (${user.email})`,
            issuer: 'Pandaura',
            length: 32
        });
        // Store secret in database
        await (0, knex_1.default)('users')
            .where('id', req.user.userId)
            .update({
            totp_secret: secret.base32,
            updated_at: new Date().toISOString()
        });
        res.json({
            secret: secret.base32,
            qrCode: secret.otpauth_url
        });
    }
    catch (err) {
        console.error('TOTP setup error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Verify TOTP/2FA (legacy endpoint for frontend compatibility)
router.post('/verify-2fa', authMiddleware_1.authenticateToken, async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'TOTP token required' });
    }
    try {
        const user = await (0, knex_1.default)('users')
            .where('id', req.user.userId)
            .first();
        if (!user || !user.totp_secret) {
            return res.status(400).json({ error: 'TOTP not configured' });
        }
        console.log('🔑 Verifying TOTP for user:', user.email);
        console.log('🔑 Token received:', token);
        console.log('🔑 Secret exists:', !!user.totp_secret);
        // Increase window for verification to handle timing issues
        const verified = speakeasy_1.default.totp.verify({
            secret: user.totp_secret,
            encoding: 'base32',
            token: token.toString().trim(), // Ensure token is string and trimmed
            window: 6, // Increased window (allows ±3 time steps = ±90 seconds)
            time: Date.now() / 1000 // Use current time explicitly
        });
        console.log('🔑 Verification result:', verified);
        if (!verified) {
            // Try with different time offsets to debug
            console.log('🔍 Debugging TOTP verification:');
            for (let offset = -2; offset <= 2; offset++) {
                const testTime = Math.floor(Date.now() / 1000) + (offset * 30);
                const testVerified = speakeasy_1.default.totp.verify({
                    secret: user.totp_secret,
                    encoding: 'base32',
                    token: token.toString().trim(),
                    window: 1,
                    time: testTime
                });
                console.log(`Time offset ${offset * 30}s: ${testVerified}`);
            }
            return res.status(400).json({ error: 'Invalid TOTP token' });
        }
        // Enable TOTP for user
        await (0, knex_1.default)('users')
            .where('id', req.user.userId)
            .update({
            totp_enabled: true,
            updated_at: new Date().toISOString()
        });
        console.log('✅ TOTP enabled successfully for user:', user.email);
        res.json({ message: 'TOTP enabled successfully' });
    }
    catch (err) {
        console.error('TOTP verification error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Verify TOTP/2FA
router.post('/totp/verify', authMiddleware_1.authenticateToken, async (req, res) => {
    const { token } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'TOTP token required' });
    }
    try {
        const user = await (0, knex_1.default)('users')
            .where('id', req.user.userId)
            .first();
        if (!user || !user.totp_secret) {
            return res.status(400).json({ error: 'TOTP not configured' });
        }
        console.log('🔑 Verifying TOTP for user:', user.email);
        console.log('🔑 Token received:', token);
        // Increase window for verification to handle timing issues
        const verified = speakeasy_1.default.totp.verify({
            secret: user.totp_secret,
            encoding: 'base32',
            token: token.toString().trim(), // Ensure token is string and trimmed
            window: 6, // Increased window (allows ±3 time steps = ±90 seconds)
            time: Date.now() / 1000 // Use current time explicitly
        });
        console.log('🔑 Verification result:', verified);
        if (!verified) {
            // Try with different time offsets to debug
            console.log('🔍 Debugging TOTP verification:');
            for (let offset = -2; offset <= 2; offset++) {
                const testTime = Math.floor(Date.now() / 1000) + (offset * 30);
                const testVerified = speakeasy_1.default.totp.verify({
                    secret: user.totp_secret,
                    encoding: 'base32',
                    token: token.toString().trim(),
                    window: 1,
                    time: testTime
                });
                console.log(`Time offset ${offset * 30}s: ${testVerified}`);
            }
            return res.status(400).json({ error: 'Invalid TOTP token' });
        }
        // Enable TOTP for user
        await (0, knex_1.default)('users')
            .where('id', req.user.userId)
            .update({
            totp_enabled: true,
            updated_at: new Date().toISOString()
        });
        console.log('✅ TOTP enabled successfully for user:', user.email);
        res.json({ message: 'TOTP verified successfully' });
    }
    catch (err) {
        console.error('TOTP verification error:', err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Login endpoint
router.post('/login', async (req, res) => {
    const { email, password, deviceFingerprint, totpToken } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password required' });
    }
    try {
        const user = await (0, knex_1.default)('users')
            .where('email', email.toLowerCase())
            .first();
        if (!user) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Verify password
        const validPassword = await argon2_1.default.verify(user.password_hash, password);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }
        // Check if TOTP is enabled
        if (user.totp_enabled) {
            if (!totpToken) {
                return res.status(200).json({
                    requiresTOTP: true,
                    message: 'TOTP token required'
                });
            }
            const verified = speakeasy_1.default.totp.verify({
                secret: user.totp_secret,
                encoding: 'base32',
                token: totpToken,
                window: 2
            });
            if (!verified) {
                return res.status(401).json({ error: 'Invalid TOTP token' });
            }
        }
        // Get user's organization membership
        const teamMember = await (0, knex_1.default)('team_members as tm')
            .join('organizations as o', 'tm.organization_id', 'o.id')
            .select('tm.role', 'o.id as org_id', 'o.name as org_name')
            .where('tm.user_id', user.id)
            .first();
        // Log successful login
        await (0, auditLogger_1.logAuditEvent)({
            userId: user.id,
            action: 'User login',
            ip: req.ip,
            userAgent: req.get('User-Agent'),
            metadata: { email }
        });
        // Generate JWT token
        const token = (0, authMiddleware_1.generateToken)({
            userId: user.id,
            orgId: teamMember?.org_id,
            role: teamMember?.role || user.role
        });
        res.json({
            message: 'Login successful',
            token,
            userId: user.id,
            orgId: teamMember?.org_id,
            orgName: teamMember?.org_name,
            role: teamMember?.role || user.role,
            firstName: user.first_name,
            lastName: user.last_name,
            email: user.email
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Helper function to bind temporary devices (implementation depends on your device binding logic)
async function bindTempDevices(userId, email) {
    // This would contain logic to bind any temporary devices created during signup
    // Implementation depends on your specific device binding requirements
    console.log(`Binding temporary devices for user ${userId} with email ${email}`);
}
// Get current user info
router.get('/me', authMiddleware_1.authenticateToken, async (req, res) => {
    try {
        const user = await (0, knex_1.default)('users')
            .where('id', req.user.userId)
            .first();
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        // Get user's organization membership
        const teamMember = await (0, knex_1.default)('team_members as tm')
            .join('organizations as o', 'tm.organization_id', 'o.id')
            .select('tm.role', 'o.id as org_id', 'o.name as org_name')
            .where('tm.user_id', user.id)
            .first();
        res.json({
            userId: user.id,
            email: user.email,
            firstName: user.first_name,
            lastName: user.last_name,
            name: user.name,
            role: teamMember?.role || user.role,
            orgId: teamMember?.org_id,
            orgName: teamMember?.org_name,
            totpEnabled: user.totp_enabled || false
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Signup device binding endpoint
router.post('/signup-device-bind', async (req, res) => {
    const { instanceId, fingerprint, email, signupToken, isOrgCreator } = req.body;
    if (!instanceId || !fingerprint || !email) {
        return res.status(400).json({ error: 'Missing required fields: instanceId, fingerprint, email' });
    }
    try {
        // Log the device binding attempt for audit purposes
        await (0, auditLogger_1.logAuditEvent)({
            userId: undefined, // No user ID yet during signup
            action: 'signup_device_bind_attempt',
            metadata: { instanceId, fingerprint, isOrgCreator, email },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        // For now, we'll just acknowledge the binding request
        // In a production environment, you might want to:
        // 1. Store the device binding temporarily
        // 2. Validate the device fingerprint
        // 3. Check for any security concerns
        // 4. Store the binding for later association with the user account
        console.log('Device binding request:', {
            instanceId,
            fingerprint,
            email,
            signupToken,
            isOrgCreator,
            timestamp: new Date().toISOString()
        });
        // Store temporary device binding (this could be in a temporary table or cache)
        // For now, we'll just return success
        res.json({
            success: true,
            message: 'Device binding recorded for signup process',
            bindingId: `bind_${instanceId}_${Date.now()}`,
            timestamp: new Date().toISOString()
        });
    }
    catch (err) {
        console.error('Signup device binding error:', err);
        // Log the failed attempt
        try {
            await (0, auditLogger_1.logAuditEvent)({
                userId: undefined,
                action: 'signup_device_bind_failed',
                metadata: { instanceId, fingerprint, email, error: err instanceof Error ? err.message : 'Unknown error' },
                ip: req.ip,
                userAgent: req.get('User-Agent')
            });
        }
        catch (logErr) {
            console.error('Failed to log audit event:', logErr);
        }
        res.status(500).json({ error: 'Server error during device binding' });
    }
});
exports.default = router;
