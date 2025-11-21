import { Router } from 'express';
import { WalletController } from '../controllers/walletController';

const router = Router();

router.get('/generate-wallet', WalletController.generateWallet);
router.post('/create-taproot-multisig', WalletController.createTaprootMultisig);
router.post('/create-transaction', WalletController.createTransaction);

export default router;

