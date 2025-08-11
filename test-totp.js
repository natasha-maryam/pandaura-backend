const speakeasy = require('speakeasy');

// TOTP secret for admin@gmail.com (from database)
const secret = 'K5STS3SJKIYGMMTDGI7FMO3IHE3ECQZM';

// Generate current TOTP token
const token = speakeasy.totp({
  secret: secret,
  encoding: 'base32'
});

console.log('=== TOTP Test for admin@gmail.com ===');
console.log('Current TOTP Code:', token);
console.log('This code expires in:', (30 - Math.floor(Date.now() / 1000) % 30), 'seconds');

// Verify the token (simulate backend verification)
const verified = speakeasy.totp.verify({
  secret: secret,
  encoding: 'base32',
  token: token,
  window: 1
});

console.log('Verification result:', verified ? '✅ VALID' : '❌ INVALID');
