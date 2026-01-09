# VPS Deployment Guide

## Requirements by User Count

| Users | RAM | CPUs | Workers | MongoDB |
|-------|-----|------|---------|---------|
| 1-2k | 2GB | 2 | 2 | Atlas M10 |
| 5k | 4GB | 4 | 4 | Atlas M20 |
| 10k | 8GB | 4-8 | 4-8 | Atlas M30+ |

## Quick Start

```bash
# Clone and install
git clone https://github.com/Hayvi/dob.git
cd dob
npm install

# Configure
cp .env.example .env
# Edit .env with your MONGODB_URI

# Run clustered
node cluster.js
```

## OS Tuning (Ubuntu/Debian)

```bash
# Increase file descriptors (required for 10k+ SSE connections)
echo "* soft nofile 65535" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65535" | sudo tee -a /etc/security/limits.conf

# Apply immediately
ulimit -n 65535

# Verify
ulimit -n
```

## Environment Variables

```env
MONGODB_URI=mongodb+srv://...
PORT=3000
NODE_ENV=production
WEB_CONCURRENCY=4        # Number of HTTP workers (default: CPU count)
ADMIN_KEY=your_secret    # Optional: protect scrape endpoints
```

## Run Modes

```bash
# Single process (development)
node index.js

# Clustered (production)
node cluster.js
```

## Process Manager (PM2)

```bash
npm install -g pm2

# Start clustered
pm2 start cluster.js --name forzza

# Auto-restart on reboot
pm2 startup
pm2 save

# Monitor
pm2 monit
```

## Nginx Reverse Proxy (Optional)

```nginx
upstream forzza {
    least_conn;
    server 127.0.0.1:3000;
}

server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://forzza;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Connection '';
        proxy_buffering off;
        proxy_cache off;
        chunked_transfer_encoding off;
    }
}
```

## Architecture

```
Primary Process (cluster.js)
├── Scraper Worker (1x) - Single Swarm WebSocket
└── HTTP Workers (Nx) - Express + SSE via IPC proxy
```

## Health Check

```bash
curl http://localhost:3000/api/health
```

## Render Deployment

| Setting | Single Process | Clustered |
|---------|---------------|-----------|
| Start Command | `node index.js` | `node cluster.js` |
| WEB_CONCURRENCY | - | `4` |
