#!/bin/bash
# PrimeAxis IT — Production Deployment Script
# Run on your VPS: bash deploy/setup.sh

set -e

echo "=============================="
echo " PrimeAxis IT — Server Setup"
echo "=============================="

# 1. Update system
echo "[1/7] Updating system..."
sudo apt update && sudo apt upgrade -y

# 2. Install Node.js 20.x
echo "[2/7] Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt install -y nodejs
fi
node -v
npm -v

# 3. Install PM2 globally
echo "[3/7] Installing PM2..."
sudo npm install -g pm2

# 4. Install Nginx
echo "[4/7] Installing Nginx..."
sudo apt install -y nginx

# 5. Install dependencies
echo "[5/7] Installing app dependencies..."
cd "$(dirname "$0")/.."
cd server && npm install --production && cd ..

# 6. Create logs directory
mkdir -p logs

# 7. Setup environment
echo "[6/7] Setting up environment..."
if [ ! -f server/.env ]; then
    JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
    cat > server/.env << EOF
PORT=3000
NODE_ENV=production
JWT_SECRET=$JWT_SECRET
EOF
    echo "  ✅ Created server/.env with random JWT secret"
else
    echo "  ⏭  server/.env already exists, skipping"
fi

# 8. Start with PM2
echo "[7/7] Starting app with PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup | tail -1 | bash 2>/dev/null || true

echo ""
echo "=============================="
echo " ✅ App is running!"
echo "=============================="
echo ""
echo "Next steps:"
echo "  1. Edit deploy/nginx.conf — replace 'yourdomain.com' with your domain"
echo "  2. Copy nginx config:"
echo "     sudo cp deploy/nginx.conf /etc/nginx/sites-available/primeaxis"
echo "     sudo ln -s /etc/nginx/sites-available/primeaxis /etc/nginx/sites-enabled/"
echo "     sudo rm -f /etc/nginx/sites-enabled/default"
echo "     sudo nginx -t && sudo systemctl restart nginx"
echo "  3. Setup SSL with Certbot:"
echo "     sudo apt install certbot python3-certbot-nginx"
echo "     sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com"
echo ""
echo "Useful PM2 commands:"
echo "  pm2 status          — check app status"
echo "  pm2 logs primeaxis  — view logs"
echo "  pm2 restart primeaxis — restart app"
echo ""
