// server/src/index.js

// ── pkg native-module fix (must be before all other requires) ────────────────
if (typeof process.pkg !== 'undefined') {
  const _fs  = require('fs');
  const _path = require('path');
  const _os   = require('os');
  const _mod  = require('module');

  const tmpDir = _path.join(_os.tmpdir(), 'classroom-server-natives');
  if (!_fs.existsSync(tmpDir)) _fs.mkdirSync(tmpDir, { recursive: true });

  const natives = {
    'node_sqlite3.node': _path.join(__dirname, '../node_modules/sqlite3/build/Release/node_sqlite3.node'),
    'bcrypt_lib.node':   _path.join(__dirname, '../node_modules/bcrypt/lib/binding/napi-v3/bcrypt_lib.node')
  };
  for (const [name, src] of Object.entries(natives)) {
    const dest = _path.join(tmpDir, name);
    if (!_fs.existsSync(dest)) _fs.writeFileSync(dest, _fs.readFileSync(src));
  }

  const _orig = _mod._resolveFilename.bind(_mod);
  _mod._resolveFilename = function(req, parent, isMain, opts) {
    if (typeof req === 'string' && req.endsWith('.node')) {
      const candidate = _path.join(tmpDir, _path.basename(req));
      if (_fs.existsSync(candidate)) return candidate;
    }
    return _orig(req, parent, isMain, opts);
  };
}
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const http    = require('http');
const https   = require('https');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { generateCert } = require('./utils/generateCert');
const { initDatabase } = require('./config/database');
const { setupSignaling } = require('./signaling/signalingServer');
const { lanOnlyMiddleware } = require('./api/middleware/lanOnly');
const authRoutes = require('./api/routes/auth');
const classroomRoutes = require('./api/routes/classroom');
const sessionRoutes = require('./api/routes/sessions');
const fileRoutes = require('./api/routes/files');
const { detectLanIp } = require('./utils/networkUtils');
const { startTurnServer, getIceConfig } = require('./utils/turnServer');
const logger = require('./utils/logger');

const app = express();

const PORT_HTTP  = process.env.PORT      || 3000;  // students  — plain HTTP
const PORT_HTTPS = process.env.PORT_SSL  || 3001;  // teacher   — HTTPS (secure context for screen share)
const LAN_IP     = detectLanIp();

// HTTP server — students, no cert warning
const httpServer = http.createServer(app);

// HTTPS server — teacher, self-signed cert (one-time accept in browser)
const pems = generateCert(LAN_IP);
const httpsServer = https.createServer({ key: pems.key, cert: pems.cert, minVersion: 'TLSv1.2' }, app);

// One Socket.IO instance shared across both servers
const io = new Server(httpServer, {
  cors: { origin: '*', methods: ['GET', 'POST'] },
  transports: ['polling', 'websocket'],
  pingTimeout: 10000,
  pingInterval: 5000
});
io.attach(httpsServer);   // same rooms/events on HTTPS port too

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply LAN-only middleware to all routes except Socket.IO
app.use((req, res, next) => {
  if (req.path.startsWith('/socket.io')) {
    next(); // Allow Socket.IO without LAN check
  } else {
    lanOnlyMiddleware(req, res, next);
  }
});

// Static files — serve student app
const isPackaged = typeof process.pkg !== 'undefined';
const exeDir = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
app.use('/student', express.static(isPackaged ? path.join(__dirname, '../../student-app/public') : path.join(__dirname, '../../student-app/public')));
app.use('/teacher', express.static(isPackaged ? path.join(__dirname, '../../teacher-app/public') : path.join(__dirname, '../../teacher-app/public')));
app.use('/uploads', express.static(path.join(exeDir, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/classroom', classroomRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/files', fileRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status:       'ok',
    lan_ip:       LAN_IP,
    student_url:  `http://${LAN_IP}:${PORT_HTTP}/student`,
    teacher_url:  `https://${LAN_IP}:${PORT_HTTPS}/teacher`,
    timestamp:    Date.now()
  });
});

// WebRTC ICE config (LAN TURN relay — works without internet)
app.get('/api/ice-config', (req, res) => {
  let host = req.hostname;
  if (!host || host === 'localhost' || host.startsWith('127.') || host === '::1' || host === '[::1]') {
    host = LAN_IP; // loopback relay can't reach other devices — use the LAN address
  }
  res.json(getIceConfig(host));
});

// Setup WebRTC signaling over Socket.IO
setupSignaling(io);

async function bootstrap() {
  await initDatabase();
  startTurnServer();
  httpServer.listen(PORT_HTTP, '0.0.0.0', () => {
    logger.info(`=== Classroom Server Running ===`);
    logger.info(`Student:  http://${LAN_IP}:${PORT_HTTP}/student  (no cert)`);
    logger.info(`Teacher:  https://${LAN_IP}:${PORT_HTTPS}/teacher  (accept cert once)`);
    logger.info(`================================`);
  });
  httpsServer.listen(PORT_HTTPS, '0.0.0.0');
}

bootstrap();
module.exports = { app, io };
