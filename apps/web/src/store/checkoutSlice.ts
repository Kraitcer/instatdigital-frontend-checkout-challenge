import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { CreateOrder, Customer } from '@checkout/contracts';

export type DeliveryMode = 'pickup' | 'courier';
export type PaymentMethod = 'card' | 'cash_on_delivery';

export type CheckoutFormState = {
  customer: Customer;
  deliveryMode: DeliveryMode;
  pickupPointId: string;
  address: {
    city: string;
    street: string;
    house: string;
    apartment: string;
  };
  paymentMethod: PaymentMethod;
  selectedCardId: string;
};

export type CheckoutState = {
  token: string | null;
  sessionId: string | null;
  orderId: string | null;
  paymentId: string | null;
  orderKey: string | null;
  orderQuoteId: string | null;
  orderBody: CreateOrder | null;
  paymentKey: string | null;
  form: CheckoutFormState;
};

const initialState: CheckoutState = {
  token: null,
  sessionId: null,
  orderId: null,
  paymentId: null,
  orderKey: null,
  orderQuoteId: null,
  orderBody: null,
  paymentKey: null,
  form: {
    customer: { name: '', email: '', phone: '' },
    deliveryMode: 'pickup',
    pickupPointId: 'point-center',
    address: { city: 'Учебный', street: '', house: '', apartment: '' },
    paymentMethod: 'card',
    selectedCardId: '',
  },
};

const checkoutSlice = createSlice({
  name: 'checkout',
  initialState,
  reducers: {
    sessionReceived(state, action: PayloadAction<{ token: string; sessionId: string }>) {
      state.token = action.payload.token;
      state.sessionId = action.payload.sessionId;
    },
    sessionInvalidated(state) {
      state.token = null;
      state.sessionId = null;
      state.orderId = null;
      state.paymentId = null;
      state.orderKey = null;
      state.orderQuoteId = null;
      state.orderBody = null;
      state.paymentKey = null;
    },
    formChanged(state, action: PayloadAction<CheckoutFormState>) {
      state.form = action.payload;
    },
    cardSelected(state, action: PayloadAction<string>) {
      state.form.selectedCardId = action.payload;
    },
    orderRequestStarted(
      state,
      action: PayloadAction<{ key: string; quoteId: string; body: CreateOrder }>,
    ) {
      state.orderKey = action.payload.key;
      state.orderQuoteId = action.payload.quoteId;
      state.orderBody = action.payload.body;
    },
    orderReceived(state, action: PayloadAction<string>) {
      state.orderId = action.payload;
      state.paymentId = null;
      state.orderQuoteId = null;
      state.orderBody = null;
      state.paymentKey = null;
    },
    orderAttemptCleared(state) {
      state.orderKey = null;
      state.orderQuoteId = null;
      state.orderBody = null;
    },
    paymentRequestStarted(state, action: PayloadAction<string>) {
      state.paymentKey = action.payload;
    },
    paymentReceived(state, action: PayloadAction<string>) {
      state.paymentId = action.payload;
    },
    paymentCleared(state) {
      state.paymentId = null;
    },
    orderCleared(state) {
      state.orderId = null;
      state.paymentId = null;
      state.orderKey = null;
      state.orderQuoteId = null;
      state.orderBody = null;
      state.paymentKey = null;
    },
  },
});

export const {
  cardSelected,
  formChanged,
  paymentCleared,
  orderCleared,
  orderReceived,
  orderAttemptCleared,
  orderRequestStarted,
  paymentReceived,
  paymentRequestStarted,
  sessionReceived,
  sessionInvalidated,
} = checkoutSlice.actions;

export const checkoutReducer = checkoutSlice.reducer;
