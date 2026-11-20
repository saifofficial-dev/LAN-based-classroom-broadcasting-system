// server/src/config/database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const isPackaged = typeof process.pkg !== 'undefined';
const dbPath = process.env.DB_PATH || (
  isPackaged
    ? path.join(path.dirname(process.execPath), 'classroom.db')
    : path.join(__dirname, '../../../database/classroom.db')
);
const dbDir = path.dirname(dbPath);

// Ensure database directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('[Database] Error opening database:', err.message);
  } else {
    console.log('[Database] Connected to SQLite database');
  }
});

// Promisify database methods for easier use
const dbAsync = {
  run: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  },
  get: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },
  all: (sql, params = []) => {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  },
  exec: (sql) => {
    return new Promise((resolve, reject) => {
      db.exec(sql, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
};

// Enable foreign keys
db.run('PRAGMA foreign_keys = ON');

// Initialize database schema
async function initDatabase() {
  const schemaPath = path.join(__dirname, '../database/schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await dbAsync.exec(schema);
    console.log('[Database] Schema initialized');
  }
}

module.exports = { db, dbAsync, initDatabase };
