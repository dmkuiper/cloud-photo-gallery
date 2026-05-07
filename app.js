require('dotenv').config();

const express      = require('express');
const session      = require('express-session');
const MySQLStore   = require('express-mysql-session')(session);
const path         = require('path');

const app = express();

// ─── View engine ──────────────────────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Request parsing & static files ──────────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Session store — reuse the same pool so it uses the Unix socket ───────────
const db = require('./config/db');
const sessionStore = new MySQLStore({ createDatabaseTable: true }, db);

app.use(session({
  key:               'pg_sid',
  secret:            process.env.SESSION_SECRET || 'change_this_in_production',
  store:             sessionStore,
  resave:            false,
  saveUninitialized: false,
  cookie: {
    maxAge:   24 * 60 * 60 * 1000, // 24 hours
    httpOnly: true,
    secure:   false,
  },
}));

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const conn = await db.getConnection();
    conn.release();
    res.json({ status: 'ok', uptime: process.uptime(), timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: 'error', message: err.message });
  }
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/',       require('./routes/auth'));
app.use('/photos', require('./routes/photos'));

// Root redirect
app.get('/', (req, res) => {
  res.redirect(req.session.userId ? '/photos/gallery' : '/login');
});

// 404
app.use((req, res) => {
  res.status(404).render('404', { username: req.session.username || null });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).send('Internal server error.');
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Photo Gallery running on http://0.0.0.0:${PORT}`);
});
