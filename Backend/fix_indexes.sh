#!/bin/bash

# Fix MySQL "Too many keys" error by cleaning up duplicate indexes
# This script removes unnecessary indexes from taproot_accounts table

DB_NAME="${DB_NAME:-taproot_monitor}"
DB_USER="${DB_USER:-root}"
DB_PASSWORD="${DB_PASSWORD:-}"

echo "🔧 Fixing taproot_accounts table indexes..."

# Check if password is provided
if [ -z "$DB_PASSWORD" ]; then
    echo "⚠️  DB_PASSWORD not set. Trying without password..."
    MYSQL_CMD="mysql -u $DB_USER"
else
    MYSQL_CMD="mysql -u $DB_USER -p$DB_PASSWORD"
fi

# Show current indexes
echo "📋 Current indexes on taproot_accounts:"
$MYSQL_CMD $DB_NAME -e "SHOW INDEXES FROM taproot_accounts;" 2>/dev/null || {
    echo "❌ Failed to connect to database. Please check your credentials."
    exit 1
}

echo ""
echo "🗑️  Dropping duplicate/unnecessary indexes..."

# Drop indexes that might be duplicates (MySQL doesn't support IF EXISTS, so we'll use error suppression)
$MYSQL_CMD $DB_NAME <<EOF 2>/dev/null
ALTER TABLE taproot_accounts DROP INDEX address;
ALTER TABLE taproot_accounts DROP INDEX taproot_accounts_address_unique;
ALTER TABLE taproot_accounts DROP INDEX taproot_accounts_address;
ALTER TABLE taproot_accounts DROP INDEX isActive_createdAt;
ALTER TABLE taproot_accounts DROP INDEX userAddress;
ALTER TABLE taproot_accounts DROP INDEX hubAddress;
EOF

# Add back only the unique index on address
echo "✅ Adding unique index on address..."
$MYSQL_CMD $DB_NAME <<EOF
ALTER TABLE taproot_accounts ADD UNIQUE INDEX taproot_accounts_address_unique (address);
EOF

echo ""
echo "✅ Done! Indexes have been cleaned up."
echo "📋 Updated indexes:"
$MYSQL_CMD $DB_NAME -e "SHOW INDEXES FROM taproot_accounts;"

