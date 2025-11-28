#!/bin/bash

# MySQL Setup Script
# This script helps fix MySQL authentication issues

set -e

echo "🔧 MySQL Setup Script"
echo "===================="
echo ""

# Check if Docker is available
if command -v docker &> /dev/null; then
    echo "✅ Docker is available"
    echo ""
    echo "Option 1: Use Docker MySQL (Recommended)"
    echo "----------------------------------------"
    echo "Run the following commands:"
    echo ""
    echo "  cd /home/user/Videos/Bytestream-POC-/Backend"
    echo "  sudo docker-compose up -d"
    echo ""
    echo "Then create .env.dev file with:"
    echo "  DB_HOST=localhost"
    echo "  DB_PORT=3306"
    echo "  DB_NAME=taproot_monitor"
    echo "  DB_USER=root"
    echo "  DB_PASSWORD=root"
    echo ""
    echo "Or use the taproot_user:"
    echo "  DB_USER=taproot_user"
    echo "  DB_PASSWORD=taproot_pass"
    echo ""
else
    echo "⚠️  Docker is not available"
    echo ""
fi

echo "Option 2: Fix Local MySQL"
echo "-------------------------"
echo ""
echo "Run the following SQL commands as root (using sudo mysql):"
echo ""
echo "  sudo mysql"
echo ""
echo "Then execute:"
echo ""
cat << 'EOF'
  -- Create database if it doesn't exist
  CREATE DATABASE IF NOT EXISTS taproot_monitor;
  
  -- Create a new user with password authentication
  CREATE USER IF NOT EXISTS 'taproot_user'@'localhost' IDENTIFIED BY 'taproot_pass';
  
  -- Grant all privileges
  GRANT ALL PRIVILEGES ON taproot_monitor.* TO 'taproot_user'@'localhost';
  FLUSH PRIVILEGES;
  
  -- Verify the user was created
  SELECT user, host, plugin FROM mysql.user WHERE user='taproot_user';
  
  EXIT;
EOF

echo ""
echo "Then create .env.dev file with:"
echo "  DB_HOST=localhost"
echo "  DB_PORT=3306"
echo "  DB_NAME=taproot_monitor"
echo "  DB_USER=taproot_user"
echo "  DB_PASSWORD=taproot_pass"
echo ""

