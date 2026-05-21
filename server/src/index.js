// server/src/index.js
const express = require('express');
const https = require('https');
const http = require('http');
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
const logger = require('./utils/logger');

const app = express();

// Detect LAN IP first (needed for SAN)
const PORT = process.env.PORT || 3000;
const LAN_IP = detectLanIp();

// Generate self-signed certificate with SAN for Chrome compatibility
console.log('[SSL] Generating self-signed certificate for', LAN_IP, '...');
const pems = generateCert(LAN_IP);
console.log('[SSL] Certificate ready');

const server = https.createServer({
  key: pems.key,
  cert: pems.cert,
  minVersion: 'TLSv1.2'
}, app);

// Also redirect HTTP → HTTPS
const httpRedirect = http.createServer((req, res) => {
  const host = req.headers.host?.replace(/:\d+$/, '');
  res.writeHead(301, { Location: `https://${host}:${PORT}${req.url}` });
  res.end();
});

const io = new Server(server, {
  cors: {
    origin: '*',        // LAN-only, so open CORS is fine
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling'],   // Allow both for compatibility
  pingTimeout: 5000,
  pingInterval: 2500
});

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
app.use('/student', express.static(path.join(__dirname, '../../student-app/public')));
app.use('/teacher', express.static(path.join(__dirname, '../../teacher-app/public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/classroom', classroomRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/files', fileRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', lan_ip: detectLanIp(), timestamp: Date.now() });
});

// Setup WebRTC signaling over Socket.IO
setupSignaling(io);

async function bootstrap() {
  await initDatabase();
  server.listen(PORT, '0.0.0.0', () => {
    logger.info(`=== Classroom Server Running ===`);
    logger.info(`LAN IP:    https://${LAN_IP}:${PORT}`);
    logger.info(`Teacher:   https://${LAN_IP}:${PORT}/teacher`);
    logger.info(`Student:   https://${LAN_IP}:${PORT}/student`);
    logger.info(`Note: Accept the self-signed cert warning in browser`);
    logger.info(`================================`);
  });
  // HTTP redirect on port 3001
  httpRedirect.listen(3001, '0.0.0.0');
}

bootstrap();
module.exports = { app, io };
