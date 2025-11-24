# MySQL Setup Instructions

## Option 1: Using Docker (Recommended - Easiest)

1. **Start MySQL container:**
   ```bash
   cd Backend
   sudo docker-compose up -d
   ```

2. **Verify MySQL is running:**
   ```bash
   sudo docker ps | grep mysql
   ```

3. **Create `.env.dev` file** (or copy from `.env.example`):
   ```bash
   cp .env.example .env.dev
   ```

   The default credentials in docker-compose.yml are:
   - Host: `localhost`
   - Port: `3306`
   - Database: `taproot_monitor`
   - User: `root`
   - Password: `root`

4. **Test connection:**
   ```bash
   npm run server
   ```

## Option 2: Install MySQL Server Directly

1. **Install MySQL:**
   ```bash
   sudo apt update
   sudo apt install mysql-server -y
   ```

2. **Start MySQL service:**
   ```bash
   sudo systemctl start mysql
   sudo systemctl enable mysql
   ```

3. **Secure MySQL installation (optional but recommended):**
   ```bash
   sudo mysql_secure_installation
   ```

4. **Create database and user:**
   ```bash
   sudo mysql -u root -p
   ```
   
   Then run in MySQL:
   ```sql
   CREATE DATABASE taproot_monitor;
   CREATE USER 'taproot_user'@'localhost' IDENTIFIED BY 'your_password';
   GRANT ALL PRIVILEGES ON taproot_monitor.* TO 'taproot_user'@'localhost';
   FLUSH PRIVILEGES;
   EXIT;
   ```

5. **Update `.env.dev` with your credentials:**
   ```
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=taproot_monitor
   DB_USER=taproot_user
   DB_PASSWORD=your_password
   ```

## Verify Setup

After starting MySQL (either method), verify it's working:

```bash
# Check if MySQL is listening on port 3306
netstat -tlnp | grep 3306
# or
ss -tlnp | grep 3306
```

Then start your server:
```bash
npm run server
```

The database tables will be created automatically on first run.

