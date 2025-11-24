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
import { useAppDispatch, useAppSelector } from './store/hooks';
import {
  initializeWallet,
  updateBalance,
  addTransaction,
  startSettlement,
  updateSettlementStatus,
  completeSettlement,
  type Transaction,
  type SettlementData,
} from './store/slices/walletSlice';

export type Screen = 'onboarding' | 'dashboard' | 'deposit' | 'send' | 'settle' | 'audit';

export default function App() {
  const dispatch = useAppDispatch();
  const walletState = useAppSelector((state) => state.wallet);
  const [currentScreen, setCurrentScreen] = useState<Screen>('onboarding');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  // Check if wallet is initialized and set screen accordingly
  useEffect(() => {
    if (walletState.initialized && currentScreen === 'onboarding') {
      setCurrentScreen('dashboard');
    }
  }, [walletState.initialized, currentScreen]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const handleInitializeWallet = () => {
    dispatch(
      initializeWallet({
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
            timestamp: new Date(Date.now() - 120000).toISOString(),
          },
          {
            id: '2',
            type: 'deposit',
            counterparty: 'Self',
            amount: 50000,
            fee: 0,
            status: 'success',
            timestamp: new Date(Date.now() - 3600000).toISOString(),
          },
        ],
      })
    );
    setCurrentScreen('dashboard');
  };

  const handleAddTransaction = (transaction: Transaction) => {
    dispatch(
      addTransaction({
        ...transaction,
        timestamp: transaction.timestamp instanceof Date ? transaction.timestamp.toISOString() : transaction.timestamp,
      })
    );
  };

  const handleUpdateBalance = (availableL2: number, frozen: number, onChain: number) => {
    dispatch(updateBalance({ availableL2, frozen, onChain }));
  };

  const handleStartSettlement = (settlementData: SettlementData) => {
    dispatch(startSettlement(settlementData));
  };

  const handleCompleteSettlement = () => {
    dispatch(completeSettlement());
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
                    handleUpdateBalance(walletState.availableL2 + amount, walletState.frozen, walletState.onChain);
                    handleAddTransaction({
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
                    handleUpdateBalance(walletState.availableL2 - amount - fee, walletState.frozen, walletState.onChain);
                    handleAddTransaction({
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
                    handleStartSettlement({
                      amount,
                      fee,
                      priority,
                      txid: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
                      status: 'frozen',
                      destination,
                    });
                    handleAddTransaction({
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
                onComplete={handleCompleteSettlement}
                onUpdateStatus={(status) => {
                  dispatch(updateSettlementStatus(status));
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
