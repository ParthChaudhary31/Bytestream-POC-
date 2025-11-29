# Quick Start Guide - Testing Bytestream with TestSprite

## Step 1: Start Backend Server

```bash
cd Backend
npm install
npm run server
```

Server should be running on `http://localhost:3001`

## Step 2: Configure Environment

Create `.env.dev` file with:

```env
PORT=3001
HUB_ADDRESS=your_hub_testnet_address
HUB_PRIVATE_KEY=your_hub_private_key_wif
# ... other database config
```

## Step 3: Run Tests

### Option A: Run All Tests
```bash
npm test
```

### Option B: Run Specific Test
```bash
npm run test:flow    # Channel flow test
npm run test:utxo    # UTXO creation test
```

### Option C: Run with TestSprite

1. **Install TestSprite** (if using TestSprite CLI):
   ```bash
   npm install -g testsprite
   ```

2. **Run with TestSprite**:
   ```bash
   testsprite run --config tests/testsprite.config.json
   ```

3. **Or use TestSprite Web Dashboard**:
   - Go to https://testsprite.com
   - Create new project
   - Import `testsprite.config.json`
   - Run tests from dashboard

## Step 4: Verify Results

After tests run, you'll see:
- ✅ Transaction IDs
- ✅ Testnet explorer links
- ✅ UTXO details
- ✅ Channel states

Example output:
```
✅ User exit completed
  Exit TXID: abc123...
  UTXOs Created: 3
  
🔗 UTXO Details:
  Commitment: xyz789
    TXID: def456...
    VOUT: 0
    View: https://mempool.space/testnet/tx/def456...
    ✅ Verified on testnet
```

## What Gets Tested?

1. **Channel Opening**: Creates taproot multisig addresses
2. **Channel Funding**: Confirms funding transactions
3. **Payment Routing**: Routes payments through Hub
4. **UTXO Creation**: Creates separate UTXOs for each commitment on exit
5. **Testnet Verification**: Verifies transactions on Bitcoin testnet

## Troubleshooting

### Server Not Running
```bash
# Check if server is running
curl http://localhost:3001/api/v1/wallet/generate-wallet
```

### Database Issues
```bash
# Make sure MySQL is running
# Check database connection in .env.dev
```

### Test Failures
- Check server logs for errors
- Verify environment variables are set
- Ensure testnet connectivity

## Next Steps

- Review test output for transaction links
- Verify UTXOs on testnet block explorer
- Check channel states in database
- Review commitment records

## Test Output Example

```
🚀 Starting Bytestream Channel Flow Test
============================================================

[TEST STEP] Setting up test environment...
✅ [SUCCESS] User 1 wallet generated
✅ [SUCCESS] User 2 wallet generated

[TEST STEP] Testing channel opening...
✅ [SUCCESS] User 1 channel opened

[TEST STEP] Testing payment routing...
✅ [SUCCESS] Payment routed successfully

[TEST STEP] Testing user exit with UTXO creation...
✅ [SUCCESS] User exit completed
  Exit TXID: abc123...
  UTXOs Created: 3

🔗 UTXO Details:
  Commitment: xyz789
    TXID: def456...
    View: https://mempool.space/testnet/tx/def456...
    ✅ Verified on testnet

============================================================
✅ [SUCCESS] All tests completed successfully!
```

