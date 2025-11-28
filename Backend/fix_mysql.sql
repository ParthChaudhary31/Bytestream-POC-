-- MySQL Setup Script
-- Run this with: sudo mysql < fix_mysql.sql
-- Or: sudo mysql -u root, then paste these commands

-- Create database if it doesn't exist
CREATE DATABASE IF NOT EXISTS taproot_monitor;

-- Create a new user with password authentication
CREATE USER IF NOT EXISTS 'taproot_user'@'localhost' IDENTIFIED BY 'taproot_pass';

-- Grant all privileges on the database
GRANT ALL PRIVILEGES ON taproot_monitor.* TO 'taproot_user'@'localhost';

-- Flush privileges to apply changes
FLUSH PRIVILEGES;

-- Verify the user was created
SELECT user, host, plugin FROM mysql.user WHERE user='taproot_user';

-- Show databases
SHOW DATABASES;

