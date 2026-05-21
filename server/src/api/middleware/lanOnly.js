// server/src/api/middleware/lanOnly.js
const { isLanIp } = require('../../utils/networkUtils');

function lanOnlyMiddleware(req, res, next) {
  const clientIp = req.ip || req.connection.remoteAddress || '';
  const cleanIp = clientIp.replace('::ffff:', '');  // Strip IPv6 prefix

  // Always allow localhost
  if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost') {
    return next();
  }

  if (!isLanIp(cleanIp)) {
    return res.status(403).json({
      error: 'Access denied: This system is LAN-only.',
      your_ip: cleanIp
    });
  }
  next();
}

module.exports = { lanOnlyMiddleware };
