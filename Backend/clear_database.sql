-- Clear all data from database tables
-- WARNING: This will delete all data!

USE taproot_monitor;

-- Disable foreign key checks temporarily
SET FOREIGN_KEY_CHECKS = 0;

-- Clear all tables
TRUNCATE TABLE payment_commitments;
TRUNCATE TABLE hub_ledger;
TRUNCATE TABLE payment_channels;
TRUNCATE TABLE balance_events;
TRUNCATE TABLE taproot_accounts;

-- Re-enable foreign key checks
SET FOREIGN_KEY_CHECKS = 1;

SELECT 'Database cleared successfully!' AS message;

