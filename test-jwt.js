const jwt = require('jsonwebtoken');

// Test JWT verification with the same secret
const JWT_SECRET = 'your-secure-secret-change-in-production';
const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiI2MThmMjk5Mi05YTEwLTQ2MWItYjk3Ni01Y2IzNDY1NTY4OTYiLCJvcmdJZCI6IjQzNmRlNjFmLThkZTItNDk3YS1iODRjLTNhNTI5N2JlOTUyMyIsInJvbGUiOiJBZG1pbiIsImlhdCI6MTc1NTMxMTcwOSwiZXhwIjoxNzU1MzQwNTA5fQ.OxdzLCN3AkgcSZYtRDy_6vNu9pPBjBlgRj9uFGQrBlo';

try {
  const decoded = jwt.verify(token, JWT_SECRET);
  console.log('✅ JWT verification successful:');
  console.log(JSON.stringify(decoded, null, 2));
  
  // Check expiration
  const now = Math.floor(Date.now() / 1000);
  if (decoded.exp < now) {
    console.log('❌ Token is expired');
    console.log(`Token exp: ${decoded.exp}, Current time: ${now}`);
    console.log(`Expired ${now - decoded.exp} seconds ago`);
  } else {
    console.log(`✅ Token is valid for ${decoded.exp - now} more seconds`);
  }
} catch (error) {
  console.log('❌ JWT verification failed:');
  console.log(error.message);
}
