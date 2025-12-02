import axios from 'axios';

const API_URL = 'http://localhost:3001/api/v1/wallet';

export const api = {
  generateWallet: async () => {
    const response = await axios.get(`${API_URL}/generate-wallet`);
    return response.data;
  },

  createTaprootMultisig: async (pubkey1: string, pubkey2: string) => {
    const response = await axios.post(`${API_URL}/create-taproot-multisig`, {
      pubkey1,
      pubkey2,
    });
    return response.data;
  },

  getUtxos: async (address: string) => {
    // Using mempool.space testnet API directly as per backend logic
    const response = await axios.get(`https://mempool.space/testnet/api/address/${address}/utxo`);
    return response.data;
  },

  createCommitment: async (params: {
    senderPrivateKey: string;
    utxos: Array<{ txid: string; vout: number; value: number }>;
    scriptHex: string;
    receiverAddress: string;
    amount: number;
    multisigAddress: string;
  }) => {
    const response = await axios.post(`${API_URL}/create-commitment`, params);
    return response.data;
  },

  addTransaction: async (payload: {
    sender: string;
    receiver: string;
    amount: number;
    commitment_number: number;
    commitment: string;
  }) => {
    const response = await axios.post(`${API_URL}/add-transaction`, payload);
    return response.data;
  },

  settleCommitments: async (receiverAddress: string, hubPrivateKey: string) => {
    const response = await axios.post(`${API_URL}/settle-commitments`, {
      receiverAddress,
      hubPrivateKey,
    });
    return response.data;
  },

  broadcastTransaction: async (data: {
    userAddress: string;
    hubAddress: string;
    userPrivateKey: string;
    hubPrivateKey: string;
    amount: number;
    recipientAddress: string;
    multisigAddress: string;
  }) => {
    const response = await axios.post(`${API_URL}/broadcast-transaction`, data);
    return response.data;
  },
};
