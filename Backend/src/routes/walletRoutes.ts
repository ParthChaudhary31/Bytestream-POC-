import { Router } from 'express';
import { WalletController } from '../controllers/walletController';

const router = Router();

router.get('/generate-wallet', WalletController.generateWallet);
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

export default router;

