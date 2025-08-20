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
    console.log("req for org", req.body);
    if (!orgName || !fullName || !email || !password) {
        return res.status(400).json({ error: 'Missing required fields' });
    }
    try {
        // Create org
        const orgId = (0, uuid_1.v4)();
        await (0, knex_1.default)("organizations").insert({
            id: orgId,
            name: orgName,
            industry: industry,
            size: size,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
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
        // Set HttpOnly secure cookie
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        res.json({
            message: 'Organization and admin user created',
            token, // Still send in response for SPA compatibility
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
        // Set HttpOnly secure cookie
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        res.json({
            message: 'User account created successfully',
            token, // Still send in response for SPA compatibility
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
            two_factor_enabled: true,
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
    const { email, password, deviceFingerprint, twoFactorToken } = req.body;
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
            if (!twoFactorToken) {
                return res.status(200).json({
                    requiresTwoFactor: true,
                    message: 'TOTP token required'
                });
            }
            const verified = speakeasy_1.default.totp.verify({
                secret: user.totp_secret,
                encoding: 'base32',
                token: twoFactorToken,
                window: 2
            });
            if (!verified) {
                return res.status(401).json({ error: 'Invalid TOTP token' });
            }
        }
        // Get user's organization memberships (all organizations the user belongs to)
        const userOrganizations = await (0, knex_1.default)('team_members as tm')
            .join('organizations as o', 'tm.organization_id', 'o.id')
            .select('tm.role', 'o.id as org_id', 'o.name as org_name', 'o.industry', 'o.size')
            .where('tm.user_id', user.id);
        // Get the primary organization (first one or default)
        const primaryOrg = userOrganizations[0];
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
            orgId: primaryOrg?.org_id,
            role: primaryOrg?.role || user.role
        });
        // Set HttpOnly secure cookie
        res.cookie('authToken', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 24 * 60 * 60 * 1000 // 24 hours
        });
        res.json({
            message: 'Login successful',
            token, // Still send in response for SPA compatibility
            userId: user.id,
            fullName: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
            email: user.email,
            twoFactorEnabled: user.totp_enabled || false,
            orgId: primaryOrg?.org_id,
            orgName: primaryOrg?.org_name,
            role: primaryOrg?.role || user.role,
            organizations: userOrganizations
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});
// Helper function to bind temporary devices created during signup
async function bindTempDevices(userId, email) {
    try {
        console.log(`Binding temporary devices for user ${userId} with email ${email}`);
        // Find all temporary device bindings for this email (where user_id is null)
        const tempBindings = await (0, knex_1.default)('device_bindings')
            .whereNull('user_id')
            .where('email', email.toLowerCase())
            .where('expires_at', '>', new Date().toISOString());
        console.log(`Found ${tempBindings.length} temporary device bindings for ${email}`);
        // Update temporary bindings to permanent ones by setting user_id
        for (const tempBinding of tempBindings) {
            await (0, knex_1.default)('device_bindings')
                .where('id', tempBinding.id)
                .update({
                user_id: userId,
                email: null, // Clear email since we now have user_id
                expires_at: null, // Clear expiration since it's now permanent
                updated_at: new Date().toISOString(),
                last_used: new Date().toISOString()
            });
            console.log(`Transferred device binding: ${tempBinding.instance_id_hash} for user ${userId}`);
        }
        console.log(`Transferred ${tempBindings.length} temporary device bindings to user ${userId}`);
        // Clean up expired temporary bindings (housekeeping)
        const deletedCount = await (0, knex_1.default)('device_bindings')
            .whereNull('user_id')
            .where('expires_at', '<', new Date().toISOString())
            .del();
        if (deletedCount > 0) {
            console.log(`Cleaned up ${deletedCount} expired temporary device bindings`);
        }
    }
    catch (error) {
        console.error('Error binding temporary devices:', error);
        // Don't throw - this shouldn't break the signup flow
    }
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
// Signup device binding endpoint (no authentication required - stores temporary binding)
router.post('/signup-device-bind', async (req, res) => {
    const { instanceId, deviceFingerprintHash, email } = req.body;
    if (!instanceId || !deviceFingerprintHash || !email) {
        return res.status(400).json({ error: 'Missing device binding info (instanceId, deviceFingerprintHash, email required)' });
    }
    try {
        // Check if this email+device combination already exists
        const existingBinding = await (0, knex_1.default)('device_bindings')
            .where('email', email.toLowerCase())
            .where('device_fingerprint', deviceFingerprintHash)
            .first();
        if (existingBinding) {
            // Update existing temporary binding
            await (0, knex_1.default)('device_bindings')
                .where('id', existingBinding.id)
                .update({
                instance_id_hash: instanceId,
                updated_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            });
        }
        else {
            // Store new temporary device binding
            await (0, knex_1.default)('device_bindings').insert({
                id: (0, uuid_1.v4)(),
                user_id: null, // Temporary binding without user
                email: email.toLowerCase(),
                device_fingerprint: deviceFingerprintHash,
                device_fingerprint_hash: deviceFingerprintHash,
                instance_id_hash: instanceId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
                last_used: new Date().toISOString()
            });
        }
        // Log audit event without userId
        await (0, auditLogger_1.logAuditEvent)({
            userId: undefined,
            action: 'temp_device_bound',
            metadata: { instanceId, deviceFingerprintHash, email },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        res.json({
            success: true,
            message: 'Device binding recorded for signup process',
            bindingId: `temp_${instanceId}_${Date.now()}`
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to bind device' });
    }
});
// Device binding endpoint (requires authentication - for post-signup device binding)
router.post('/device-bind', authMiddleware_1.authenticateToken, async (req, res) => {
    const { instanceId, deviceFingerprintHash } = req.body;
    if (!instanceId || !deviceFingerprintHash) {
        return res.status(400).json({ error: 'Missing device binding info' });
    }
    try {
        // Check if this user+device combination already exists
        const existingBinding = await (0, knex_1.default)('device_bindings')
            .where('user_id', req.user.userId)
            .where('device_fingerprint', deviceFingerprintHash)
            .first();
        if (existingBinding) {
            // Update existing binding
            await (0, knex_1.default)('device_bindings')
                .where('id', existingBinding.id)
                .update({
                instance_id_hash: instanceId,
                updated_at: new Date().toISOString(),
                last_used: new Date().toISOString()
            });
        }
        else {
            // Insert new permanent device binding
            await (0, knex_1.default)('device_bindings').insert({
                id: (0, uuid_1.v4)(),
                user_id: req.user.userId,
                device_fingerprint: deviceFingerprintHash,
                device_fingerprint_hash: deviceFingerprintHash,
                instance_id_hash: instanceId,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                last_used: new Date().toISOString()
            });
        }
        // Log audit event
        await (0, auditLogger_1.logAuditEvent)({
            userId: req.user.userId,
            action: 'device_bound',
            metadata: { instanceId, deviceFingerprintHash },
            ip: req.ip,
            userAgent: req.get('User-Agent')
        });
        res.json({ success: true, message: 'Device bound successfully' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to bind device' });
    }
});
// Logout endpoint
router.post('/logout', (req, res) => {
    // Clear the HttpOnly cookie
    res.clearCookie('authToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.json({ message: 'Logged out successfully' });
});
exports.default = router;
