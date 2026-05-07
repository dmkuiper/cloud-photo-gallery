const express  = require('express');
const bcrypt   = require('bcryptjs');
const db       = require('../config/db');
const { redirectIfAuth } = require('../middleware/auth');

const router = express.Router();

// ─── GET /login ───────────────────────────────────────────────────────────────
router.get('/login', redirectIfAuth, (req, res) => {
  res.render('login', { error: null });
});

// ─── POST /login ──────────────────────────────────────────────────────────────
router.post('/login', redirectIfAuth, async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.render('login', { error: 'Please fill in all fields.' });
  }

  try {
    const [rows] = await db.query(
      'SELECT * FROM users WHERE username = ? LIMIT 1',
      [username]
    );

    if (rows.length === 0) {
      return res.render('login', { error: 'Invalid username or password.' });
    }

    const user = rows[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.render('login', { error: 'Invalid username or password.' });
    }

    req.session.userId   = user.id;
    req.session.username = user.username;
    req.session.save(() => res.redirect('/photos/gallery'));

  } catch (err) {
    console.error('Login error:', err);
    res.render('login', { error: 'Server error. Please try again.' });
  }
});

// ─── GET /register ────────────────────────────────────────────────────────────
router.get('/register', redirectIfAuth, (req, res) => {
  res.render('register', { error: null });
});

// ─── POST /register ───────────────────────────────────────────────────────────
router.post('/register', redirectIfAuth, async (req, res) => {
  const { username, email, password, confirmPassword } = req.body;

  if (!username || !email || !password || !confirmPassword) {
    return res.render('register', { error: 'Please fill in all fields.' });
  }

  if (password !== confirmPassword) {
    return res.render('register', { error: 'Passwords do not match.' });
  }

  if (password.length < 6) {
    return res.render('register', { error: 'Password must be at least 6 characters.' });
  }

  try {
    // Check for existing user
    const [existing] = await db.query(
      'SELECT id FROM users WHERE username = ? OR email = ?',
      [username, email]
    );
    if (existing.length > 0) {
      return res.render('register', { error: 'Username or email already taken.' });
    }

    const hashed = await bcrypt.hash(password, 12);
    const [result] = await db.query(
      'INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
      [username, email, hashed]
    );

    req.session.userId   = result.insertId;
    req.session.username = username;
    req.session.save(() => res.redirect('/photos/gallery'));

  } catch (err) {
    console.error('Register error:', err);
    res.render('register', { error: 'Server error. Please try again.' });
  }
});

// ─── GET /logout ──────────────────────────────────────────────────────────────
router.get('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
