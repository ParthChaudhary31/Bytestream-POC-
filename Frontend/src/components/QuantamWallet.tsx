import React, { useState, useEffect } from 'react';
import { Screen } from '../App';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { ArrowLeft, Wallet, CheckCircle2, XCircle, Copy, Send, Loader2, AlertCircle } from 'lucide-react';

interface QuantamWalletProps {
  onNavigate: (screen: Screen) => void;
  showToast: (message: string, type: 'success' | 'error') => void;
}

interface QuantamWalletState {
  address: string | null;
  balance: string;
  network: string;
  chainId: number | null;
}

// Ethereum/MetaMask wallet interface
interface EthereumProvider {
  request(args: { method: string; params?: any[] }): Promise<any>;
  isMetaMask?: boolean;
  chainId?: string;
  selectedAddress?: string;
  on(event: string, handler: (...args: any[]) => void): void;
  removeListener(event: string, handler: (...args: any[]) => void): void;
  removeAllListeners(event?: string): void;
}

export function QuantamWallet({ onNavigate, showToast }: QuantamWalletProps) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [walletState, setWalletState] = useState<QuantamWalletState>({
    address: null,
    balance: '0',
    network: 'Not Connected',
    chainId: null,
  });
  
  // Send transaction state
  const [showSendForm, setShowSendForm] = useState(false);
  const [recipientAddress, setRecipientAddress] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState('');

  // Check if wallet is already connected on mount
  useEffect(() => {
    const checkConnection = async () => {
      const ethereum = (window as any).ethereum as EthereumProvider | undefined;
      if (ethereum) {
        try {
          const accounts = await ethereum.request({ method: 'eth_accounts' });
          if (accounts && accounts.length > 0) {
            const address = accounts[0];
            const chainId = await ethereum.request({ method: 'eth_chainId' });
            const balance = await ethereum.request({
              method: 'eth_getBalance',
              params: [address, 'latest'],
            });
            
            setWalletState({
              address,
              balance: (parseInt(balance, 16) / 1e18).toFixed(4),
              network: getNetworkName(parseInt(chainId, 16)),
              chainId: parseInt(chainId, 16),
            });
            setIsConnected(true);
          }
        } catch (error) {
          console.error('Error checking connection:', error);
        }
      }
    };

    checkConnection();

    // Listen for account changes
    const ethereum = (window as any).ethereum as EthereumProvider | undefined;
    if (ethereum) {
      ethereum.on('accountsChanged', (accounts: string[]) => {
        if (accounts.length === 0) {
          setIsConnected(false);
          setWalletState({
            address: null,
            balance: '0',
            network: 'Not Connected',
            chainId: null,
          });
        } else {
          handleAccountChange(accounts[0]);
        }
      });

      ethereum.on('chainChanged', (chainId: string) => {
        if (walletState.address) {
          handleChainChange(parseInt(chainId, 16), walletState.address);
        }
      });
    }

    return () => {
      const ethereum = (window as any).ethereum as EthereumProvider | undefined;
      if (ethereum) {
        ethereum.removeAllListeners('accountsChanged');
        ethereum.removeAllListeners('chainChanged');
      }
    };
  }, []);

  const getNetworkName = (chainId: number): string => {
    const networks: { [key: number]: string } = {
      1: 'Ethereum Mainnet',
      5: 'Goerli Testnet',
      11155111: 'Sepolia Testnet',
      137: 'Polygon',
      56: 'BNB Chain',
      42161: 'Arbitrum',
      10: 'Optimism',
      80001: 'Polygon Mumbai Testnet',
      97: 'BNB Chain Testnet',
    };
    return networks[chainId] || `Chain ${chainId}`;
  };

  const handleAccountChange = async (address: string) => {
    try {
      const ethereum = (window as any).ethereum as EthereumProvider;
      const chainId = await ethereum.request({ method: 'eth_chainId' });
      const balance = await ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });
      
      setWalletState({
        address,
        balance: (parseInt(balance, 16) / 1e18).toFixed(4),
        network: getNetworkName(parseInt(chainId, 16)),
        chainId: parseInt(chainId, 16),
      });
      setIsConnected(true);
    } catch (error) {
      console.error('Error updating account:', error);
    }
  };

  const handleChainChange = async (chainId: number, address: string) => {
    try {
      const ethereum = (window as any).ethereum as EthereumProvider;
      const balance = await ethereum.request({
        method: 'eth_getBalance',
        params: [address, 'latest'],
      });
      
      setWalletState((prev) => ({
        ...prev,
        balance: (parseInt(balance, 16) / 1e18).toFixed(4),
        network: getNetworkName(chainId),
        chainId,
      }));
    } catch (error) {
      console.error('Error updating chain:', error);
    }
  };

  const handleConnectWallet = async () => {
    if (isConnected) {
      // Disconnect wallet
      setIsConnected(false);
      setWalletState({
        address: null,
        balance: '0',
        network: 'Not Connected',
        chainId: null,
      });
      showToast('Wallet disconnected', 'success');
      return;
    }

    setIsConnecting(true);
    try {
      // Check if MetaMask or other Ethereum wallet is available
      const ethereum = (window as any).ethereum as EthereumProvider | undefined;
      if (!ethereum) {
        showToast('No Web3 wallet found. Please install MetaMask or another Web3 wallet.', 'error');
        window.open('https://metamask.io/download/', '_blank');
        return;
      }

      // Request account access
      const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
      
      if (accounts && accounts.length > 0) {
        const address = accounts[0];
        const chainId = await ethereum.request({ method: 'eth_chainId' });
        const balance = await ethereum.request({
          method: 'eth_getBalance',
          params: [address, 'latest'],
        });
        
        setWalletState({
          address,
          balance: (parseInt(balance, 16) / 1e18).toFixed(4),
          network: getNetworkName(parseInt(chainId, 16)),
          chainId: parseInt(chainId, 16),
        });
        setIsConnected(true);
        showToast('Quantam Wallet connected successfully!', 'success');
      } else {
        throw new Error('No accounts found');
      }
    } catch (error: any) {
      console.error('Wallet connection error:', error);
      if (error.code === 4001) {
        showToast('Connection rejected by user', 'error');
      } else {
        showToast(
          error.message || 'Failed to connect wallet',
          'error'
        );
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCopyAddress = () => {
    if (walletState.address) {
      navigator.clipboard.writeText(walletState.address);
      showToast('Address copied to clipboard', 'success');
    }
  };

  const refreshBalance = async () => {
    if (!walletState.address) return;
    
    try {
      const ethereum = (window as any).ethereum as EthereumProvider;
      const balance = await ethereum.request({
        method: 'eth_getBalance',
        params: [walletState.address, 'latest'],
      });
      
      setWalletState((prev) => ({
        ...prev,
        balance: (parseInt(balance, 16) / 1e18).toFixed(4),
      }));
    } catch (error) {
      console.error('Error refreshing balance:', error);
    }
  };

  const validateAddress = (address: string): boolean => {
    // Basic Ethereum address validation
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  };

  const handleSendTransaction = async () => {
    setSendError('');
    
    // Validation
    if (!recipientAddress.trim()) {
      setSendError('Please enter recipient address');
      return;
    }
    
    if (!validateAddress(recipientAddress.trim())) {
      setSendError('Invalid Ethereum address format');
      return;
    }
    
    if (!sendAmount || parseFloat(sendAmount) <= 0) {
      setSendError('Please enter a valid amount');
      return;
    }
    
    setIsSending(true);
    
    try {
      const ethereum = (window as any).ethereum as EthereumProvider;
      
      if (!ethereum) {
        throw new Error('Wallet not connected');
      }
      
      // Convert ETH to Wei (handle decimals properly)
      // Multiply by 1e18 and convert to string to avoid floating point issues
      const amountStr = sendAmount.toString();
      const [integerPart, decimalPart = ''] = amountStr.split('.');
      const paddedDecimal = decimalPart.padEnd(18, '0').substring(0, 18);
      const weiString = integerPart + paddedDecimal;
      const amountInWei = BigInt(weiString);
      const amountHex = '0x' + amountInWei.toString(16);
      
      // Get gas price
      const gasPrice = await ethereum.request({ method: 'eth_gasPrice' });
      
      // Send transaction
      const txHash = await ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: walletState.address,
          to: recipientAddress.trim(),
          value: amountHex,
          gasPrice: gasPrice,
        }],
      });
      
      showToast(`Transaction sent! Hash: ${txHash.substring(0, 10)}...`, 'success');
      
      // Reset form
      setRecipientAddress('');
      setSendAmount('');
      setShowSendForm(false);
      
      // Wait a bit and refresh balance
      setTimeout(() => {
        refreshBalance();
      }, 2000);
      
    } catch (error: any) {
      console.error('Transaction error:', error);
      if (error.code === 4001) {
        setSendError('Transaction rejected by user');
        showToast('Transaction rejected', 'error');
      } else if (error.code === -32603) {
        setSendError('Transaction failed. Check your balance and gas fees.');
        showToast('Transaction failed', 'error');
      } else {
        setSendError(error.message || 'Failed to send transaction');
        showToast(error.message || 'Failed to send transaction', 'error');
      }
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto">
      <Button
        onClick={() => onNavigate('dashboard')}
        variant="ghost"
        className="mb-6 text-[#888] hover:text-white"
      >
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Dashboard
      </Button>

      <div className="bg-[#1A1A1A] border-2 border-[#2C2C2C] rounded-lg p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-white text-2xl font-bold mb-2">Quantam Wallet</h1>
            <p className="text-[#888] text-sm">
              Your trusted connection to the Web3
            </p>
          </div>
          
          <Button
            onClick={handleConnectWallet}
            disabled={isConnecting}
            className={`${
              isConnected
                ? 'bg-[#EF4444] hover:bg-[#DC2626] text-white'
                : 'bg-[#FF9F1C] hover:bg-[#FF8C00] text-black'
            } font-semibold px-6 py-2 flex items-center gap-2`}
          >
            {isConnecting ? (
              <>
                <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                Connecting...
              </>
            ) : isConnected ? (
              <>
                <XCircle className="w-4 h-4" />
                Disconnect Wallet
              </>
            ) : (
              <>
                <Wallet className="w-4 h-4" />
                Connect Wallet
              </>
            )}
          </Button>
        </div>

        <div className="space-y-4">
          {isConnected && walletState.address ? (
            <>
              <div className="bg-[#10B981]/10 border-2 border-[#10B981] rounded-lg p-4 flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#10B981]" />
                <div>
                  <p className="text-[#10B981] font-semibold">Quantam Wallet Connected</p>
                  <p className="text-[#888] text-sm">Your Web3 wallet is successfully connected</p>
                </div>
              </div>

              <div className="bg-[#121212] border border-[#2C2C2C] rounded-lg p-6">
                <h2 className="text-white text-lg font-semibold mb-4">Wallet Information</h2>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-[#888]">Network:</span>
                    <span className="text-white font-semibold">
                      {walletState.network}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#888]">Address:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-white font-mono text-xs break-all text-right max-w-[70%]">
                        {walletState.address.substring(0, 6)}...{walletState.address.substring(walletState.address.length - 4)}
                      </span>
                      <button
                        onClick={handleCopyAddress}
                        className="text-[#888] hover:text-white transition-colors"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="border-t border-[#2C2C2C] pt-3 mt-3">
                    <div className="flex justify-between items-center">
                      <span className="text-[#888]">Balance:</span>
                      <span className="text-white font-semibold text-lg">
                        {walletState.balance} ETH
                      </span>
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-[#888]">Chain ID:</span>
                    <span className="text-white font-mono">
                      {walletState.chainId}
                    </span>
                  </div>
                </div>
              </div>

              {/* Send Transaction Section */}
              <div className="bg-[#121212] border border-[#2C2C2C] rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-white text-lg font-semibold">Send Transaction</h2>
                  {!showSendForm && (
                    <Button
                      onClick={() => setShowSendForm(true)}
                      className="bg-[#FF9F1C] hover:bg-[#FF8C00] text-black font-semibold"
                    >
                      <Send className="w-4 h-4 mr-2" />
                      Send ETH
                    </Button>
                  )}
                </div>

                {showSendForm && (
                  <div className="space-y-4 mt-4">
                    <div>
                      <label className="block text-[#888] text-sm mb-2">
                        Recipient Address
                      </label>
                      <Input
                        value={recipientAddress}
                        onChange={(e) => {
                          setRecipientAddress(e.target.value);
                          setSendError('');
                        }}
                        placeholder="0x..."
                        className="bg-[#0A0A0A] border-[#2C2C2C] text-white font-mono text-sm"
                        disabled={isSending}
                      />
                    </div>

                    <div>
                      <label className="block text-[#888] text-sm mb-2">
                        Amount (ETH)
                      </label>
                      <div className="relative">
                        <Input
                          type="number"
                          step="0.0001"
                          value={sendAmount}
                          onChange={(e) => {
                            setSendAmount(e.target.value);
                            setSendError('');
                          }}
                          placeholder="0.0"
                          className="bg-[#0A0A0A] border-[#2C2C2C] text-white font-mono"
                          disabled={isSending}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888] text-sm">
                          Max: {walletState.balance} ETH
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSendAmount(walletState.balance);
                          setSendError('');
                        }}
                        className="text-[#FF9F1C] text-xs mt-1 hover:underline"
                        disabled={isSending}
                      >
                        Use Max
                      </button>
                    </div>

                    {sendError && (
                      <div className="flex items-center gap-2 text-[#EF4444] text-sm bg-[#EF4444]/10 border border-[#EF4444] rounded p-3">
                        <AlertCircle className="w-4 h-4" />
                        <span>{sendError}</span>
                      </div>
                    )}

                    <div className="flex gap-3">
                      <Button
                        onClick={handleSendTransaction}
                        disabled={isSending || !recipientAddress || !sendAmount || !!sendError}
                        className="flex-1 bg-[#FF9F1C] hover:bg-[#FF8C00] text-black font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSending ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Sending...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4 mr-2" />
                            Send Transaction
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={() => {
                          setShowSendForm(false);
                          setRecipientAddress('');
                          setSendAmount('');
                          setSendError('');
                        }}
                        variant="ghost"
                        className="text-[#888] hover:text-white"
                        disabled={isSending}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-[#121212] border border-[#2C2C2C] rounded-lg p-8 text-center">
              <Wallet className="w-16 h-16 text-[#888] mx-auto mb-4" />
              <h2 className="text-white text-lg font-semibold mb-2">No Wallet Connected</h2>
              <p className="text-[#888] text-sm mb-6">
                Connect your Web3 wallet (MetaMask, WalletConnect, etc.) to get started with Quantam Wallet
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

