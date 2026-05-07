const mysql = require('mysql2/promise');

// Build connection config — supports both TCP (local/Cloud SQL Proxy)
// and Unix socket (direct GCE → Cloud SQL connection)
const config = {
  user:     process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

if (process.env.DB_SOCKET_PATH) {
  // Unix socket: used when running on GCE with Cloud SQL
  config.socketPath = process.env.DB_SOCKET_PATH;
} else {
  // TCP: used locally or via Cloud SQL Auth Proxy
  config.host = process.env.DB_HOST || '127.0.0.1';
  config.port = parseInt(process.env.DB_PORT) || 3306;
}

const pool = mysql.createPool(config);

// Verify connectivity on startup
pool.getConnection()
  .then(conn => {
    console.log('✓ Connected to MySQL database');
    conn.release();
  })
  .catch(err => {
    console.error('✗ MySQL connection error:', err.message);
    process.exit(1);
  });

module.exports = pool;
