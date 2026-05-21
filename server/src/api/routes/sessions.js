// server/src/api/routes/sessions.js
const express = require('express');
const router = express.Router();
const { dbAsync } = require('../../config/database');

// Create session
router.post('/', async (req, res) => {
  const { classroom_id } = req.body;
  try {
    const result = await dbAsync.run(
      'INSERT INTO sessions (classroom_id) VALUES (?)',
      [classroom_id]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// End session
router.patch('/:id/end', async (req, res) => {
  try {
    const session = await dbAsync.get('SELECT * FROM sessions WHERE id = ?', [req.params.id]);
    if (!session) return res.status(404).json({ error: 'Session not found' });

    const duration = Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000);
    await dbAsync.run(
      'UPDATE sessions SET ended_at = ?, duration_secs = ? WHERE id = ?',
      [new Date().toISOString(), duration, req.params.id]
    );
    res.json({ success: true, duration });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Record attendance
router.post('/:id/attendance', async (req, res) => {
  const { student_name, student_ip } = req.body;
  try {
    const result = await dbAsync.run(
      'INSERT INTO attendance (session_id, student_name, student_ip) VALUES (?, ?, ?)',
      [req.params.id, student_name, student_ip]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
