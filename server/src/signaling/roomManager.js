// server/src/signaling/roomManager.js
const bcrypt = require('bcrypt');

class Room {
  constructor(code, options) {
    this.code = code;
    this.teacherSocketId = options.teacherSocketId;
    this.teacherName = options.teacherName;
    this.teacherIp = options.teacherIp;
    this.passwordHash = options.password
      ? bcrypt.hashSync(options.password, 10)
      : null;
    this.maxStudents = options.maxStudents || 50;
    this.students = new Map();   // socketId → { name, ip, joinedAt, handRaised }
    this.broadcastActive = false;
    this.createdAt = options.createdAt || Date.now();
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
      hasPassword: !!this.passwordHash
    };
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(code, options) {
    if (this.rooms.has(code)) {
      throw new Error(`Room ${code} already exists`);
    }
    const room = new Room(code, options);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get(code) || null;
  }

  closeRoom(code) {
    this.rooms.delete(code);
  }

  getRoomList() {
    return Array.from(this.rooms.values()).map(r => r.getPublicInfo());
  }
}

module.exports = { RoomManager, Room };
