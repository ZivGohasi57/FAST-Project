#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# FAST – Build and deploy script
# Run this every time you want to push updates to the server.
# ─────────────────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.env"

echo "================================================"
echo " FAST Deploy  |  $DOMAIN"
echo "================================================"

# ── 1. Pull latest code ────────────────────────────────────────────────────────
echo "[1/5] Pulling latest code..."
cd "$APP_DIR"
git pull --ff-only

# ── 2. Build backend ───────────────────────────────────────────────────────────
echo "[2/5] Building backend (Maven)..."
cd "$APP_DIR/FAST-Routing-Server"
mvn -q package -DskipTests
echo "  JAR: target/fast-routing-1.0-SNAPSHOT.jar"

# ── 3. Build frontend ──────────────────────────────────────────────────────────
echo "[3/5] Building frontend (Vite)..."

# Auto-detect HTTPS
if sudo certbot certificates 2>/dev/null | grep -q "Domains:.*$DOMAIN"; then
    PROTOCOL=https
else
    PROTOCOL=http
fi

cat > "$APP_DIR/fast-frontend/.env.production" <<EOF
VITE_API_URL=$PROTOCOL://$DOMAIN
EOF
echo "  API URL set to: $PROTOCOL://$DOMAIN"

cd "$APP_DIR/fast-frontend"
npm ci --silent
npm run build --silent
echo "  Build output: dist/"

# ── 4. Publish frontend to Nginx ───────────────────────────────────────────────
echo "[4/5] Publishing frontend to $FRONTEND_ROOT..."
sudo rsync -a --delete "$APP_DIR/fast-frontend/dist/" "$FRONTEND_ROOT/"
sudo chown -R www-data:www-data "$FRONTEND_ROOT"

# ── 5. Restart backend service ─────────────────────────────────────────────────
echo "[5/5] Restarting backend service..."
sudo systemctl restart fast-backend
sleep 4

if sudo systemctl is-active --quiet fast-backend; then
    echo "  Backend is running."
else
    echo ""
    echo "ERROR: Backend failed to start."
    echo "Check logs: journalctl -u fast-backend -n 50 --no-pager"
    exit 1
fi

echo ""
echo "================================================"
echo " Deploy complete!"
echo " App live at: $PROTOCOL://$DOMAIN"
echo ""
echo " Useful commands:"
echo "   journalctl -u fast-backend -f          # live backend logs"
echo "   sudo systemctl status fast-backend      # service status"
echo "   sudo nginx -t && sudo systemctl reload nginx  # reload nginx"
echo "================================================"
