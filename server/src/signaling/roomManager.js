// server/src/signaling/roomManager.js
const bcrypt = require('bcrypt');
const fs     = require('fs');
const path   = require('path');

// ── Snapshot file location ────────────────────────────────────────────────────
// Written next to the running executable (or next to package.json in dev mode)
const isPackaged = typeof process.pkg !== 'undefined';
const BASE_DIR   = isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '../..');
const SNAPSHOT_PATH = path.join(BASE_DIR, 'rooms-snapshot.json');

class Room {
  constructor(code, options) {
    this.code = code;
    this.teacherSocketId = options.teacherSocketId || null;
    this.teacherName     = options.teacherName;
    this.teacherIp       = options.teacherIp || null;
    // Accept either a pre-hashed password (from snapshot) or a plaintext one
    if (options.passwordHash) {
      this.passwordHash = options.passwordHash;
    } else {
      this.passwordHash = options.password
        ? bcrypt.hashSync(options.password, 10)
        : null;
    }
    this.maxStudents    = options.maxStudents || 50;
    this.students       = new Map();   // socketId → { name, ip, joinedAt, handRaised }
    this.broadcastActive = false;
    this.createdAt      = options.createdAt || Date.now();
    // Flag: room was loaded from snapshot, awaiting teacher reconnect
    this.pendingTeacher = options.pendingTeacher || false;
  }

  checkPassword(password) {
    if (!this.passwordHash) return true;
    if (!password) return false;
    return bcrypt.compareSync(password, this.passwordHash);
  }

  addStudent(socketId, info) {
    this.students.set(socketId, {
      ...info,
      joinedAt: Date.now(),
      handRaised: false
    });
  }

  removeStudent(socketId) {
    this.students.delete(socketId);
  }

  isFull() {
    return this.students.size >= this.maxStudents;
  }

  getStudentCount() {
    return this.students.size;
  }

  getStudentList() {
    return Array.from(this.students.entries()).map(([id, info]) => ({
      socketId: id,
      name: info.name,
      ip: info.ip,
      joinedAt: info.joinedAt,
      handRaised: info.handRaised
    }));
  }

  getPublicInfo() {
    return {
      code: this.code,
      teacherName: this.teacherName,
      studentCount: this.students.size,
      broadcastActive: this.broadcastActive,
      hasPassword: !!this.passwordHash,
      pendingTeacher: this.pendingTeacher
    };
  }

  // Lightweight object safe to write to disk (no socket IDs, no live Map)
  toSnapshot() {
    return {
      code: this.code,
      teacherName: this.teacherName,
      passwordHash: this.passwordHash,
      maxStudents: this.maxStudents,
      createdAt: this.createdAt
    };
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  // ── Persistence ────────────────────────────────────────────────────────────

  /** Write all rooms to disk so they survive a server restart */
  persist() {
    try {
      const snapshot = Array.from(this.rooms.values()).map(r => r.toSnapshot());
      fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
    } catch (err) {
      // Non-fatal — log but don't crash
      console.error('[RoomManager] Failed to persist snapshot:', err.message);
    }
  }

  /** Load rooms from disk (called once at startup) */
  loadSnapshot() {
    try {
      if (!fs.existsSync(SNAPSHOT_PATH)) return;
      const data = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
      if (!Array.isArray(data)) return;
      for (const snap of data) {
        if (!snap.code) continue;
        const room = new Room(snap.code, {
          ...snap,
          pendingTeacher: true   // teacher hasn't reconnected yet
        });
        this.rooms.set(snap.code, room);
      }
      console.log(`[RoomManager] Restored ${this.rooms.size} room(s) from snapshot`);
    } catch (err) {
      console.error('[RoomManager] Failed to load snapshot:', err.message);
    }
  }

  // ── Room operations ────────────────────────────────────────────────────────

  createRoom(code, options) {
    const existing = this.rooms.get(code);
    if (existing && !existing.pendingTeacher) {
      throw new Error(`Room ${code} already exists`);
    }
    // If room is in snapshot/pending state, allow teacher to reclaim it
    const room = new Room(code, options);
    this.rooms.set(code, room);
    this.persist();
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code) || null;
  }

  closeRoom(code) {
    this.rooms.delete(code);
    this.persist();
  }

  getRoomList() {
    return Array.from(this.rooms.values()).map(r => r.getPublicInfo());
  }
}

module.exports = { RoomManager, Room };
