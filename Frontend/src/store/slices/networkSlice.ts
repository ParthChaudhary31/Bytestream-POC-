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

interface NetworkState {
  user1Keys: UserKeys | null;
  hubKeys: UserKeys | null;
  user2Keys: UserKeys | null;
  user1HubTaproot: TaprootMultisig | null;
  user2HubTaproot: TaprootMultisig | null;
  user1TransactionTxid: string | null;
  user2TransactionTxid: string | null;
}

const initialState: NetworkState = {
  user1Keys: null,
  hubKeys: null,
  user2Keys: null,
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
  resetNetwork,
} = networkSlice.actions;

export default networkSlice.reducer;

