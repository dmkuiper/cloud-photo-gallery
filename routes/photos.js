const express  = require('express');
const multer   = require('multer');
const crypto   = require('crypto');
const path     = require('path');
const db       = require('../config/db');
const { uploadToGCS, deleteFromGCS, getSignedUrl } = require('../config/storage');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Multer — keep files in memory so we can stream them to GCS
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, GIF, and WebP images are allowed.'));
    }
  },
});

// Helper: generate a unique GCS object path
function gcsPath(userId, originalName) {
  const ext  = path.extname(originalName).toLowerCase();
  const uuid = crypto.randomUUID();
  return `photos/${userId}/${uuid}${ext}`;
}

// ─── GET /photos/gallery ──────────────────────────────────────────────────────
router.get('/gallery', requireAuth, async (req, res) => {
  const { q } = req.query;
  const userId = req.session.userId;

  try {
    let rows;
    if (q && q.trim()) {
      // Full-text search across title, description, tags
      [rows] = await db.query(
        `SELECT * FROM photos
         WHERE user_id = ?
           AND MATCH(title, description, tags) AGAINST(? IN BOOLEAN MODE)
         ORDER BY created_at DESC`,
        [userId, q.trim() + '*']
      );

      // Fallback to LIKE if full-text returns nothing
      if (rows.length === 0) {
        const like = `%${q.trim()}%`;
        [rows] = await db.query(
          `SELECT * FROM photos
           WHERE user_id = ?
             AND (title LIKE ? OR description LIKE ? OR tags LIKE ?)
           ORDER BY created_at DESC`,
          [userId, like, like, like]
        );
      }
    } else {
      [rows] = await db.query(
        'SELECT * FROM photos WHERE user_id = ? ORDER BY created_at DESC',
        [userId]
      );
    }

    res.render('gallery', {
      photos:   rows,
      username: req.session.username,
      query:    q || '',
    });
  } catch (err) {
    console.error('Gallery error:', err);
    res.render('gallery', {
      photos:   [],
      username: req.session.username,
      query:    q || '',
      error:    'Failed to load photos.',
    });
  }
});

// ─── GET /photos/upload ───────────────────────────────────────────────────────
router.get('/upload', requireAuth, (req, res) => {
  res.render('upload', { username: req.session.username, error: null, success: null });
});

// ─── POST /photos/upload ──────────────────────────────────────────────────────
router.post('/upload', requireAuth, upload.single('photo'), async (req, res) => {
  const { title, description, tags } = req.body;
  const userId = req.session.userId;

  if (!req.file) {
    return res.render('upload', {
      username: req.session.username,
      error: 'Please select an image file.',
      success: null,
    });
  }

  if (!title || !title.trim()) {
    return res.render('upload', {
      username: req.session.username,
      error: 'Please provide a title for your photo.',
      success: null,
    });
  }

  try {
    const destination = gcsPath(userId, req.file.originalname);
    const publicUrl   = await uploadToGCS(req.file.buffer, destination, req.file.mimetype);

    await db.query(
      `INSERT INTO photos
         (user_id, title, description, tags, filename, original_name, mime_type, file_size, gcs_url, gcs_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        title.trim(),
        description ? description.trim() : '',
        tags ? tags.trim() : '',
        path.basename(destination),
        req.file.originalname,
        req.file.mimetype,
        req.file.size,
        publicUrl,
        destination,
      ]
    );

    res.render('upload', {
      username: req.session.username,
      error: null,
      success: `"${title.trim()}" uploaded successfully!`,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.render('upload', {
      username: req.session.username,
      error: 'Upload failed: ' + err.message,
      success: null,
    });
  }
});

// ─── GET /photos/download/:id ─────────────────────────────────────────────────
router.get('/download/:id', requireAuth, async (req, res) => {
  const userId  = req.session.userId;
  const photoId = parseInt(req.params.id, 10);

  try {
    const [rows] = await db.query(
      'SELECT * FROM photos WHERE id = ? AND user_id = ? LIMIT 1',
      [photoId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).send('Photo not found.');
    }

    const photo     = rows[0];
    const signedUrl = await getSignedUrl(photo.gcs_path, photo.original_name);

    // Redirect to the signed URL so the browser downloads the file
    res.redirect(signedUrl);
  } catch (err) {
    console.error('Download error:', err);
    res.status(500).send('Download failed: ' + err.message);
  }
});

// ─── POST /photos/delete/:id ──────────────────────────────────────────────────
router.post('/delete/:id', requireAuth, async (req, res) => {
  const userId  = req.session.userId;
  const photoId = parseInt(req.params.id, 10);

  try {
    const [rows] = await db.query(
      'SELECT * FROM photos WHERE id = ? AND user_id = ? LIMIT 1',
      [photoId, userId]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: 'Photo not found.' });
    }

    await deleteFromGCS(rows[0].gcs_path);
    await db.query('DELETE FROM photos WHERE id = ?', [photoId]);

    res.redirect('/photos/gallery');
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).send('Delete failed: ' + err.message);
  }
});

// ─── Multer error handler ─────────────────────────────────────────────────────
router.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err.message) {
    return res.render('upload', {
      username: req.session ? req.session.username : '',
      error: err.message,
      success: null,
    });
  }
  next(err);
});

module.exports = router;
