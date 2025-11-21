import express from 'express';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);
const app = express();
const port = 3000;

app.get('/generate-wallet', (req, res) => {
    try {
        const network = bitcoin.networks.bitcoin;
        const keyPair = ECPair.makeRandom({ network });
        const { address } = bitcoin.payments.p2pkh({ pubkey: keyPair.publicKey, network });

        res.json({
            address,
            privateKey: keyPair.toWIF()
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
