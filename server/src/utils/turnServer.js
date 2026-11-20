// server/src/utils/turnServer.js
// Built-in LAN TURN server so WebRTC works with NO internet.
//
// Why: without internet, Google STUN is unreachable and Chrome hides each
// device's real IP behind an mDNS "xxxx.local" name. Many Wi-Fi routers /
// hotspots (and AP client-isolation) break that, so the direct teacher→student
// connection fails and students see a black screen. Relaying media through
// this server's LAN IP always works as long as both devices can reach it.
const Turn = require('node-turn');
const logger = require('./logger');

const TURN_PORT     = parseInt(process.env.TURN_PORT || '3478', 10);
const TURN_MIN_PORT = parseInt(process.env.TURN_MIN_PORT || '49160', 10);
const TURN_MAX_PORT = parseInt(process.env.TURN_MAX_PORT || '49400', 10);
const TURN_USER     = process.env.TURN_USER || 'classroom';
const TURN_PASS     = process.env.TURN_PASS || 'classroom-lan';

function startTurnServer() {
  try {
    const server = new Turn({
      authMech: 'long-term',
      credentials: { [TURN_USER]: TURN_PASS },
      realm: 'classroom.lan',
      listeningPort: TURN_PORT,
      minPort: TURN_MIN_PORT,
      maxPort: TURN_MAX_PORT,
      debugLevel: 'ERROR',
      log: (...args) => logger.info(`[TURN] ${args.join(' ')}`)
    });
    server.start();
    logger.info(`[TURN] LAN relay listening on UDP ${TURN_PORT} (relay ports ${TURN_MIN_PORT}-${TURN_MAX_PORT})`);
    return server;
  } catch (err) {
    logger.error(`[TURN] Failed to start: ${err.message}`);
    return null;
  }
}

// ICE config handed to browsers. `host` must be the address the browser used
// to reach this server, so the relay is reachable from that device.
function getIceConfig(host) {
  return {
    iceServers: [
      {
        urls: [`turn:${host}:${TURN_PORT}?transport=udp`],
        username: TURN_USER,
        credential: TURN_PASS
      }
    ]
  };
}

module.exports = { startTurnServer, getIceConfig, TURN_PORT, TURN_MIN_PORT, TURN_MAX_PORT };
