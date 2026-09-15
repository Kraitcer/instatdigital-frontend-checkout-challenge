export type StoredCheckout = {
  token: string | null;
  sessionId: string | null;
  orderId: string | null;
  paymentId: string | null;
  orderKey: string | null;
  paymentKey: string | null;
};

const key = 'checkout-demo-state';

const empty: StoredCheckout = {
  token: null,
  sessionId: null,
  orderId: null,
  paymentId: null,
  orderKey: null,
  paymentKey: null,
};

export const readStoredCheckout = (): StoredCheckout => {
  const raw = localStorage.getItem(key);
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredCheckout>;
    return { ...empty, ...parsed };
  } catch {
    return empty;
  }
};

export const writeStoredCheckout = (patch: Partial<StoredCheckout>) => {
  const next = { ...readStoredCheckout(), ...patch };
  localStorage.setItem(key, JSON.stringify(next));
  return next;
};

export const clearStoredOrder = () =>
  writeStoredCheckout({ orderId: null, paymentId: null, orderKey: null, paymentKey: null });

export const newIdempotencyKey = () => crypto.randomUUID();
