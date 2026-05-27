# ─────────────────────────────────────────────────────────────────────────────
# FAST – Upload large files to Oracle Cloud server
# Run this from your LOCAL Windows machine (PowerShell).
# Uploads export.osm and graph-cache-v2/ which are too large for git.
# ─────────────────────────────────────────────────────────────────────────────

# ── Configuration (fill these in) ────────────────────────────────────────────
$SERVER_IP   = "YOUR_SERVER_IP"          # Oracle Cloud VM public IP
$SSH_KEY     = "$env:USERPROFILE\.ssh\id_rsa"   # path to your SSH private key
$REMOTE_USER = "ubuntu"                  # Oracle Cloud default user
$REMOTE_DIR  = "/opt/fast/FAST-Routing-Server"  # must match APP_DIR in config.env

# ── Local paths (relative to project root) ───────────────────────────────────
$PROJECT_ROOT = Split-Path -Parent $PSScriptRoot
$OSM_FILE     = Join-Path $PROJECT_ROOT "FAST-Routing-Server\export.osm"
$GRAPH_CACHE  = Join-Path $PROJECT_ROOT "FAST-Routing-Server\graph-cache-v2"

# ── Validate ──────────────────────────────────────────────────────────────────
if ($SERVER_IP -eq "YOUR_SERVER_IP") {
    Write-Error "Set SERVER_IP at the top of this script before running."
    exit 1
}
if (-not (Test-Path $OSM_FILE)) {
    Write-Error "export.osm not found at: $OSM_FILE"
    exit 1
}
if (-not (Test-Path $GRAPH_CACHE)) {
    Write-Error "graph-cache-v2 not found at: $GRAPH_CACHE"
    exit 1
}

$REMOTE = "${REMOTE_USER}@${SERVER_IP}"

Write-Host "================================================" -ForegroundColor Cyan
Write-Host " Uploading large files to $REMOTE" -ForegroundColor Cyan
Write-Host " Remote path: $REMOTE_DIR" -ForegroundColor Cyan
Write-Host "================================================" -ForegroundColor Cyan

# ── Create remote directory ───────────────────────────────────────────────────
Write-Host "`n[1/3] Creating remote directory..."
ssh -i $SSH_KEY $REMOTE "sudo mkdir -p $REMOTE_DIR && sudo chown ${REMOTE_USER}:${REMOTE_USER} $REMOTE_DIR"

# ── Upload export.osm ─────────────────────────────────────────────────────────
Write-Host "`n[2/3] Uploading export.osm (this may take a few minutes)..."
$osm_size = (Get-Item $OSM_FILE).Length / 1MB
Write-Host "  File size: $([math]::Round($osm_size, 1)) MB"
scp -i $SSH_KEY $OSM_FILE "${REMOTE}:${REMOTE_DIR}/export.osm"

# ── Upload graph-cache-v2 ─────────────────────────────────────────────────────
Write-Host "`n[3/3] Uploading graph-cache-v2/ (this may take several minutes)..."
scp -i $SSH_KEY -r $GRAPH_CACHE "${REMOTE}:${REMOTE_DIR}/graph-cache-v2"

Write-Host "`n================================================" -ForegroundColor Green
Write-Host " Upload complete!" -ForegroundColor Green
Write-Host " Files are now at $REMOTE_DIR on the server." -ForegroundColor Green
Write-Host "`n Next step: SSH into the server and run:" -ForegroundColor Yellow
Write-Host "   bash /opt/fast/deploy/setup.sh" -ForegroundColor Yellow
Write-Host "================================================" -ForegroundColor Green
