-- schema.sql

PRAGMA foreign_keys = ON;

-- Teachers (system users)
CREATE TABLE IF NOT EXISTS teachers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    username    TEXT UNIQUE NOT NULL,
    password    TEXT NOT NULL,          -- bcrypt hashed
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Classrooms
CREATE TABLE IF NOT EXISTS classrooms (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    teacher_id      INTEGER NOT NULL,
    name            TEXT NOT NULL,
    room_code       TEXT UNIQUE NOT NULL,   -- e.g. "MATH-101"
    password        TEXT,                   -- bcrypt hashed, optional
    lan_ip          TEXT NOT NULL,          -- Teacher's LAN IP
    port            INTEGER DEFAULT 3000,
    max_students    INTEGER DEFAULT 50,
    is_active       INTEGER DEFAULT 0,      -- 0=inactive, 1=active
    created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (teacher_id) REFERENCES teachers(id)
);

-- Sessions (each broadcast instance)
CREATE TABLE IF NOT EXISTS sessions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    classroom_id    INTEGER NOT NULL,
    started_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
    ended_at        DATETIME,
    duration_secs   INTEGER,
    recording_path  TEXT,
    FOREIGN KEY (classroom_id) REFERENCES classrooms(id)
);

-- Attendance
CREATE TABLE IF NOT EXISTS attendance (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL,
    student_name    TEXT NOT NULL,
    student_ip      TEXT NOT NULL,
    joined_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    left_at         DATETIME,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Chat messages
CREATE TABLE IF NOT EXISTS chat_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    sender_name TEXT NOT NULL,
    sender_role TEXT DEFAULT 'student',   -- 'teacher' | 'student'
    message     TEXT NOT NULL,
    sent_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Shared files
CREATE TABLE IF NOT EXISTS shared_files (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      INTEGER NOT NULL,
    filename        TEXT NOT NULL,
    original_name   TEXT NOT NULL,
    file_size       INTEGER,
    mime_type       TEXT,
    shared_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Whiteboard snapshots (periodic saves)
CREATE TABLE IF NOT EXISTS whiteboard_snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  INTEGER NOT NULL,
    snapshot    TEXT NOT NULL,    -- JSON of canvas state
    saved_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sessions_classroom ON sessions(classroom_id);
CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_session ON chat_messages(session_id);
