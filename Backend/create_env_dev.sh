#!/bin/bash

# Create .env.dev file with MySQL credentials

ENV_FILE="/home/user/Videos/Bytestream-POC-/Backend/.env.dev"

echo "Creating .env.dev file..."

cat > "$ENV_FILE" << 'EOF'
# Server Configuration
NODE_ENV=development
PORT=3001

# Frontend Configuration
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000

# API Configuration
API_VERSION=v1

# Database Configuration (Docker MySQL)
DB_HOST=localhost
DB_PORT=3306
DB_NAME=taproot_monitor
DB_USER=root
DB_PASSWORD=root

# Alternative: Use taproot_user (if created via fix_mysql.sql)
# DB_USER=taproot_user
# DB_PASSWORD=taproot_pass

# Cron Configuration (optional)
# BALANCE_CHECK_CRON=*/1 * * * *
EOF

echo "✅ Created .env.dev file at: $ENV_FILE"
echo ""
echo "To use taproot_user instead of root, edit the file and uncomment:"
echo "  DB_USER=taproot_user"
echo "  DB_PASSWORD=taproot_pass"

