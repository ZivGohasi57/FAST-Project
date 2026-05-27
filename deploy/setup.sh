#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# FAST – One-time server setup script
# Run this ONCE on a fresh Oracle Cloud Ubuntu 22.04 instance.
# Prerequisites: upload export.osm and graph-cache-v2/ first (see upload-files.ps1).
# ─────────────────────────────────────────────────────────────────────────────
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/config.env"

if [[ "$DOMAIN" == "YOUR_SERVER_IP_OR_DOMAIN" ]]; then
    echo "ERROR: Edit deploy/config.env and set DOMAIN before running this script."
    exit 1
fi

echo "================================================"
echo " FAST Setup  |  domain/IP: $DOMAIN"
echo " App dir:    $APP_DIR"
echo "================================================"

# ── 1. System packages ────────────────────────────────────────────────────────
echo "[1/7] Installing system packages..."
sudo apt-get update -qq
sudo apt-get install -y openjdk-17-jdk maven nginx ufw

# ── 2. Node.js 20 ─────────────────────────────────────────────────────────────
echo "[2/7] Installing Node.js 20..."
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1)" != "v20" ]]; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
echo "Node $(node -v), npm $(npm -v)"

# ── 3. Directories and permissions ────────────────────────────────────────────
echo "[3/7] Creating directories..."
sudo mkdir -p "$FRONTEND_ROOT"
sudo chown "$SERVICE_USER:$SERVICE_USER" "$FRONTEND_ROOT"
# data/ is created automatically by the backend; ensure ownership is correct
sudo chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

# ── 4. Nginx site config ───────────────────────────────────────────────────────
echo "[4/7] Configuring Nginx..."
sed "s|DOMAIN_PLACEHOLDER|$DOMAIN|g" "$SCRIPT_DIR/nginx-fast.conf" \
    | sudo tee /etc/nginx/sites-available/fast > /dev/null
sudo ln -sf /etc/nginx/sites-available/fast /etc/nginx/sites-enabled/fast
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

# ── 5. Systemd service ─────────────────────────────────────────────────────────
echo "[5/7] Installing systemd service..."
sed -e "s|APP_DIR_PLACEHOLDER|$APP_DIR|g" \
    -e "s|SERVICE_USER_PLACEHOLDER|$SERVICE_USER|g" \
    -e "s|HEAP_PLACEHOLDER|$JAVA_HEAP|g" \
    "$SCRIPT_DIR/fast-backend.service" \
    | sudo tee /etc/systemd/system/fast-backend.service > /dev/null
sudo systemctl daemon-reload
sudo systemctl enable fast-backend

# ── 6. Firewall ────────────────────────────────────────────────────────────────
echo "[6/7] Configuring firewall..."
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# Oracle Cloud VMs also need explicit iptables rules (the cloud adds its own chain)
if sudo iptables -L INPUT -n 2>/dev/null | grep -q "oci\|REJECT\|DROP"; then
    echo "  Detected Oracle Cloud iptables rules — adding port 80/443 exceptions..."
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80  -j ACCEPT
    sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
    if command -v netfilter-persistent &>/dev/null; then
        sudo netfilter-persistent save
    else
        sudo apt-get install -y iptables-persistent
        sudo netfilter-persistent save
    fi
fi

# ── 7. First build and start ───────────────────────────────────────────────────
echo "[7/7] Running first deploy..."
bash "$SCRIPT_DIR/deploy.sh"

echo ""
echo "================================================"
echo " Setup complete!"
echo " App is live at: http://$DOMAIN"
echo ""
echo " To enable HTTPS (requires a real domain, not an IP):"
echo "   sudo apt-get install -y certbot python3-certbot-nginx"
echo "   sudo certbot --nginx -d $DOMAIN"
echo "   Then re-run: bash deploy/deploy.sh"
echo " (Certbot will update nginx.conf and renew automatically.)"
echo "================================================"
