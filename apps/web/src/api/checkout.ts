import type {
  Cart,
  CreateOrder,
  Customer,
  Delivery,
  Order,
  Payment,
  Product,
  Quote,
  Scenario,
} from '@checkout/contracts';
import { request } from './client';

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

export const createSession = () =>
  request<Session>({ method: 'POST', path: '/api/sessions', body: {} }).then((r) => r.data);

export const getProducts = () => request<Product[]>({ path: '/api/products' }).then((r) => r.data);

export const getSandbox = () => request<Sandbox>({ path: '/api/sandbox' }).then((r) => r.data);

export const getCart = (token: string) =>
  request<Cart>({ path: '/api/cart', token }).then((r) => r.data);

export const setCartItem = (token: string, productId: string, quantity: number) =>
  request({
    method: 'PUT',
    path: `/api/cart/items/${encodeURIComponent(productId)}`,
    token,
    body: { quantity },
  });

export const removeCartItem = (token: string, productId: string) =>
  request<void>({
    method: 'DELETE',
    path: `/api/cart/items/${encodeURIComponent(productId)}`,
    token,
  });

export const getCheckoutOptions = (token: string) =>
  request<CheckoutOptions>({ path: '/api/checkout/options', token }).then((r) => r.data);

export const createQuote = (token: string, cartVersion: number, delivery: Delivery) =>
  request<Quote>({
    method: 'POST',
    path: '/api/quotes',
    token,
    body: { cartVersion, delivery },
  }).then((r) => r.data);

export const createOrder = (token: string, body: CreateOrder, idempotencyKey: string) =>
  request<Order>({ method: 'POST', path: '/api/orders', token, body, idempotencyKey }).then(
    (r) => r.data,
  );

export const getOrder = (token: string, orderId: string, signal?: AbortSignal) =>
  request<Order>({ path: `/api/orders/${orderId}`, token, signal }).then((r) => r.data);

export const listOrders = (token: string) =>
  request<Order[]>({ path: '/api/orders', token }).then((r) => r.data);

export const createPayment = (token: string, orderId: string, idempotencyKey: string) =>
  request<Payment>({
    method: 'POST',
    path: `/api/orders/${orderId}/payments`,
    token,
    body: {},
    idempotencyKey,
  }).then((r) => r.data);

export const getPayment = (token: string, paymentId: string, signal?: AbortSignal) =>
  request<Payment>({ path: `/api/payments/${paymentId}`, token, signal }).then((r) => r.data);

export const listPayments = (token: string, orderId: string) =>
  request<Payment[]>({ path: `/api/orders/${orderId}/payments`, token }).then((r) => r.data);

export const simulatePayment = (token: string, paymentId: string, scenario: Scenario) =>
  request({
    method: 'POST',
    path: `/api/payments/${paymentId}/simulations`,
    token,
    body: { scenario },
  });

export const buildCreateOrderBody = (
  quoteId: string,
  customer: Customer,
  paymentMethod: CreateOrder['paymentMethod'],
): CreateOrder => ({ quoteId, customer, paymentMethod });
