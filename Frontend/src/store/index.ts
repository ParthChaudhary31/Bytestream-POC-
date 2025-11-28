import { configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage';
import { combineReducers } from '@reduxjs/toolkit';
import walletReducer from './slices/walletSlice';
import networkReducer from './slices/networkSlice';

const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['wallet', 'network'], // Only persist these slices
  migrate: (state: any) => {
    // Migration: Ensure userWallets is always an array
    if (state && state.network && !Array.isArray(state.network.userWallets)) {
      state.network.userWallets = [];
    }
    return Promise.resolve(state);
  },
};

const rootReducer = combineReducers({
  wallet: walletReducer,
  network: networkReducer,
});

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

