# Bytestream Test Suite

Comprehensive test suite for Bytestream payment channel system with UTXO creation verification.

## Prerequisites

1. **Backend server running**: Make sure the backend is running on `http://localhost:3001`
2. **Database configured**: MySQL database should be set up and running
3. **Environment variables**: Ensure `.env.dev` or `.env` has:
   - `HUB_ADDRESS`: Hub's Bitcoin testnet address
   - `HUB_PRIVATE_KEY`: Hub's private key (WIF format)
   - Database configuration

## Test Suites

### 1. Complete Channel Flow Test (`test-channel-flow.ts`)

Tests the complete lifecycle:
- ✅ Wallet generation
- ✅ Channel opening
- ✅ Channel funding
- ✅ Payment routing (User 1 → Hub → User 2)
- ✅ User exit with UTXO creation
- ✅ Transaction verification on testnet

**Run:**
```bash
npm run test:flow
# or
ts-node tests/test-channel-flow.ts
```

### 2. UTXO Creation Test (`test-utxo-creation.ts`)

Specifically tests UTXO creation on exit:
- ✅ Multiple users and channels
- ✅ Multiple payments to one recipient
- ✅ Exit with UTXO creation for each commitment
- ✅ UTXO verification on testnet block explorer

**Run:**
```bash
npm run test:utxo
# or
ts-node tests/test-utxo-creation.ts
```

### 3. Run All Tests (`run-all-tests.ts`)

Runs all test suites and provides a summary.

**Run:**
```bash
npm test
# or
npm run test:all
# or
ts-node tests/run-all-tests.ts
```

## Test Output

Tests provide detailed output including:
- ✅ Step-by-step progress
- ✅ Transaction IDs and testnet explorer links
- ✅ UTXO details (TXID, VOUT)
- ✅ Channel state verification
- ✅ Success/failure summary

## Testnet Verification

All transactions are broadcast to Bitcoin testnet. You can verify them at:
- **Mempool Explorer**: https://mempool.space/testnet/tx/{txid}
- **Blockstream Explorer**: https://blockstream.info/testnet/tx/{txid}

## TestSprite Integration

These tests can be integrated with TestSprite:

1. **Create a TestSprite project** pointing to your backend API
2. **Import test files** or use TestSprite's AI to generate tests from API endpoints
3. **Configure test environment** with your backend URL and credentials
4. **Run tests** through TestSprite dashboard

### TestSprite Configuration Example

```json
{
  "baseUrl": "http://localhost:3001/api/v1/wallet",
  "testSuites": [
    "test-channel-flow",
    "test-utxo-creation"
  ],
  "timeout": 30000,
  "network": "testnet"
}
```

## Troubleshooting

### Common Issues

1. **"Hub address not configured"**
   - Set `HUB_ADDRESS` and `HUB_PRIVATE_KEY` in `.env.dev`

2. **"Connection refused"**
   - Make sure backend server is running on port 3001
   - Check `PORT` in environment variables

3. **"Transaction not found"**
   - Testnet transactions may take time to propagate
   - Tests wait up to 10 seconds for transaction confirmation
   - Check mempool.space/testnet manually if needed

4. **"Channel not found"**
   - Ensure database is properly initialized
   - Run migrations if needed

## Test Structure

```
tests/
├── setup.ts              # Test utilities and configuration
├── test-channel-flow.ts  # Complete channel lifecycle test
├── test-utxo-creation.ts # UTXO creation specific test
├── run-all-tests.ts      # Test runner for all suites
└── README.md             # This file
```

## Manual Testing

You can also test individual endpoints manually:

```bash
# Generate wallet
curl http://localhost:3001/api/v1/wallet/generate-wallet

# Open channel
curl -X POST http://localhost:3001/api/v1/wallet/channel/open \
  -H "Content-Type: application/json" \
  -d '{"userAddress": "...", "capacity": 100000}'

# Route payment
curl -X POST http://localhost:3001/api/v1/wallet/channel/routing-payment \
  -H "Content-Type: application/json" \
  -d '{"senderAddress": "...", "recipients": [...]}'

# Exit channel
curl -X POST http://localhost:3001/api/v1/wallet/channel/exit-user \
  -H "Content-Type: application/json" \
  -d '{"userChannelId": "...", "userPrivateKey": "...", "hubPrivateKey": "..."}'
```

## Notes

- All tests use **Bitcoin testnet** - no real funds required
- Tests create actual transactions on testnet
- UTXOs are broadcast and can be verified on block explorers
- Each test run creates new wallets and channels
- Tests are designed to be idempotent (can run multiple times)

