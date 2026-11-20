// server/src/signaling/signalingServer.js
const { RoomManager } = require('./roomManager');
const logger = require('../utils/logger');
const { verifySessionToken } = require('../utils/crypto');

const rooms = new RoomManager();

// Restore any rooms that existed before a server restart
rooms.loadSnapshot();

function setupSignaling(io) {

  io.on('connection', (socket) => {
    const clientIp = socket.handshake.address.replace('::ffff:', '');
    logger.info(`[Socket] New connection: ${socket.id} from ${clientIp}`);

    // ─── ROOM MANAGEMENT ────────────────────────────────────────────

    // Student browses available rooms
    socket.on('get-rooms', (callback) => {
      const list = rooms.getRoomList();
      callback({ rooms: list });
    });

    // Teacher creates/opens classroom
    // If the room was restored from a snapshot (pendingTeacher=true), the teacher
    // is allowed to reclaim it — no "already exists" error.
    socket.on('teacher:create-room', async (data, callback) => {
      const { roomCode, password, teacherName, sessionToken } = data;

      try {
        if (!verifySessionToken(sessionToken)) {
          return callback({ error: 'Unauthorized' });
        }

        // Check if this is a snapshot-restored room that the teacher is reclaiming
        const existingRoom = rooms.getRoom(roomCode);
        let room;

        if (existingRoom && existingRoom.pendingTeacher) {
          // ── Reclaim: update teacher socket and mark as active ──────
          existingRoom.teacherSocketId = socket.id;
          existingRoom.teacherIp       = clientIp;
          existingRoom.teacherName     = teacherName;
          existingRoom.pendingTeacher  = false;
          room = existingRoom;
          logger.info(`[Room] Reclaimed from snapshot: ${roomCode} by ${teacherName}`);
        } else {
          // ── Create fresh room ──────────────────────────────────────
          room = rooms.createRoom(roomCode, {
            teacherSocketId: socket.id,
            teacherName,
            password,
            teacherIp: clientIp,
            createdAt: Date.now()
          });
          logger.info(`[Room] Created: ${roomCode} by ${teacherName}`);
        }

        socket.join(`room:${roomCode}`);
        socket.roomCode    = roomCode;
        socket.role        = 'teacher';
        socket.displayName = teacherName;

        io.emit('rooms:updated', { rooms: rooms.getRoomList() });
        callback({ success: true, room: room.getPublicInfo() });
      } catch (err) {
        callback({ error: err.message });
      }
    });

    // Student joins classroom
    socket.on('student:join-room', async (data, callback) => {
      const { roomCode, password, studentName } = data;

      try {
        const room = rooms.getRoom(roomCode);
        if (!room) return callback({ error: 'Classroom not found' });
        if (!room.checkPassword(password)) return callback({ error: 'Wrong password' });
        if (room.isFull()) return callback({ error: 'Classroom is full' });

        room.addStudent(socket.id, { name: studentName, ip: clientIp });
        socket.join(`room:${roomCode}`);
        socket.roomCode    = roomCode;
        socket.role        = 'student';
        socket.displayName = studentName;

        // Notify teacher of new student (teacher may not be connected yet if still reconnecting)
        if (room.teacherSocketId) {
          const teacherSocket = io.sockets.sockets.get(room.teacherSocketId);
          if (teacherSocket) {
            teacherSocket.emit('teacher:student-joined', {
              studentId: socket.id,
              studentName,
              studentIp: clientIp,
              totalStudents: room.getStudentCount()
            });
          }
        }

        // Tell student to initiate WebRTC offer to teacher
        callback({
          success: true,
          teacherSocketId: room.teacherSocketId,
          roomInfo: room.getPublicInfo(),
          students: room.getStudentList()
        });

        // Broadcast updated student list to teacher
        io.to(`room:${roomCode}`).emit('room:student-list-updated', {
          students: room.getStudentList()
        });

        logger.info(`[Room] ${studentName} joined room ${roomCode}`);
      } catch (err) {
        callback({ error: err.message });
      }
    });

    // ─── WEBRTC SIGNALING ────────────────────────────────────────────

    // Offer relay (teacher→student or student→teacher)
    socket.on('webrtc:offer', (data) => {
      const { targetSocketId, offer, studentName, teacherName } = data;
      logger.debug(`[WebRTC] Offer from ${socket.id} to ${targetSocketId}`);
      io.to(targetSocketId).emit('webrtc:offer', {
        fromSocketId: socket.id,
        offer,
        studentName,
        teacherName
      });
    });

    // Answer relay
    socket.on('webrtc:answer', (data) => {
      const { targetSocketId, answer } = data;
      logger.debug(`[WebRTC] Answer from ${socket.id} to ${targetSocketId}`);
      io.to(targetSocketId).emit('webrtc:answer', {
        fromSocketId: socket.id,
        answer
      });
    });

    // ICE candidate exchange
    socket.on('webrtc:ice-candidate', (data) => {
      const { targetSocketId, candidate } = data;
      io.to(targetSocketId).emit('webrtc:ice-candidate', {
        fromSocketId: socket.id,
        candidate
      });
    });

    // ─── BROADCAST CONTROL ───────────────────────────────────────────

    socket.on('teacher:start-broadcast', (data, callback) => {
      const room = rooms.getRoom(socket.roomCode);
      if (!room || socket.role !== 'teacher') return;
      room.broadcastActive = true;
      socket.to(`room:${socket.roomCode}`).emit('broadcast:started', {
        teacherName: socket.displayName
      });
      logger.info(`[Broadcast] Started in room ${socket.roomCode}`);
      // Return current student list so teacher can create peer connections
      if (typeof callback === 'function') {
        callback({ students: room.getStudentList() });
      }
    });

    socket.on('teacher:stop-broadcast', () => {
      const room = rooms.getRoom(socket.roomCode);
      if (!room || socket.role !== 'teacher') return;
      room.broadcastActive = false;
      socket.to(`room:${socket.roomCode}`).emit('broadcast:stopped');
    });

    // Teacher deliberately ends the session (permanent close)
    socket.on('teacher:end-room', ({ roomCode: code }) => {
      const targetCode = code || socket.roomCode;
      const room = rooms.getRoom(targetCode);
      if (!room) return;
      // Notify students — reconnecting:false tells them to clear their sessions
      io.to(`room:${targetCode}`).emit('broadcast:teacher-left', {
        message: 'Teacher ended the session',
        reconnecting: false
      });
      rooms.closeRoom(targetCode);
      io.emit('rooms:updated', { rooms: rooms.getRoomList() });
      logger.info(`[Room] Deliberately ended by teacher: ${targetCode}`);
    });

    // ─── WHITEBOARD ──────────────────────────────────────────────────

    socket.on('whiteboard:draw', (data) => {
      if (socket.role !== 'teacher') return;
      socket.to(`room:${socket.roomCode}`).emit('whiteboard:draw', data);
    });

    socket.on('whiteboard:clear', () => {
      if (socket.role !== 'teacher') return;
      socket.to(`room:${socket.roomCode}`).emit('whiteboard:clear');
    });

    socket.on('whiteboard:undo', () => {
      if (socket.role !== 'teacher') return;
      socket.to(`room:${socket.roomCode}`).emit('whiteboard:undo');
    });

    socket.on('whiteboard:sync-request', (callback) => {
      // Student requesting current whiteboard state
      const room = rooms.getRoom(socket.roomCode);
      if (!room) return;
      const teacherSocket = io.sockets.sockets.get(room.teacherSocketId);
      if (teacherSocket) {
        teacherSocket.emit('whiteboard:sync-request', { studentId: socket.id });
      }
    });

    socket.on('whiteboard:sync-response', (data) => {
      // Teacher sends full canvas state to a specific student
      const { targetStudentId, canvasData } = data;
      io.to(targetStudentId).emit('whiteboard:sync-response', { canvasData });
    });

    // ─── POINTER ─────────────────────────────────────────────────────

    socket.on('pointer:move', (data) => {
      if (socket.role !== 'teacher') return;
      // Broadcast pointer position to all students (throttled client-side)
      socket.to(`room:${socket.roomCode}`).emit('pointer:move', {
        x: data.x,          // Normalized 0–1
        y: data.y,
        mode: data.mode      // 'normal' | 'laser' | 'highlight'
      });
    });

    socket.on('pointer:hide', () => {
      if (socket.role !== 'teacher') return;
      socket.to(`room:${socket.roomCode}`).emit('pointer:hide');
    });

    // ─── CHAT ────────────────────────────────────────────────────────

    socket.on('chat:message', (data) => {
      const { message } = data;
      if (!message || message.trim().length === 0) return;
      const payload = {
        senderId: socket.id,
        senderName: socket.displayName,
        senderRole: socket.role,
        message: message.trim().substring(0, 500),
        timestamp: Date.now()
      };
      io.to(`room:${socket.roomCode}`).emit('chat:message', payload);
    });

    // ─── RAISE HAND ──────────────────────────────────────────────────

    socket.on('student:raise-hand', () => {
      const room = rooms.getRoom(socket.roomCode);
      if (!room) return;
      io.to(room.teacherSocketId).emit('student:hand-raised', {
        studentId: socket.id,
        studentName: socket.displayName
      });
      socket.to(`room:${socket.roomCode}`).emit('student:hand-raised-public', {
        studentName: socket.displayName
      });
    });

    socket.on('student:lower-hand', () => {
      const room = rooms.getRoom(socket.roomCode);
      if (!room) return;
      io.to(room.teacherSocketId).emit('student:hand-lowered', {
        studentId: socket.id
      });
    });

    // ─── FILE SHARING ─────────────────────────────────────────────────

    socket.on('teacher:file-shared', (data) => {
      if (socket.role !== 'teacher') return;
      socket.to(`room:${socket.roomCode}`).emit('file:available', {
        fileId: data.fileId,
        fileName: data.fileName,
        fileSize: data.fileSize,
        mimeType: data.mimeType,
        downloadUrl: `/uploads/${data.fileId}/${data.fileName}` 
      });
    });

    // ─── DISCONNECT ───────────────────────────────────────────────────

    socket.on('disconnect', (reason) => {
      logger.info(`[Socket] Disconnected: ${socket.id} (${reason})`);
      if (!socket.roomCode) return;

      const room = rooms.getRoom(socket.roomCode);
      if (!room) return;

      if (socket.role === 'teacher') {
        // Teacher disconnected — mark room as pendingTeacher instead of closing
        // This allows recovery: students stay in the room waiting for teacher to return
        room.pendingTeacher  = true;
        room.teacherSocketId = null;
        socket.to(`room:${socket.roomCode}`).emit('broadcast:teacher-left', {
          message: 'Teacher disconnected — waiting for reconnect...',
          reconnecting: true
        });
        rooms.persist();  // Save state so server restart also recovers
        io.emit('rooms:updated', { rooms: rooms.getRoomList() });
        logger.info(`[Room] Teacher left room ${socket.roomCode} — kept alive for reconnect`);
      } else {
        // Student left
        room.removeStudent(socket.id);
        if (room.teacherSocketId) {
          io.to(room.teacherSocketId).emit('teacher:student-left', {
            studentId: socket.id,
            studentName: socket.displayName,
            totalStudents: room.getStudentCount()
          });
        }
        io.to(`room:${socket.roomCode}`).emit('room:student-list-updated', {
          students: room.getStudentList()
        });
      }
    });
  });
}

module.exports = { setupSignaling };
