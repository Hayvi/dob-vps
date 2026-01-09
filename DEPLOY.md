# VPS Deployment

Production-ready version with clustering support for 10k+ concurrent users.

## Quick Deploy

```bash
# On your VPS
git clone <your-repo> dob-vps
cd dob-vps
chmod +x setup.sh
./setup.sh

# Configure
cp .env.example .env
nano .env  # Add your MongoDB URI

# Start
pm2 start ecosystem.config.js
pm2 save
```

## Architecture

- **1 Scraper Worker:** Single shared Swarm WebSocket connection
- **N HTTP Workers:** Express servers handling SSE clients via IPC proxy
- **PM2 Management:** Process monitoring and auto-restart

## Monitoring

```bash
pm2 monit          # Real-time monitoring
pm2 logs           # View logs
pm2 restart all    # Restart all processes
```

## Nginx (Optional)

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
        proxy_set_header Connection '';
        proxy_buffering off;
    }
}
```
