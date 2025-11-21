import axios from 'axios';

async function reproduce() {
    try {
        const payload = {
            pubkey1: "033a8cf0f7d8aec85f2b384bce3e43c6db560ee83d497a8bb3d329f00f29fb6c19",
            pubkey2: "038dfdfd59dc07c431aae681bd5257073ffe8817173f22b29f43192ac39254e8fc"
        };

        console.log('Sending payload:', payload);

        const res = await axios.post('http://localhost:3000/create-taproot-multisig', payload);
        console.log('Response:', res.data);

    } catch (error) {
        console.error('Error:', (error as any).response?.data || (error as any).message);
    }
}

reproduce();
