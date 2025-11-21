import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);

export interface Wallet {
  address: string;
  privateKey: string;
}

export class WalletService {
  /**
   * Generate a new Bitcoin wallet
   */
  static generateWallet(): Wallet {
    try {
      const network = bitcoin.networks.bitcoin;
      const keyPair = ECPair.makeRandom({ network });
      const { address } = bitcoin.payments.p2pkh({
        pubkey: keyPair.publicKey,
        network,
      });

      return {
        address: address || '',
        privateKey: keyPair.toWIF(),
      };
    } catch (error) {
      throw new Error(`Failed to generate wallet: ${error}`);
    }
  }
}

