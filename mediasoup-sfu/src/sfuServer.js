// mediasoup-sfu/src/sfuServer.js
// Install: npm install mediasoup socket.io express

const mediasoup = require('mediasoup');
const { Server } = require('socket.io');
const http = require('http');
const express = require('express');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

let worker, router;
const producers = new Map();     // roomCode → Producer
const consumers = new Map();     // socketId → Consumer[]
const transports = new Map();    // socketId → { send, recv }

const mediaCodecs = [
  { kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2 },
  { kind: 'video', mimeType: 'video/VP8', clockRate: 90000 },
];

async function startSfu() {
  worker = await mediasoup.createWorker({
    rtcMinPort: 40000,
    rtcMaxPort: 49999,
    logLevel: 'warn'
  });

  router = await worker.createRouter({ mediaCodecs });
  console.log('[SFU] Mediasoup router ready');

  io.on('connection', (socket) => {
    // Teacher creates a send transport
    socket.on('sfu:create-send-transport', async (callback) => {
      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.LAN_IP }],
        enableUdp: true, enableTcp: true, preferUdp: true
      });

      transports.set(socket.id, { ...(transports.get(socket.id) || {}), send: transport });

      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
      });
    });

    // Teacher connects their send transport
    socket.on('sfu:connect-transport', async ({ transportId, dtlsParameters }) => {
      const t = transports.get(socket.id);
      if (t?.send?.id === transportId) await t.send.connect({ dtlsParameters });
      if (t?.recv?.id === transportId) await t.recv.connect({ dtlsParameters });
    });

    // Teacher starts producing
    socket.on('sfu:produce', async ({ kind, rtpParameters, roomCode }, callback) => {
      const t = transports.get(socket.id);
      if (!t?.send) return;

      const producer = await t.send.produce({ kind, rtpParameters });
      producers.set(`${roomCode}:${kind}`, producer);

      callback({ id: producer.id });

      // Notify all students in this room to consume
      socket.to(`room:${roomCode}`).emit('sfu:new-producer', { roomCode });
    });

    // Student creates recv transport and consumes
    socket.on('sfu:create-recv-transport', async (callback) => {
      const transport = await router.createWebRtcTransport({
        listenIps: [{ ip: '0.0.0.0', announcedIp: process.env.LAN_IP }],
        enableUdp: true, enableTcp: true, preferUdp: true
      });

      transports.set(socket.id, { ...(transports.get(socket.id) || {}), recv: transport });
      callback({
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters
      });
    });

    socket.on('sfu:consume', async ({ roomCode, rtpCapabilities }, callback) => {
      const kinds = ['video', 'audio'];
      const result = [];

      for (const kind of kinds) {
        const producer = producers.get(`${roomCode}:${kind}`);
        if (!producer) continue;
        if (!router.canConsume({ producerId: producer.id, rtpCapabilities })) continue;

        const t = transports.get(socket.id);
        const consumer = await t.recv.consume({
          producerId: producer.id,
          rtpCapabilities,
          paused: false
        });

        result.push({
          consumerId: consumer.id,
          producerId: producer.id,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters
        });
      }

      callback(result);
    });

    socket.on('sfu:get-rtp-capabilities', (callback) => {
      callback(router.rtpCapabilities);
    });
  });

  server.listen(3001, '0.0.0.0', () => {
    console.log('[SFU] Mediasoup SFU running on :3001');
  });
}

startSfu().catch(console.error);
