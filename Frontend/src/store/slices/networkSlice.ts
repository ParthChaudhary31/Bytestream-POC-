import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface UserKeys {
  address: string;
  privateKey: string;
  publicKey: string;
  mnemonic?: string;
  derivationPath?: string;
  network?: string;
}

export interface TaprootMultisig {
  address: string;
  scriptHex: string;
}

interface UserWallet extends UserKeys {
  id: string;
  name: string;
  createdAt: string;
}

interface NetworkState {
  user1Keys: UserKeys | null;
  hubKeys: UserKeys | null;
  user2Keys: UserKeys | null;
  userWallets: UserWallet[]; // List of all generated user wallets
  user1HubTaproot: TaprootMultisig | null;
  user2HubTaproot: TaprootMultisig | null;
  user1TransactionTxid: string | null;
  user2TransactionTxid: string | null;
}

const initialState: NetworkState = {
  user1Keys: null,
  hubKeys: null,
  user2Keys: null,
  userWallets: [],
  user1HubTaproot: null,
  user2HubTaproot: null,
  user1TransactionTxid: null,
  user2TransactionTxid: null,
};

const networkSlice = createSlice({
  name: 'network',
  initialState,
  reducers: {
    setUser1Keys: (state, action: PayloadAction<UserKeys>) => {
      state.user1Keys = action.payload;
    },
    setHubKeys: (state, action: PayloadAction<UserKeys>) => {
      state.hubKeys = action.payload;
    },
    setUser2Keys: (state, action: PayloadAction<UserKeys>) => {
      state.user2Keys = action.payload;
    },
    setUser1HubTaproot: (state, action: PayloadAction<TaprootMultisig>) => {
      state.user1HubTaproot = action.payload;
    },
    setUser2HubTaproot: (state, action: PayloadAction<TaprootMultisig>) => {
      state.user2HubTaproot = action.payload;
    },
    setUser1TransactionTxid: (state, action: PayloadAction<string>) => {
      state.user1TransactionTxid = action.payload;
    },
    setUser2TransactionTxid: (state, action: PayloadAction<string>) => {
      state.user2TransactionTxid = action.payload;
    },
    addUserWallet: (state, action: PayloadAction<UserWallet>) => {
      // Check if wallet with same address already exists
      const exists = state.userWallets.some(w => w.address === action.payload.address);
      if (!exists) {
        state.userWallets.push(action.payload);
      }
    },
    removeUserWallet: (state, action: PayloadAction<string>) => {
      state.userWallets = state.userWallets.filter(w => w.id !== action.payload);
    },
    updateUserWallet: (state, action: PayloadAction<{ id: string; updates: Partial<UserWallet> }>) => {
      const index = state.userWallets.findIndex(w => w.id === action.payload.id);
      if (index !== -1) {
        state.userWallets[index] = { ...state.userWallets[index], ...action.payload.updates };
      }
    },
    clearUserWallets: (state) => {
      state.userWallets = [];
    },
    resetNetwork: () => initialState,
  },
});

export const {
  setUser1Keys,
  setHubKeys,
  setUser2Keys,
  setUser1HubTaproot,
  setUser2HubTaproot,
  setUser1TransactionTxid,
  setUser2TransactionTxid,
  addUserWallet,
  removeUserWallet,
  updateUserWallet,
  clearUserWallets,
  resetNetwork,
} = networkSlice.actions;

export type { UserWallet };

export default networkSlice.reducer;

