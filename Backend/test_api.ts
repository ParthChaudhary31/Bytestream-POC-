import axios from 'axios';

async function test() {
    try {
        // 1. Generate Wallet 1
        const res1 = await axios.get('http://localhost:3000/generate-wallet');
        const wallet1 = res1.data;
        console.log('Wallet 1:', wallet1);

        // 2. Generate Wallet 2
        const res2 = await axios.get('http://localhost:3000/generate-wallet');
        const wallet2 = res2.data;
        console.log('Wallet 2:', wallet2);

        // 3. Create Taproot Multisig
        const res3 = await axios.post('http://localhost:3000/create-taproot-multisig', {
            pubkey1: wallet1.publicKey,
            pubkey2: wallet2.publicKey
        });
        console.log('Taproot Multisig:', res3.data);

    } catch (error) {
        console.error('Error:', (error as any).response?.data || (error as any).message);
    }
}

test();
