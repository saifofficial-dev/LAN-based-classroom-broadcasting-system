// server/src/api/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { dbAsync } = require('../../config/database');
const JWT_SECRET = process.env.JWT_SECRET || 'classroom-lan-secret-key';

// Teacher login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  try {
    const teacher = await dbAsync.get('SELECT * FROM teachers WHERE username = ?', [username]);
    if (!teacher) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = await bcrypt.compare(password, teacher.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: teacher.id, username: teacher.username, role: 'teacher' },
      JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, teacher: { id: teacher.id, name: teacher.name, username: teacher.username } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Register teacher (first time / admin)
router.post('/register', async (req, res) => {
  const { name, username, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const result = await dbAsync.run(
      'INSERT INTO teachers (name, username, password) VALUES (?, ?, ?)',
      [name, username, hashed]
    );
    res.json({ success: true, id: result.lastID });
  } catch (err) {
    res.status(400).json({ error: 'Username already exists' });
  }
});

module.exports = router;
