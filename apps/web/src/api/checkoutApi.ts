import { createApi, type BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type {
  Cart,
  CreateOrder,
  Delivery,
  Order,
  Payment,
  Product,
  Quote,
  Scenario,
  Simulation,
} from '@checkout/contracts';
import { request, type ApiFailure, type ApiResponse, type RequestOptions } from './client';
import type { CheckoutState } from '../store/checkoutSlice';

export type CheckoutOptions = {
  cart: Cart;
  deliveryMethods: Array<{
    id: 'pickup' | 'courier';
    title: string;
    price: number;
    freeFrom: number | null;
    pickupPoints: Array<{ id: string; title: string; address: string }>;
  }>;
  paymentMethods: Array<{ id: 'card' | 'cash_on_delivery'; title: string }>;
};

export type Sandbox = {
  settlementDelayMs: number;
  cards: Array<{
    id: string;
    title: string;
    maskedNumber: string;
    scenario: Exclude<Scenario, 'cancel'>;
  }>;
};

export type Session = {
  id: string;
  token: string;
  cart: Cart;
};

type ApiRequest = Omit<RequestOptions, 'token'> & { authenticated?: boolean };
type ApiState = { checkout: CheckoutState };

const requestBaseQuery: BaseQueryFn<
  ApiRequest,
  unknown,
  ApiFailure,
  object,
  ApiResponse<unknown>
> = async ({ authenticated = true, ...options }, api) => {
  const token = authenticated ? (api.getState() as ApiState).checkout.token : null;
  try {
    const response = await request({ ...options, token });
    return { data: response.data, meta: response };
  } catch (error) {
    return { error: error as ApiFailure };
  }
};

export const checkoutApi = createApi({
  reducerPath: 'checkoutApi',
  baseQuery: requestBaseQuery,
  tagTypes: ['Cart', 'Order', 'Payment'],
  endpoints: (build) => ({
    createSession: build.mutation<Session, void>({
      query: () => ({ method: 'POST', path: '/api/sessions', body: {}, authenticated: false }),
    }),
    getProducts: build.query<Product[], void>({
      query: () => ({ path: '/api/products', authenticated: false }),
    }),
    getSandbox: build.query<Sandbox, void>({
      query: () => ({ path: '/api/sandbox', authenticated: false }),
    }),
    getCart: build.query<Cart, void>({
      query: () => ({ path: '/api/cart' }),
      providesTags: ['Cart'],
    }),
    setCartItem: build.mutation<void, { productId: string; quantity: number }>({
      query: ({ productId, quantity }) => ({
        method: 'PUT',
        path: `/api/cart/items/${encodeURIComponent(productId)}`,
        body: { quantity },
      }),
      invalidatesTags: ['Cart'],
    }),
    removeCartItem: build.mutation<void, string>({
      query: (productId) => ({
        method: 'DELETE',
        path: `/api/cart/items/${encodeURIComponent(productId)}`,
      }),
      invalidatesTags: ['Cart'],
    }),
    getCheckoutOptions: build.query<CheckoutOptions, void>({
      query: () => ({ path: '/api/checkout/options' }),
      providesTags: ['Cart'],
    }),
    createQuote: build.mutation<Quote, { cartVersion: number; delivery: Delivery }>({
      query: (body) => ({ method: 'POST', path: '/api/quotes', body }),
    }),
    createOrder: build.mutation<Order, { body: CreateOrder; idempotencyKey: string }>({
      query: ({ body, idempotencyKey }) => ({
        method: 'POST',
        path: '/api/orders',
        body,
        idempotencyKey,
      }),
      invalidatesTags: ['Cart'],
    }),
    getOrder: build.query<Order, string>({
      query: (orderId) => ({ path: `/api/orders/${orderId}` }),
      providesTags: (_result, _error, orderId) => [{ type: 'Order', id: orderId }],
    }),
    createPayment: build.mutation<Payment, { orderId: string; idempotencyKey: string }>({
      query: ({ orderId, idempotencyKey }) => ({
        method: 'POST',
        path: `/api/orders/${orderId}/payments`,
        body: {},
        idempotencyKey,
      }),
    }),
    getPayment: build.query<Payment, string>({
      query: (paymentId) => ({ path: `/api/payments/${paymentId}` }),
      providesTags: (_result, _error, paymentId) => [{ type: 'Payment', id: paymentId }],
    }),
    listPayments: build.query<Payment[], string>({
      query: (orderId) => ({ path: `/api/orders/${orderId}/payments` }),
    }),
    simulatePayment: build.mutation<Simulation, { paymentId: string; scenario: Scenario }>({
      query: ({ paymentId, scenario }) => ({
        method: 'POST',
        path: `/api/payments/${paymentId}/simulations`,
        body: { scenario },
      }),
    }),
  }),
});

export const {
  useCreateOrderMutation,
  useCreatePaymentMutation,
  useCreateQuoteMutation,
  useCreateSessionMutation,
  useGetCartQuery,
  useGetCheckoutOptionsQuery,
  useGetOrderQuery,
  useGetPaymentQuery,
  useGetProductsQuery,
  useGetSandboxQuery,
  useLazyListPaymentsQuery,
  useRemoveCartItemMutation,
  useSetCartItemMutation,
  useSimulatePaymentMutation,
} = checkoutApi;
