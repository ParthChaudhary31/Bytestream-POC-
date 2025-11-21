import express from 'express';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { Buffer } from 'buffer';

bitcoin.initEccLib(ecc);

const ECPair = ECPairFactory(ecc);
const app = express();
const port = 3000;

app.use(express.json());

app.get('/generate-wallet', (req, res) => {
    try {
        const network = bitcoin.networks.bitcoin;
        const keyPair = (ECPair as any).makeRandom({ network });
        const { address } = (bitcoin.payments.p2pkh as any)({ pubkey: keyPair.publicKey, network });

        res.json({
            address,
            privateKey: keyPair.toWIF(),
            publicKey: Buffer.from(keyPair.publicKey).toString('hex')
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

app.post('/create-taproot-multisig', (req, res) => {
    try {
        const { pubkey1, pubkey2 } = req.body;

        if (!pubkey1 || !pubkey2) {
            res.status(400).json({ error: 'Both pubkey1 and pubkey2 are required' });
            return;
        }

        const network = bitcoin.networks.bitcoin;

        // Helper to convert hex to x-only pubkey (32 bytes)
        const toXOnly = (hex: string) => {
            const buf = Buffer.from(hex, 'hex');
            return buf.length === 32 ? buf : buf.subarray(1, 33);
        };

        const pk1 = toXOnly(pubkey1);
        const pk2 = toXOnly(pubkey2);

        // Construct script: <144> OP_CHECKSEQUENCEVERIFY OP_DROP <pk1> OP_CHECKSIG <pk2> OP_CHECKSIGADD OP_2 OP_EQUAL
        // Note: BIP 342 (Tapscript) uses OP_CHECKSIGADD for multisig
        const script = bitcoin.script.compile([
            bitcoin.script.number.encode(144), // 144 blocks
            bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
            bitcoin.opcodes.OP_DROP,
            pk1,
            bitcoin.opcodes.OP_CHECKSIG,
            pk2,
            bitcoin.opcodes.OP_CHECKSIGADD,
            bitcoin.opcodes.OP_2,
            bitcoin.opcodes.OP_EQUAL
        ]);

        // Create Taproot address
        // We put the script in a leaf. We don't have an internal key path here, so we can use an unspendable internal key 
        // or just use the Taptree. bitcoinjs-lib's p2tr can handle a script tree.
        // For a pure script path spend, we usually use a provably unspendable internal key (NUMS).
        // bitcoinjs-lib doesn't auto-generate NUMS, but we can pass a script tree.

        const tapLeaf = {
            output: script
        };

        const { address, output } = (bitcoin.payments.p2tr as any)({
            internalPubkey: Buffer.from('50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0', 'hex'), // Standard NUMS key
            scriptTree: tapLeaf,
            network
        });

        res.json({
            address,
            scriptHex: Buffer.from(script).toString('hex')
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Internal Server Error: ' + (error as Error).message });
    }
});

app.listen(port, () => {
    console.log(`Server running on http://localhost:${port}`);
});
