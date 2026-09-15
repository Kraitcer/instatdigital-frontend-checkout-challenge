import { combineReducers, configureStore } from '@reduxjs/toolkit';
import {
  FLUSH,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
  REHYDRATE,
  persistReducer,
  persistStore,
} from 'redux-persist';
import storage from 'redux-persist/es/storage';
import { checkoutApi } from '../api/checkoutApi';
import { checkoutReducer } from './checkoutSlice';

const reducer = combineReducers({
  checkout: checkoutReducer,
  [checkoutApi.reducerPath]: checkoutApi.reducer,
});

const persistedReducer = persistReducer(
  { key: 'checkout-workflow', storage, whitelist: ['checkout'] },
  reducer,
);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }).concat(checkoutApi.middleware),
});

export const persistor = persistStore(store);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
