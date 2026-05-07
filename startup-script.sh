#!/bin/bash
# ============================================================
# GCE Startup Script – Cloud Photo Gallery
# Attach as instance metadata key "startup-script".
# All secrets/config are read from instance metadata at boot.
# ============================================================
set -e

# ── 1. System updates & Node.js 20 LTS ──────────────────────
apt-get update -y
apt-get install -y curl git

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# ── 2. Install Cloud SQL Auth Proxy v2 ──────────────────────
PROXY_VERSION="v2.9.0"
curl -fsSL \
  "https://storage.googleapis.com/cloud-sql-connectors/cloud-sql-proxy/${PROXY_VERSION}/cloud-sql-proxy.linux.amd64" \
  -o /usr/local/bin/cloud-sql-proxy
chmod +x /usr/local/bin/cloud-sql-proxy

# ── 3. Metadata helper ──────────────────────────────────────
get_meta() {
  curl -sf \
    "http://metadata.google.internal/computeMetadata/v1/instance/attributes/$1" \
    -H "Metadata-Flavor: Google" || echo ""
}

DB_CONNECTION_NAME=$(get_meta db_connection_name)

# ── 4. Start Cloud SQL Auth Proxy as a systemd service ──────
mkdir -p /cloudsql

cat > /etc/systemd/system/cloud-sql-proxy.service <<EOF
[Unit]
Description=Cloud SQL Auth Proxy
After=network.target

[Service]
Type=simple
User=root
ExecStart=/usr/local/bin/cloud-sql-proxy \
    --unix-socket /cloudsql \
    ${DB_CONNECTION_NAME}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cloud-sql-proxy
systemctl start cloud-sql-proxy

# Wait for the Unix socket to appear (up to 30 s)
for i in $(seq 1 30); do
  [ -S "/cloudsql/${DB_CONNECTION_NAME}" ] && break
  sleep 1
done

# ── 5. Clone / update the app ───────────────────────────────
APP_REPO=$(get_meta app_repo_url)
APP_DIR=/opt/photo-gallery

if [ -d "$APP_DIR/.git" ]; then
  cd "$APP_DIR" && git pull
else
  git clone "$APP_REPO" "$APP_DIR"
fi

cd "$APP_DIR"

# ── 6. Install production dependencies ──────────────────────
npm install --omit=dev

# ── 7. Write .env from instance metadata ────────────────────
cat > "$APP_DIR/.env" <<EOF
DB_SOCKET_PATH=/cloudsql/${DB_CONNECTION_NAME}
DB_USER=$(get_meta db_user)
DB_PASSWORD=$(get_meta db_password)
DB_NAME=$(get_meta db_name)
GCS_BUCKET_NAME=$(get_meta gcs_bucket)
SESSION_SECRET=$(get_meta session_secret)
PORT=3000
NODE_ENV=production
EOF

# ── 8. Install PM2 and start the app ────────────────────────
npm install -g pm2

pm2 delete photo-gallery 2>/dev/null || true
pm2 start "$APP_DIR/app.js" --name photo-gallery
pm2 save
pm2 startup systemd -u root --hp /root | bash || true

# ── 9. nginx reverse proxy on port 80 ───────────────────────
apt-get install -y nginx

cat > /etc/nginx/sites-available/photo-gallery <<'NGINX'
server {
    listen 80 default_server;
    server_name _;

    client_max_body_size 15M;

    location /health {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        access_log         off;
    }

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection keep-alive;
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX

ln -sf /etc/nginx/sites-available/photo-gallery /etc/nginx/sites-enabled/photo-gallery
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl restart nginx
systemctl enable nginx

echo "Startup script complete — Photo Gallery is running."
