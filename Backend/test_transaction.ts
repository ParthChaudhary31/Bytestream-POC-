import axios from 'axios';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bitcoin from 'bitcoinjs-lib';

const ECPair = ECPairFactory(ecc);

async function testCreateTransaction() {
    try {
        // Generate valid random keys for testing
        const userKey = ECPair.makeRandom({ network: bitcoin.networks.testnet });
        const hubKey = ECPair.makeRandom({ network: bitcoin.networks.testnet });

        const userPrivateKey = userKey.toWIF();
        const hubPrivateKey = hubKey.toWIF();

        const { address: userAddress } = bitcoin.payments.p2pkh({ pubkey: userKey.publicKey, network: bitcoin.networks.testnet });
        const { address: hubAddress } = bitcoin.payments.p2pkh({ pubkey: hubKey.publicKey, network: bitcoin.networks.testnet });

        // Use userAddress as fake multisigAddress for testing
        const multisigAddress = userAddress;

        console.log('Testing create-transaction endpoint...');

        const response = await axios.post('http://localhost:3001/api/v1/wallet/create-transaction', {
            userAddress,
            hubAddress,
            userPrivateKey,
            hubPrivateKey,
            multisigAddress
        });

        console.log('Response:', response.data);
    } catch (error: any) {
        if (error.response) {
            console.log('Error Response:', error.response.data);
        } else {
            console.log('Error:', error.message);
        }
    }
}

testCreateTransaction();
