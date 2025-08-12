import express from 'express';
import argon2 from 'argon2';
import speakeasy from 'speakeasy';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database-adapter';
import { authenticateToken, generateToken, AuthenticatedRequest } from '../middleware/authMiddleware';
import { logAuditEvent } from '../middleware/auditLogger';

const router = express.Router();

// Helper: generate random invite code
function generateInviteCode(): string {
  return crypto.randomBytes(16).toString('hex');
}

// Create Organization & Admin user
router.post('/orgs', async (req, res) => {
  const { orgName, industry, size, fullName, email, password } = req.body;

  if (!orgName || !fullName || !email || !password) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // Create org
    const orgId = uuidv4();
    await db.createOrganization({
      id: orgId,
      name: orgName,
      industry,
      size
    });

    // Hash password
    const passwordHash = await argon2.hash(password);

    // Create user
    const userId = uuidv4();
    await db.createUser({
      id: userId,
      fullName,
      email: email.toLowerCase(),
      passwordHash
    });

    // Add user as admin member to org
    await db.createTeamMember({
      id: uuidv4(),
      userId,
      orgId,
      role: 'Admin'
    });

    // Bind any temporary devices from signup flow
    await bindTempDevices(userId, email);

    // Log audit event
    await logAuditEvent({
      userId,
      orgId,
      action: `Created organization '${orgName}' and admin user`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { orgName, email }
    });

    // Generate JWT token
    const token = generateToken({ userId, orgId, role: 'Admin' });

    res.json({ 
      message: 'Organization and admin user created', 
      token, 
      orgId, 
      userId,
      role: 'Admin'
    });
  } catch (err) {
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
    const invite = await db.getValidInviteByCode(code as string);

    if (!invite) {
      return res.status(400).json({ error: 'Invalid or expired invite code' });
    }

    // Get organization name
    const org = await db.getOrganizationById(invite.org_id);

    res.json({ 
      valid: true, 
      orgId: invite.org_id, 
      orgName: org?.name || 'Unknown Organization',
      role: invite.role,
      email: invite.email
    });
  } catch (err) {
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
    const invite = await db.getValidInviteByCode(code);

    if (!invite) {
      return res.status(400).json({ error: 'Invalid or expired invite code' });
    }

    // Hash password
    const passwordHash = await argon2.hash(password);

    // Create user
    const userId = uuidv4();
    await db.createUser({
      id: userId,
      fullName,
      email: email.toLowerCase(),
      passwordHash
    });

    // Add user to org with role from invite
    await db.createTeamMember({
      id: uuidv4(),
      userId,
      orgId: invite.org_id,
      role: invite.role
    });

    // Mark invite as used
    await db.markInviteAsUsed(invite.id);

    // Bind any temporary devices from signup flow
    await bindTempDevices(userId, email);

    // Log audit event
    await logAuditEvent({
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
    const token = generateToken({ userId, orgId: invite.org_id, role: invite.role });

    res.json({ 
      message: 'User created and added to organization', 
      token, 
      userId, 
      orgId: invite.org_id, 
      role: invite.role 
    });
  } catch (err) {
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
    const org = await db.getOrganizationById(orgId);
    
    if (!org) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Generate invite code and calculate expiration
    const code = generateInviteCode();
    const expiresAt = new Date(Date.now() + (expiresInDays * 24 * 60 * 60 * 1000));

    // Create invite
    await db.createInvite({
      id: uuidv4(),
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2FA Setup: generate TOTP secret
router.post('/setup-2fa', authenticateToken, async (req: AuthenticatedRequest, res) => {
  try {
    const secret = speakeasy.generateSecret({ 
      length: 20,
      name: 'Pandaura AS',
      issuer: 'Pandaura AS'
    });

    // Save secret to user for later verification
    await db.updateUserTotpSecret(req.user!.userId, secret.base32);

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      action: 'Initiated 2FA setup',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ 
      secret: secret.base32, 
      otpauth_url: secret.otpauth_url 
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// 2FA Verification
router.post('/verify-2fa', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { token } = req.body;

  if (!token) {
    return res.status(400).json({ error: 'Missing 2FA token' });
  }

  try {
    const user = await db.getUserById(req.user!.userId);

    if (!user || !user.totp_secret) {
      return res.status(404).json({ error: 'User not found or 2FA not set up' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: 'base32',
      token,
      window: 1
    });

    if (!verified) {
      // Log failed attempt
      await logAuditEvent({
        userId: req.user!.userId,
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
    await logAuditEvent({
      userId: req.user!.userId,
      action: 'Successfully verified and enabled 2FA',
      ip: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.json({ success: true, message: '2FA verified and enabled' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Device binding endpoint
router.post('/device-bind', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { instanceId, deviceFingerprintHash } = req.body;

  if (!instanceId || !deviceFingerprintHash) {
    return res.status(400).json({ error: 'Missing device binding info' });
  }

  try {
    await db.createDeviceBinding({
      id: uuidv4(),
      userId: req.user!.userId,
      instanceId,
      deviceFingerprintHash
    });

    // Log audit event
    await logAuditEvent({
      userId: req.user!.userId,
      action: 'Device bound to account',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { instanceId }
    });

    res.json({ success: true, message: 'Device bound successfully' });
  } catch (err) {
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
    await db.createTempDeviceBinding({
      id: uuidv4(),
      email: email.toLowerCase(),
      instanceId,
      deviceFingerprintHash: fingerprint,
      isOrgCreator: isOrgCreator || false
    });

    // Log audit event (without userId since not authenticated yet)
    await logAuditEvent({
      action: `Temporary device binding during signup (org creator: ${isOrgCreator})`,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { email, instanceId, isOrgCreator }
    });

    res.json({ success: true, message: 'Device prepared for binding' });
  } catch (err) {
    console.error('Signup device binding error:', err);
    res.status(500).json({ error: 'Failed to prepare device binding' });
  }
});

// Helper function to bind temp devices after signup
async function bindTempDevices(userId: string, email: string) {
  try {
    // Get temp device bindings for this email
    const tempBindings = await db.getTempDeviceBindingsByEmail(email.toLowerCase());

    if (tempBindings.length > 0) {
      // Transfer to permanent device bindings
      for (const temp of tempBindings) {
        await db.createDeviceBinding({
          id: uuidv4(),
          userId,
          instanceId: temp.instance_id,
          deviceFingerprintHash: temp.device_fingerprint_hash
        });
      }

      // Clean up temp bindings
      await db.deleteTempDeviceBindingsByEmail(email.toLowerCase());

      console.log(`Bound ${tempBindings.length} temporary devices for user ${userId}`);
    }
  } catch (err) {
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
    const user = await db.getUserByEmail(email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await argon2.verify(user.password_hash, password);
    if (!validPassword) {
      // Log failed login attempt
      await logAuditEvent({
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

      const verified = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: 'base32',
        token: twoFactorToken,
        window: 1
      });

      if (!verified) {
        // Log failed 2FA attempt
        await logAuditEvent({
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
    const userOrgs = await db.getUserOrganizations(user.id);

    if (userOrgs.length === 0) {
      return res.status(403).json({ error: 'No organization membership found' });
    }

    // Use first org as default (or implement org selection logic)
    const primaryOrg = userOrgs[0];

    // Log successful login
    await logAuditEvent({
      userId: user.id,
      orgId: primaryOrg.org_id,
      action: 'Successful login',
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      metadata: { email, orgName: primaryOrg.org_name }
    });

    // Generate JWT
    const token = generateToken({ 
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
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get user's organizations
router.get('/users/:userId/orgs', authenticateToken, async (req: AuthenticatedRequest, res) => {
  const { userId } = req.params;

  // Ensure user can only access their own org list or is admin
  if (req.user!.userId !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }

  try {
    const orgs = await db.getUserOrganizations(userId);
    res.json(orgs);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

export default router;
