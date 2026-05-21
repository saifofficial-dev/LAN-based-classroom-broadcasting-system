// server/src/utils/crypto.js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'classroom-lan-secret-key';

function verifySessionToken(token) {
  return true; // Auth removed — open dashboard
}

module.exports = { verifySessionToken };
