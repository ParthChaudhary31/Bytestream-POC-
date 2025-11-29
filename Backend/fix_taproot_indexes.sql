-- Fix taproot_accounts table indexes
-- This script removes duplicate/unnecessary indexes to fix "Too many keys" error

-- First, check existing indexes
-- SHOW INDEXES FROM taproot_accounts;

-- Drop duplicate indexes if they exist (adjust names based on your actual index names)
-- ALTER TABLE taproot_accounts DROP INDEX IF EXISTS address;
-- ALTER TABLE taproot_accounts DROP INDEX IF EXISTS taproot_accounts_address_unique;
-- ALTER TABLE taproot_accounts DROP INDEX IF EXISTS taproot_accounts_address;
-- ALTER TABLE taproot_accounts DROP INDEX IF EXISTS isActive_createdAt;
-- ALTER TABLE taproot_accounts DROP INDEX IF EXISTS userAddress;
-- ALTER TABLE taproot_accounts DROP INDEX IF EXISTS hubAddress;

-- Keep only the unique index on address
-- ALTER TABLE taproot_accounts ADD UNIQUE INDEX taproot_accounts_address_unique (address);

-- Or if you want to start fresh, drop and recreate the table (WARNING: This deletes all data)
-- DROP TABLE IF EXISTS taproot_accounts;

