import { Router } from 'express';
import { WalletController } from '../controllers/walletController';

const router = Router();

router.get('/generate', WalletController.generateWallet);

export default router;

