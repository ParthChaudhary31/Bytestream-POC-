import { Router } from 'express';
import { WalletController } from '../controllers/walletController';

const router = Router();

router.get('/generate-wallet', WalletController.generateWallet);
router.post('/create-taproot-multisig', WalletController.createTaprootMultisig);
router.post('/add-transaction', WalletController.addTransaction);
router.post('/create-commitment', WalletController.createCommitment);
router.post('/hub-sign-and-push', WalletController.signAndPush);
router.post('/settle-commitments', WalletController.settleCommitments);
router.post('/broadcast-transaction', WalletController.broadcastTransaction);

export default router;

