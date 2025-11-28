-- Add lastCommitmentTxHex column to payment_channels table
-- This column stores the signed commitment transaction hex (not broadcast)

ALTER TABLE payment_channels 
ADD COLUMN IF NOT EXISTS lastCommitmentTxHex TEXT NULL 
AFTER lastCommitmentHash;

-- Verify the column was added
DESCRIBE payment_channels;

