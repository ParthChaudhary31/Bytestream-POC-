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

export default router;

