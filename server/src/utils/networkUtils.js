// server/src/utils/networkUtils.js
const os = require('os');

function detectLanIp() {
  const interfaces = os.networkInterfaces();
  const candidates = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        candidates.push({ name, address: iface.address });
      }
    }
  }

  // Prefer 192.168.x.x (typical home/office LAN) over Docker/VPN ranges
  const preferred = candidates.find(c => c.address.startsWith('192.168.'));
  if (preferred) return preferred.address;

  // Then 10.x.x.x
  const ten = candidates.find(c => c.address.startsWith('10.'));
  if (ten) return ten.address;

  // Fallback to first available
  return candidates[0]?.address || '127.0.0.1';
}

function isLanIp(ip) {
  return (
    ip.startsWith('192.168.') ||
    ip.startsWith('10.')      ||
    ip.startsWith('172.16.')  ||
    ip.startsWith('172.17.')  ||
    ip.startsWith('172.18.')  ||
    ip.startsWith('172.19.')  ||
    ip.match(/^172\.(2[0-9]|3[0-1])\./) !== null ||
    ip === '127.0.0.1'
  );
}

module.exports = { detectLanIp, isLanIp };
