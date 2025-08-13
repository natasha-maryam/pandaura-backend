const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secure-secret-change-in-production';

// Create a test token with the same structure as the auth system would use
const testUser = {
  userId: 'test-user-123',
  email: 'test@pandaura.com',
  orgId: 'test-org-123'
};

const token = jwt.sign(testUser, JWT_SECRET, { expiresIn: '8h' });
console.log('Test JWT Token:');
console.log(token);
console.log('\nUse this token in your API calls like:');
console.log(`Authorization: Bearer ${token}`);
