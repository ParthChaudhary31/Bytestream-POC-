# Fix MySQL Authentication Error

## Problem
You're getting `ER_ACCESS_DENIED_NO_PASSWORD_ERROR` (errno 1698) because MySQL root user is configured with socket authentication, but your app is trying to use password authentication.

## Quick Fix (Choose One)

### Option 1: Create New MySQL User (Recommended)

Run these commands in your terminal:

```bash
# Connect to MySQL as root (no password needed with sudo)
sudo mysql

# Then paste these SQL commands:
CREATE DATABASE IF NOT EXISTS taproot_monitor;
CREATE USER IF NOT EXISTS 'taproot_user'@'localhost' IDENTIFIED BY 'taproot_pass';
GRANT ALL PRIVILEGES ON taproot_monitor.* TO 'taproot_user'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Then update your `.env.dev` file:
```bash
DB_USER=taproot_user
DB_PASSWORD=taproot_pass
```

### Option 2: Use Docker MySQL (Easiest)

Stop local MySQL and use Docker instead:

```bash
# Stop local MySQL (optional, if you want to free port 3306)
sudo systemctl stop mysql
sudo systemctl disable mysql  # Prevent auto-start

# Start Docker MySQL
cd /home/user/Videos/Bytestream-POC-/Backend
sudo docker-compose up -d

# Verify it's running
sudo docker ps | grep mysql
```

Your `.env.dev` is already configured correctly for Docker MySQL (root/root).

### Option 3: Change Root to Use Password (Not Recommended)

If you really want to use root with password:

```bash
sudo mysql

# Then run:
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY 'root';
FLUSH PRIVILEGES;
EXIT;
```

**Warning**: This changes your MySQL root authentication method.

## Verify Fix

After applying the fix, test the connection:

```bash
cd /home/user/Videos/Bytestream-POC-/Backend
npm run server
```

You should see: `✅ MySQL connected successfully`

## Current Configuration

Your `.env.dev` currently has:
- DB_USER=root
- DB_PASSWORD=root

If you choose Option 1, change to:
- DB_USER=taproot_user  
- DB_PASSWORD=taproot_pass

