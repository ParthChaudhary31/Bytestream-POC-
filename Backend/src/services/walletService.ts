import * as bitcoin from 'bitcoinjs-lib';
import { initEccLib } from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import { Buffer } from 'buffer';
import axios from 'axios';

// Initialize ECC library for bitcoinjs-lib
initEccLib(ecc);

const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

// In-memory storage for address to publicKey mapping
const addressToPublicKeyMap = new Map<string, string>();

export interface Wallet {
  address: string;
  privateKey: string;
  publicKey?: string;
  mnemonic?: string;
  derivationPath?: string;
  network?: string;
}

export interface TaprootMultisig {
  address: string;
  scriptHex: string;
}

export class WalletService {
  /**
   * Generate a new Bitcoin wallet using mnemonic (BIP39) and BIP32 derivation
   */
  static generateWallet(): Wallet {
    try {
      const network = bitcoin.networks.testnet;

      // Generate mnemonic
      const mnemonic = bip39.generateMnemonic();

      // Convert mnemonic to seed
      const seed = bip39.mnemonicToSeedSync(mnemonic);

      // Create root from seed
      const root = bip32.fromSeed(seed, network);

      // Derive path m/44'/1'/0'/0/0 (Testnet P2PKH derivation path - coin type 1 for testnet)
      const path = "m/44'/1'/0'/0/0";
      const child = root.derivePath(path);

      // Generate address from derived public key
      const { address } = (bitcoin.payments.p2pkh as any)({
        pubkey: child.publicKey,
        network,
      });

      const walletAddress = address || '';
      const walletPublicKey = Buffer.from(child.publicKey).toString('hex');

      // Store address to publicKey mapping
      if (walletAddress) {
        addressToPublicKeyMap.set(walletAddress, walletPublicKey);
      }

      return {
        address: walletAddress,
        privateKey: child.toWIF(),
        publicKey: walletPublicKey,
        mnemonic,
        derivationPath: path,
        network: 'testnet3', // bitcoin.networks.testnet refers to testnet3 (compatible with testnet4 for addresses)
      };
    } catch (error) {
      throw new Error(`Failed to generate wallet: ${error}`);
    }
  }

  /**
   * Create a Taproot multisig address
   * Accepts either addresses or public keys
   */
  static createTaprootMultisig(address1: string, address2: string): TaprootMultisig {
    try {
      if (!address1 || !address2) {
        throw new Error('Both address1 and address2 are required');
      }

      // Look up public keys from addresses
      const pubkey1 = addressToPublicKeyMap.get(address1);
      const pubkey2 = addressToPublicKeyMap.get(address2);

      if (!pubkey1 || !pubkey2) {
        throw new Error(`Public key not found for one or both addresses. Address1: ${address1}, Address2: ${address2}`);
      }

      const network = bitcoin.networks.testnet;

      // Remove "0x" prefix if present
      const cleanPubkey1 = pubkey1.startsWith('0x') ? pubkey1.slice(2) : pubkey1;
      const cleanPubkey2 = pubkey2.startsWith('0x') ? pubkey2.slice(2) : pubkey2;

      // Helper to convert hex to x-only pubkey (32 bytes)
      const toXOnly = (hex: string) => {
        const buf = Buffer.from(hex, 'hex');
        return buf.length === 32 ? buf : buf.subarray(1, 33);
      };

      const pk1 = toXOnly(cleanPubkey1);
      const pk2 = toXOnly(cleanPubkey2);

      // Leaf 1: Immediate 2-of-2 MultiSig
      // <pk1> CHECKSIG <pk2> CHECKSIGADD 2 EQUAL
      const scriptImmediate = Buffer.from(bitcoin.script.compile([
        pk1,
        bitcoin.opcodes.OP_CHECKSIG,
        pk2,
        bitcoin.opcodes.OP_CHECKSIGADD,
        bitcoin.opcodes.OP_2,
        bitcoin.opcodes.OP_EQUAL,
      ]));

      // Leaf 2: User Key + 144 CSV
      // <144> CSV DROP <pk1> CHECKSIG
      const scriptUser = Buffer.from(bitcoin.script.compile([
        bitcoin.script.number.encode(144),
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        pk1,
        bitcoin.opcodes.OP_CHECKSIG,
      ]));

      // Leaf 3: Hub Key + 144 CSV
      // <144> CSV DROP <pk2> CHECKSIG
      const scriptHub = Buffer.from(bitcoin.script.compile([
        bitcoin.script.number.encode(144),
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        pk2,
        bitcoin.opcodes.OP_CHECKSIG,
      ]));

      // Construct Taproot Tree
      // Structure: [Leaf1, [Leaf2, Leaf3]]
      const scriptTree = [
        { output: scriptImmediate },
        [
          { output: scriptUser },
          { output: scriptHub },
        ],
      ];

      const { address } = (bitcoin.payments.p2tr as any)({
        internalPubkey: Buffer.from(
          '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
          'hex'
        ), // Standard NUMS key
        scriptTree,
        network,
      });

      return {
        address: address || '',
        scriptHex: Buffer.from(scriptImmediate).toString('hex'), // Returning immediate script hex as primary, though technically there are 3
      };
    } catch (error) {
      throw new Error(`Failed to create taproot multisig: ${error}`);
    }
  }

  /**
   * Create and broadcast a transaction
   */
  static async createAndBroadcastTransaction(
    userAddress: string,
    hubAddress: string,
    userPrivateKey: string,
    hubPrivateKey: string,
    nonce?: number,
    taprootAddress?: string,
    broadcastPayload?: string,
    multisigAddress?: string
  ): Promise<string> {
    try {
      // If broadcastPayload is provided, use it directly
      if (broadcastPayload) {
        const broadcastRes = await axios.post(
          'https://mempool.space/testnet/api/tx',
          broadcastPayload
        );
        return broadcastRes.data; // txid
      }

      const network = bitcoin.networks.testnet;

      console.log('Starting createAndBroadcastTransaction...');
      // 1. Derive keys and reconstruct multisig script
      console.log('Deriving keys...');

      let userKey: any;
      let hubKey: any;
      let pk1: Buffer | undefined;
      let pk2: Buffer | undefined;

      // Helper to convert pubkey to x-only pubkey (32 bytes)
      const toXOnly = (pubKey: Buffer) => {
        return pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);
      };

      // Attempt to derive keys if provided
      if (userPrivateKey) {
        try {
          userKey = ECPair.fromWIF(userPrivateKey, network);
          pk1 = toXOnly(Buffer.from(userKey.publicKey));
        } catch (e) {
          console.log('Invalid or missing userPrivateKey');
        }
      }

      if (hubPrivateKey) {
        try {
          hubKey = ECPair.fromWIF(hubPrivateKey, network);
          pk2 = toXOnly(Buffer.from(hubKey.publicKey));
        } catch (e) {
          console.log('Invalid or missing hubPrivateKey');
        }
      }

      // We need at least the public keys to reconstruct the tree. 
      // If private keys are missing, we might need to look up public keys from addresses if not derived from private keys.
      // However, for this function, we assume we can derive them or they are available.
      // If we can't get pk1 or pk2, we can't reconstruct the tree to verify/spend.

      if (!pk1) {
        const pubkey1 = addressToPublicKeyMap.get(userAddress);
        if (pubkey1) pk1 = toXOnly(Buffer.from(pubkey1.startsWith('0x') ? pubkey1.slice(2) : pubkey1, 'hex'));
      }
      if (!pk2) {
        const pubkey2 = addressToPublicKeyMap.get(hubAddress);
        if (pubkey2) pk2 = toXOnly(Buffer.from(pubkey2.startsWith('0x') ? pubkey2.slice(2) : pubkey2, 'hex'));
      }

      if (!pk1 || !pk2) {
        throw new Error('Could not derive public keys for User and Hub to reconstruct script tree');
      }

      // Reconstruct the 3 leaves
      // Leaf 1: Immediate 2-of-2 MultiSig
      const scriptImmediate = Buffer.from(bitcoin.script.compile([
        pk1,
        bitcoin.opcodes.OP_CHECKSIG,
        pk2,
        bitcoin.opcodes.OP_CHECKSIGADD,
        bitcoin.opcodes.OP_2,
        bitcoin.opcodes.OP_EQUAL,
      ]));

      // Leaf 2: User Key + 144 CSV
      const scriptUser = Buffer.from(bitcoin.script.compile([
        bitcoin.script.number.encode(144),
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        pk1,
        bitcoin.opcodes.OP_CHECKSIG,
      ]));

      // Leaf 3: Hub Key + 144 CSV
      const scriptHub = Buffer.from(bitcoin.script.compile([
        bitcoin.script.number.encode(144),
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        pk2,
        bitcoin.opcodes.OP_CHECKSIG,
      ]));

      // Construct Taproot Tree
      const scriptTree = [
        { output: scriptImmediate },
        [
          { output: scriptUser },
          { output: scriptHub },
        ],
      ];

      // Determine which path to spend
      let selectedScript: Buffer;
      let sequence: number;
      let signers: any[] = [];

      if (userKey && hubKey) {
        console.log('Both keys provided. Using Immediate 2-of-2 path.');
        selectedScript = scriptImmediate;
        sequence = 0; // Immediate
        signers = [userKey, hubKey];
      } else if (userKey) {
        console.log('Only User key provided. Using User + 144 CSV path.');
        selectedScript = scriptUser;
        sequence = 144; // Delayed
        signers = [userKey];
      } else if (hubKey) {
        console.log('Only Hub key provided. Using Hub + 144 CSV path.');
        selectedScript = scriptHub;
        sequence = 144; // Delayed
        signers = [hubKey];
      } else {
        throw new Error('No valid private keys provided for signing.');
      }

      const tapLeaf = {
        output: selectedScript,
      };

      // Generate address and control block for the SELECTED path
      const { output: scriptPubKey, witness } = (bitcoin.payments.p2tr as any)({
        internalPubkey: Buffer.from(
          '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
          'hex'
        ),
        scriptTree,
        redeem: tapLeaf, // This generates the specific control block for this leaf
        network,
      });

      // Extract control block from witness
      // Witness stack for script path: [stack elements..., script, controlBlock]
      // bitcoinjs-lib returns witness as array of buffers. The last one is the control block.
      const controlBlock = witness![witness!.length - 1];

      // Use provided multisigAddress if available, otherwise use taprootAddress, otherwise derive
      // Note: The address should be the same regardless of which path we spend, as it depends on the root.
      const finalMultisigAddress = multisigAddress || taprootAddress || (() => {
        const { address } = (bitcoin.payments.p2tr as any)({
          internalPubkey: Buffer.from(
            '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
            'hex'
          ),
          scriptTree,
          network,
        });
        return address;
      })();

      if (!scriptPubKey) throw new Error('Failed to derive scriptPubKey');

      // 2. Fetch UTXOs
      console.log(`Fetching UTXOs for address: ${finalMultisigAddress}`);
      const { data: utxos } = await axios.get(
        `https://mempool.space/testnet/api/address/${finalMultisigAddress}/utxo`
      );
      console.log(`Found ${utxos?.length || 0} UTXOs`);

      if (!utxos || utxos.length === 0) {
        throw new Error('No UTXOs found for the multisig address');
      }

      // 3. Fetch Fee Rate
      console.log('Fetching fee rates...');
      let feeRate = 7.5; // Default fallback
      try {
        const { data: fees } = await axios.get('https://mempool.space/testnet/api/v1/fees/recommended');
        feeRate = fees.fastestFee;
        console.log(`Current fastest fee rate: ${feeRate} sat/vB`);
      } catch (error) {
        console.warn('Failed to fetch fee rates, using default:', feeRate);
      }

      // 4. Create PSBT
      console.log('Creating PSBT...');
      const psbt = new bitcoin.Psbt({ network });

      const sendAmount = 10000; // 0.0001 BTC

      // Fee Estimation Constants
      const INPUT_SIZE = 150; // Conservative estimate for Taproot script path spend (vBytes)
      const OUTPUT_SIZE = 43; // P2TR/P2WPKH output (vBytes)
      const OVERHEAD = 10; // Version, locktime, etc. (vBytes)

      let totalInput = 0;
      let inputsToAdd: any[] = [];
      let estimatedFee = 0;

      // Select UTXOs
      for (const utxo of utxos) {
        const txHex = await axios.get(
          `https://mempool.space/testnet/api/tx/${utxo.txid}/hex`
        );

        inputsToAdd.push({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: scriptPubKey!,
            value: BigInt(utxo.value),
          },
          tapLeafScript: [
            {
              leafVersion: 192, // 0xC0 in decimal
              script: selectedScript,
              controlBlock: controlBlock,
            },
          ],
          sequence: sequence,
        });

        totalInput += utxo.value;

        // Calculate required amount with dynamic fee
        // We have 2 outputs (Recipient + Change) in most cases
        const numInputs = inputsToAdd.length;
        const estimatedVSize = (numInputs * INPUT_SIZE) + (2 * OUTPUT_SIZE) + OVERHEAD;
        estimatedFee = estimatedVSize * feeRate;

        if (totalInput >= sendAmount + estimatedFee) break;
      }

      if (totalInput < sendAmount + estimatedFee) {
        throw new Error(`Insufficient funds. Have: ${totalInput}, Need: ${sendAmount + estimatedFee} (Amount: ${sendAmount} + Fee: ${estimatedFee})`);
      }

      console.log(`Estimated Fee: ${estimatedFee} sats (Rate: ${feeRate} sat/vB, vSize: ~${estimatedFee / feeRate})`);

      // Add inputs to PSBT
      for (const input of inputsToAdd) {
        psbt.addInput(input);
      }

      // 5. Add outputs
      psbt.addOutput({
        address: 'mieqF8AK1SLqYqH75t3Sp8oATzFN5jpt7L',
        value: BigInt(sendAmount),
      });

      // Change output
      const change = totalInput - sendAmount - estimatedFee;
      if (change > 546) { // Dust limit
        psbt.addOutput({
          address: finalMultisigAddress,
          value: BigInt(change),
        });
      }

      // 6. Sign Input
      console.log('Signing inputs...');
      for (const signer of signers) {
        psbt.signAllInputs(signer);
      }

      console.log('Finalizing inputs...');
      psbt.finalizeAllInputs();

      // 7. Broadcast
      console.log('Extracting transaction...');
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();
      const virtualSize = tx.virtualSize();
      console.log(`Actual Transaction vSize: ${virtualSize} vBytes`);
      console.log(`Actual Fee Rate: ${(totalInput - Number(tx.outs.reduce((acc, out) => acc + Number(out.value), 0))) / virtualSize} sat/vB`);

      try {
        const broadcastRes = await axios.post(
          'https://mempool.space/testnet/api/tx',
          txHex,
          {
            headers: {
              'Content-Type': 'text/plain',
            },
          }
        );
        console.log('Broadcast success:', broadcastRes.data);

        return broadcastRes.data; // txid
      } catch (broadcastError: any) {
        console.error('Broadcast error details:', {
          status: broadcastError.response?.status,
          statusText: broadcastError.response?.statusText,
          data: broadcastError.response?.data,
          txHex: txHex.substring(0, 100) + '...',
        });
        throw new Error(`Broadcast failed: ${broadcastError.response?.data || broadcastError.message}`);
      }

    } catch (error: any) {
      console.error('Detailed error:', error);
      if (error.cause) console.error('Error cause:', error.cause);
      if (error.errors) console.error('Aggregate errors:', error.errors); // For AggregateError

      throw new Error(`Failed to create and broadcast transaction: ${error.message || error}`);
    }
  }
}
