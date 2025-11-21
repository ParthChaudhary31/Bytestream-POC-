import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface Transaction {
  id: string;
  type: 'intent' | 'settlement' | 'deposit';
  counterparty: string;
  amount: number;
  fee: number;
  status: 'success' | 'confirming' | 'pending';
  timestamp: Date | string;
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

const initialState: WalletState = {
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
};

const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    initializeWallet: (state, action: PayloadAction<Partial<WalletState>>) => {
      return {
        ...state,
        ...action.payload,
        initialized: true,
      };
    },
    setWalletAddress: (state, action: PayloadAction<string>) => {
      state.address = action.payload;
    },
    setWalletId: (state, action: PayloadAction<string>) => {
      state.walletId = action.payload;
    },
    updateBalance: (
      state,
      action: PayloadAction<{
        availableL2: number;
        frozen: number;
        onChain: number;
      }>
    ) => {
      state.availableL2 = action.payload.availableL2;
      state.frozen = action.payload.frozen;
      state.onChain = action.payload.onChain;
      state.totalBalance =
        action.payload.availableL2 +
        action.payload.frozen +
        action.payload.onChain;
    },
    addTransaction: (state, action: PayloadAction<Transaction>) => {
      state.transactions.unshift(action.payload);
    },
    startSettlement: (state, action: PayloadAction<SettlementData>) => {
      state.settlementInProgress = true;
      state.settlementData = action.payload;
      state.availableL2 =
        state.availableL2 - action.payload.amount - action.payload.fee;
      state.frozen = action.payload.amount;
    },
    updateSettlementStatus: (
      state,
      action: PayloadAction<SettlementData['status']>
    ) => {
      if (state.settlementData) {
        state.settlementData.status = action.payload;
      }
    },
    completeSettlement: (state) => {
      const amount = state.settlementData?.amount || 0;
      state.settlementInProgress = false;
      state.settlementData = null;
      state.frozen = 0;
      state.onChain = state.onChain + amount;
    },
    setHubOnline: (state, action: PayloadAction<boolean>) => {
      state.hubOnline = action.payload;
    },
    resetWallet: () => initialState,
  },
});

export const {
  initializeWallet,
  setWalletAddress,
  setWalletId,
  updateBalance,
  addTransaction,
  startSettlement,
  updateSettlementStatus,
  completeSettlement,
  setHubOnline,
  resetWallet,
} = walletSlice.actions;

export default walletSlice.reducer;

