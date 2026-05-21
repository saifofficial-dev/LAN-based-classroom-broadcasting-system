// server/src/api/routes/classroom.js
const express = require('express');
const router = express.Router();
const { dbAsync } = require('../../config/database');

// Create classroom
router.post('/', async (req, res) => {
  const { teacher_id, name, room_code, password, lan_ip, max_students } = req.body;
  try {
    const result = await dbAsync.run(
      'INSERT INTO classrooms (teacher_id, name, room_code, password, lan_ip, max_students) VALUES (?, ?, ?, ?, ?, ?)',
      [teacher_id, name, room_code, password, lan_ip, max_students || 50]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get classroom by code
router.get('/:code', async (req, res) => {
  try {
    const classroom = await dbAsync.get('SELECT * FROM classrooms WHERE room_code = ?', [req.params.code]);
    if (!classroom) return res.status(404).json({ error: 'Classroom not found' });
    res.json(classroom);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update classroom status
router.patch('/:code/status', async (req, res) => {
  const { is_active } = req.body;
  try {
    await dbAsync.run('UPDATE classrooms SET is_active = ? WHERE room_code = ?', [is_active, req.params.code]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
