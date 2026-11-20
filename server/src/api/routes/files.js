// server/src/api/routes/files.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { verifyToken } = require('../middleware/auth');

const isPackaged = typeof process.pkg !== 'undefined';
const uploadsBase = isPackaged
  ? path.join(path.dirname(process.execPath), 'uploads')
  : path.join(__dirname, '../../../uploads');

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.join(uploadsBase, req.params.sessionId || 'general');
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${Date.now()}-${safe}`);
  }
});

const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } }); // 100MB

router.post('/upload/:sessionId', verifyToken, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file' });
  res.json({
    fileId: req.params.sessionId,
    fileName: req.file.filename,
    originalName: req.file.originalname,
    fileSize: req.file.size,
    mimeType: req.file.mimetype,
    downloadUrl: `/uploads/${req.params.sessionId}/${req.file.filename}` 
  });
});

module.exports = router;
