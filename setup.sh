#!/bin/bash

# VPS Setup Script for Ubuntu/Debian

echo "🚀 Setting up Forzza VPS..."

# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 globally
sudo npm install -g pm2

# Increase file descriptor limits
echo "* soft nofile 65535" | sudo tee -a /etc/security/limits.conf
echo "* hard nofile 65535" | sudo tee -a /etc/security/limits.conf

# Apply limits for current session
ulimit -n 65535

# Install dependencies
npm install

# Setup PM2 startup
sudo pm2 startup
echo "⚠️  Run the command above, then: pm2 save"

echo "✅ Setup complete!"
echo "📝 Next steps:"
echo "1. Copy .env.example to .env and configure"
echo "2. Run: pm2 start ecosystem.config.js"
echo "3. Run: pm2 save"
