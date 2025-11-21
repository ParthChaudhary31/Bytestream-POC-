import { useState, useEffect } from 'react';
import { Onboarding } from './components/Onboarding';
import { NetworkSetup } from './components/NetworkSetup';
import { Dashboard } from './components/Dashboard';
import { Deposit } from './components/Deposit';
import { Send } from './components/Send';
import { Settle } from './components/Settle';
import { SettlementStatus } from './components/SettlementStatus';
import { Audit } from './components/Audit';
import { Navigation } from './components/Navigation';

export type Screen = 'onboarding' | 'dashboard' | 'deposit' | 'send' | 'settle' | 'audit';

export interface WalletState {
  initialized: boolean;
  address: string;
  walletId: string;
  totalBalance: number;
  availableL2: number;
  frozen: number;
  onChain: number;
  hubOnline: boolean;
  transactions: Transaction[];
  settlementInProgress: boolean;
  settlementData: SettlementData | null;
}

export interface Transaction {
  id: string;
  type: 'intent' | 'settlement' | 'deposit';
  counterparty: string;
  amount: number;
  fee: number;
  status: 'success' | 'confirming' | 'pending';
  timestamp: Date;
  memo?: string;
}

export interface SettlementData {
  amount: number;
  fee: number;
  priority: 'economy' | 'standard' | 'priority';
  txid: string;
  status: 'frozen' | 'signing' | 'broadcasting' | 'mempool' | 'confirmed';
  destination: string;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<Screen>('onboarding');
  const [walletState, setWalletState] = useState<WalletState>({
    initialized: false,
    address: '',
    walletId: '',
    totalBalance: 0,
    availableL2: 0,
    frozen: 0,
    onChain: 0,
    hubOnline: true,
    transactions: [],
    settlementInProgress: false,
    settlementData: null,
  });

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const initializeWallet = () => {
    setWalletState({
      ...walletState,
      initialized: true,
      address: 'bc1p4xh7k2mnw3y8vqz9x4l2p8r6t5w7a9c3e5g7h',
      walletId: 'bc1p...xy7z',
      totalBalance: 1250000,
      availableL2: 1000000,
      frozen: 0,
      onChain: 250000,
      hubOnline: true,
      transactions: [
        {
          id: '1',
          type: 'intent',
          counterparty: 'bc1...user',
          amount: -5000,
          fee: 24,
          status: 'success',
          timestamp: new Date(Date.now() - 120000),
        },
        {
          id: '2',
          type: 'deposit',
          counterparty: 'Self',
          amount: 50000,
          fee: 0,
          status: 'success',
          timestamp: new Date(Date.now() - 3600000),
        },
      ],
    });
    setCurrentScreen('dashboard');
  };

  const addTransaction = (transaction: Transaction) => {
    setWalletState({
      ...walletState,
      transactions: [transaction, ...walletState.transactions],
    });
  };

  const updateBalance = (availableL2: number, frozen: number, onChain: number) => {
    setWalletState({
      ...walletState,
      availableL2,
      frozen,
      onChain,
      totalBalance: availableL2 + frozen + onChain,
    });
  };

  const startSettlement = (settlementData: SettlementData) => {
    setWalletState({
      ...walletState,
      settlementInProgress: true,
      settlementData,
      availableL2: walletState.availableL2 - settlementData.amount - settlementData.fee,
      frozen: settlementData.amount,
    });
  };

  const completeSettlement = () => {
    setWalletState({
      ...walletState,
      settlementInProgress: false,
      settlementData: null,
      frozen: 0,
      onChain: walletState.onChain + (walletState.settlementData?.amount || 0),
    });
    showToast('Settlement Complete! Funds moved to L1.', 'success');
  };

  return (
    <div className="min-h-screen bg-[#121212] text-white">
      {/* Background Grid */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'linear-gradient(#2C2C2C 1px, transparent 1px), linear-gradient(90deg, #2C2C2C 1px, transparent 1px)',
          backgroundSize: '50px 50px',
        }}
      />

      {/* Toast Notifications */}
      {toast && (
        <div
          className={`fixed z-50 px-6 py-4 rounded border-2 ${
            toast.type === 'success'
              ? 'bg-[#10B981]/10 border-[#10B981] bottom-8 left-1/2 -translate-x-1/2'
              : 'bg-[#EF4444]/10 border-[#EF4444] top-8 right-8'
          }`}
        >
          <p className="text-white">{toast.message}</p>
        </div>
      )}

      {/* Content */}
      <div className="relative z-10">
        {currentScreen === 'onboarding' ? (
          <NetworkSetup />
        ) : (
          <>
            <Navigation
              walletState={walletState}
              currentScreen={currentScreen}
              onNavigate={setCurrentScreen}
            />
            
            <main className="max-w-[1440px] mx-auto px-8 py-8">
              {currentScreen === 'dashboard' && (
                <Dashboard
                  walletState={walletState}
                  onNavigate={setCurrentScreen}
                  showToast={showToast}
                />
              )}
              {currentScreen === 'deposit' && (
                <Deposit
                  address={walletState.address}
                  onBack={() => setCurrentScreen('dashboard')}
                  showToast={showToast}
                  onDeposit={(amount) => {
                    updateBalance(walletState.availableL2 + amount, walletState.frozen, walletState.onChain);
                    addTransaction({
                      id: Date.now().toString(),
                      type: 'deposit',
                      counterparty: 'Self',
                      amount,
                      fee: 0,
                      status: 'confirming',
                      timestamp: new Date(),
                    });
                  }}
                />
              )}
              {currentScreen === 'send' && (
                <Send
                  availableBalance={walletState.availableL2}
                  onBack={() => setCurrentScreen('dashboard')}
                  onSend={(recipient, amount, fee, memo) => {
                    updateBalance(walletState.availableL2 - amount - fee, walletState.frozen, walletState.onChain);
                    addTransaction({
                      id: Date.now().toString(),
                      type: 'intent',
                      counterparty: recipient,
                      amount: -amount,
                      fee,
                      status: 'success',
                      timestamp: new Date(),
                      memo,
                    });
                    showToast('Intent Signed & Logged. Ledger Updated.', 'success');
                    setCurrentScreen('dashboard');
                  }}
                  showToast={showToast}
                />
              )}
              {currentScreen === 'settle' && (
                <Settle
                  availableBalance={walletState.availableL2}
                  onBack={() => setCurrentScreen('dashboard')}
                  onSettle={(destination, priority, fee) => {
                    const amount = walletState.availableL2 - fee;
                    startSettlement({
                      amount,
                      fee,
                      priority,
                      txid: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
                      status: 'frozen',
                      destination,
                    });
                    addTransaction({
                      id: Date.now().toString(),
                      type: 'settlement',
                      counterparty: 'Self',
                      amount: -amount,
                      fee,
                      status: 'confirming',
                      timestamp: new Date(),
                    });
                    setCurrentScreen('dashboard');
                  }}
                  showToast={showToast}
                />
              )}
              {currentScreen === 'audit' && (
                <Audit
                  transactions={walletState.transactions}
                  onBack={() => setCurrentScreen('dashboard')}
                  showToast={showToast}
                />
              )}
            </main>

            {walletState.settlementInProgress && walletState.settlementData && (
              <SettlementStatus
                settlementData={walletState.settlementData}
                onMinimize={() => {}}
                onComplete={completeSettlement}
                onUpdateStatus={(status) => {
                  if (walletState.settlementData) {
                    setWalletState({
                      ...walletState,
                      settlementData: { ...walletState.settlementData, status },
                    });
                  }
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
