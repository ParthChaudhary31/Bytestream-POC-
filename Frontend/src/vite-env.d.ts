/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string;
  readonly VITE_API_VERSION?: string;
  readonly VITE_NODE_ENV?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

// Unisat Wallet types
interface UnisatWallet {
  requestAccounts(): Promise<string[]>;
  getAccounts(): Promise<string[]>;
  switchNetwork(network: 'livenet' | 'testnet'): Promise<void>;
  getNetwork(): Promise<'livenet' | 'testnet'>;
  getPublicKey(): Promise<string>;
  getBalance(): Promise<{ confirmed: number; unconfirmed: number; total: number }>;
  sendBitcoin(to: string, amount: number, options?: { feeRate?: number }): Promise<string>;
  signMessage(message: string, type?: string): Promise<string>;
  pushTx(txHex: string): Promise<string>;
  pushPsbt(psbtHex: string): Promise<string>;
  signPsbt(psbtHex: string, options?: { autoFinalized?: boolean; toSignInputs?: any[] }): Promise<string>;
  toPsbt(txHex: string): Promise<string>;
  fromPsbt(psbtHex: string): Promise<string>;
  getInscriptions(start?: number, size?: number): Promise<{ total: number; list: any[] }>;
  sendInscription(inscriptionId: string, to: string, options?: { feeRate?: number }): Promise<string>;
  on(event: string, handler: (...args: any[]) => void): void;
  removeListener(event: string, handler: (...args: any[]) => void): void;
}

// Ethereum/MetaMask wallet types
interface EthereumProvider {
  request(args: { method: string; params?: any[] }): Promise<any>;
  isMetaMask?: boolean;
  chainId?: string;
  selectedAddress?: string;
  on(event: string, handler: (...args: any[]) => void): void;
  removeListener(event: string, handler: (...args: any[]) => void): void;
  removeAllListeners(event?: string): void;
}

declare global {
  interface Window {
    unisat?: UnisatWallet;
    ethereum?: EthereumProvider;
  }
}

