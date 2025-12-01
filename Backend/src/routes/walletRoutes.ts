import { Router } from 'express';
import { WalletController } from '../controllers/walletController';

const router = Router();

router.get('/generate-wallet', WalletController.generateWallet);
router.post('/register-public-key', WalletController.registerPublicKey);
router.post('/create-taproot-multisig', WalletController.createTaprootMultisig);
router.post('/create-transaction', WalletController.createTransaction);

// Balance and monitoring endpoints
router.get('/balance/:address', WalletController.getBalance);
router.post('/check-taproot', WalletController.checkTaproot);
router.post('/register-monitoring', WalletController.registerMonitoring);
router.get('/monitored-accounts', WalletController.getMonitoredAccounts);
router.get('/monitoring-status', WalletController.getMonitoringStatus);
router.post('/trigger-balance-check', WalletController.triggerBalanceCheck);
router.get('/balance-events', WalletController.getBalanceEvents);
router.get('/accounts', WalletController.getAccounts);

// Lightning-style channel endpoints
router.post('/channel/open', WalletController.openChannel);
router.post('/channel/confirm-funding', WalletController.confirmFunding);
router.post('/channel/update', WalletController.updateChannel);
router.post('/channel/close', WalletController.closeChannel);
router.get('/channel/:channelId', WalletController.getChannel);
router.get('/channels/user/:userAddress', WalletController.getUserChannels);
router.get('/channels/open', WalletController.getOpenChannels);

// ByteStream L2 routing endpoints
router.post('/channel/routing-payment', WalletController.routingPayment);
router.get('/hub/ledger', WalletController.getHubLedger);
router.post('/hub/ledger/sync', WalletController.syncHubLedger);
router.post('/hub/ledger/clear', WalletController.clearHubLedger);
router.post('/channel/unilateral-exit', WalletController.unilateralExit);
router.get('/channel/:channelId/watchtower', WalletController.watchtowerCheck);
router.post('/channel/competing-remedy', WalletController.competingRemedy);
router.post('/channel/exit-user', WalletController.exitUserChannel);
router.post('/channel/broadcast-commitment', WalletController.broadcastCommitment);

export default router;

