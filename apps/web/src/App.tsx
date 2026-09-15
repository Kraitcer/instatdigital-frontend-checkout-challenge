import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Loader2,
  MapPin,
  Minus,
  PackageCheck,
  Plus,
  RefreshCw,
  ShoppingBag,
  Trash2,
  Truck,
  X,
} from 'lucide-react';
import type {
  Cart,
  Customer,
  Delivery,
  Order,
  Payment,
  Product,
  Quote,
  Scenario,
} from '@checkout/contracts';
import {
  buildCreateOrderBody,
  createOrder,
  createPayment,
  createQuote,
  createSession,
  getCart,
  getCheckoutOptions,
  getOrder,
  getPayment,
  getProducts,
  getSandbox,
  listPayments,
  removeCartItem,
  setCartItem,
  simulatePayment,
  type CheckoutOptions,
  type Sandbox,
} from './api/checkout';
import { type ApiFailure, toApiFailure } from './api/client';
import { formatDateTime, formatMoney } from './lib/format';
import {
  clearStoredOrder,
  newIdempotencyKey,
  readStoredCheckout,
  writeStoredCheckout,
} from './lib/storage';

type View = 'shop' | 'checkout' | 'success';
type LoadState = 'idle' | 'loading' | 'saving';
type DeliveryMode = 'pickup' | 'courier';
type FormErrors = Partial<Record<'name' | 'email' | 'phone' | 'city' | 'street' | 'house', string>>;
type CartItem = Cart['items'][number];

type CartIndex = {
  byProductId: Map<string, CartItem>;
  availableProducts: Product[];
  blockedProducts: Product[];
};

const emptyCustomer: Customer = { name: '', email: '', phone: '' };
const emptyAddress = { city: 'Учебный', street: '', house: '', apartment: '' };

const fieldLabels: Record<string, keyof FormErrors> = {
  'body/customer/name': 'name',
  'body/customer/email': 'email',
  'body/customer/phone': 'phone',
  'body/delivery/address/city': 'city',
  'body/delivery/address/street': 'street',
  'body/delivery/address/house': 'house',
};

const terminalPayment = new Set<Payment['status']>(['succeeded', 'failed', 'cancelled']);

function buildCartIndex(products: Product[], cart: Cart | null): CartIndex {
  const byProductId = new Map<string, CartItem>();
  if (cart) {
    for (let index = 0; index < cart.items.length; index += 1) {
      const item = cart.items[index];
      byProductId.set(item.productId, item);
    }
  }

  const availableProducts: Product[] = [];
  const blockedProducts: Product[] = [];
  for (let index = 0; index < products.length; index += 1) {
    const product = products[index];
    if (product.stock > 0) availableProducts.push(product);
    else blockedProducts.push(product);
  }

  return { byProductId, availableProducts, blockedProducts };
}

function deliveryFromForm(
  mode: DeliveryMode,
  pickupPointId: string,
  address: typeof emptyAddress,
): Delivery {
  if (mode === 'pickup') return { method: 'pickup', pickupPointId };
  const apartment = address.apartment.trim();
  return {
    method: 'courier',
    address: {
      city: address.city.trim(),
      street: address.street.trim(),
      house: address.house.trim(),
      ...(apartment ? { apartment } : {}),
    },
  };
}

function validateForm(
  customer: Customer,
  deliveryMode: DeliveryMode,
  address: typeof emptyAddress,
): FormErrors {
  const errors: FormErrors = {};
  if (customer.name.trim().length < 2) errors.name = 'Укажите имя от 2 символов.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email))
    errors.email = 'Укажите корректный email.';
  if (!/^\+[1-9]\d{9,14}$/.test(customer.phone)) errors.phone = 'Формат: +79990000000.';
  if (deliveryMode === 'courier') {
    if (address.city.trim().length < 2) errors.city = 'Укажите город.';
    if (address.street.trim().length < 2) errors.street = 'Укажите улицу.';
    if (!address.house.trim()) errors.house = 'Укажите дом.';
  }
  return errors;
}

function fieldErrorsFromApi(error: ApiFailure): FormErrors {
  const errors: FormErrors = {};
  for (let index = 0; index < error.fields.length; index += 1) {
    const field = fieldLabels[error.fields[index].path];
    if (field) errors[field] = 'Проверьте значение поля.';
  }
  return errors;
}

function ErrorPanel({ error, onRetry }: { error: ApiFailure | null; onRetry?: () => void }) {
  if (!error || error.kind === 'aborted') return null;
  return (
    <div className="notice notice-error" role="alert">
      <AlertCircle size={18} aria-hidden />
      <div>
        <strong>{error.message}</strong>
        <span>
          {error.code}
          {error.requestId ? ` · ${error.requestId}` : ''}
        </span>
      </div>
      {onRetry ? (
        <button className="ghost-button" type="button" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden />
          Повторить
        </button>
      ) : null}
    </div>
  );
}

function Field({
  id,
  label,
  value,
  error,
  type = 'text',
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  type?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        value={value}
        type={type}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <small id={`${id}-error`}>{error}</small> : null}
    </label>
  );
}

export function App() {
  const stored = useRef(readStoredCheckout());
  const pollingGeneration = useRef(0);
  const [token, setToken] = useState(stored.current.token);
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Cart | null>(null);
  const [options, setOptions] = useState<CheckoutOptions | null>(null);
  const [sandbox, setSandbox] = useState<Sandbox | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [payment, setPayment] = useState<Payment | null>(null);
  const [view, setView] = useState<View>(stored.current.orderId ? 'checkout' : 'shop');
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [error, setError] = useState<ApiFailure | null>(null);
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [customer, setCustomer] = useState<Customer>(emptyCustomer);
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('pickup');
  const [pickupPointId, setPickupPointId] = useState('point-center');
  const [address, setAddress] = useState(emptyAddress);
  const [paymentMethod, setPaymentMethod] = useState<'card' | 'cash_on_delivery'>('card');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [paymentRetryAfterMs, setPaymentRetryAfterMs] = useState<number | null>(null);

  const cartIndex = useMemo(() => buildCartIndex(products, cart), [products, cart]);
  const selectedCard =
    sandbox?.cards.find((card) => card.id === selectedCardId) ?? sandbox?.cards[0];
  const isBusy = loadState === 'loading' || loadState === 'saving';
  const canCheckout = Boolean(cart?.items.length) && !isBusy;
  const canPay = Boolean(
    order &&
    paymentMethod === 'card' &&
    selectedCard &&
    !isBusy &&
    payment?.status !== 'processing' &&
    payment?.status !== 'succeeded',
  );

  const rememberSession = (sessionToken: string, sessionId: string) => {
    setToken(sessionToken);
    writeStoredCheckout({ token: sessionToken, sessionId });
  };

  const loadInitial = async () => {
    setLoadState('loading');
    setError(null);
    try {
      const session = token ? null : await createSession();
      const sessionToken = token ?? session!.token;
      if (session) rememberSession(session.token, session.id);
      const [catalog, currentCart, checkoutOptions, cards] = await Promise.all([
        getProducts(),
        getCart(sessionToken),
        getCheckoutOptions(sessionToken),
        getSandbox(),
      ]);
      setProducts(catalog);
      setCart(currentCart);
      setOptions(checkoutOptions);
      setSandbox(cards);
      setSelectedCardId((current) => current ?? cards.cards[0]?.id ?? null);

      const savedOrderId = readStoredCheckout().orderId;
      const savedPaymentId = readStoredCheckout().paymentId;
      if (savedOrderId) {
        const restoredOrder = await getOrder(sessionToken, savedOrderId);
        setOrder(restoredOrder);
        setPaymentMethod(restoredOrder.paymentMethod);
        setView(
          restoredOrder.status === 'paid' || restoredOrder.paymentMethod === 'cash_on_delivery'
            ? 'success'
            : 'checkout',
        );
      }
      if (savedPaymentId) {
        const restoredPayment = await getPayment(sessionToken, savedPaymentId);
        setPayment(restoredPayment);
      } else if (savedOrderId) {
        const payments = await listPayments(sessionToken, savedOrderId);
        setPayment(payments[0] ?? null);
        if (payments[0]) writeStoredCheckout({ paymentId: payments[0].id });
      }
    } catch (caught) {
      setError(toApiFailure(caught));
    } finally {
      setLoadState('idle');
    }
  };

  useEffect(() => {
    void loadInitial();
  }, []);

  useEffect(() => {
    if (!token || payment?.status !== 'processing') return;
    const generation = ++pollingGeneration.current;
    const controller = new AbortController();
    let stopped = false;

    const tick = async () => {
      try {
        const nextPayment = await getPayment(token, payment.id, controller.signal);
        if (stopped || generation !== pollingGeneration.current) return;
        if (terminalPayment.has(nextPayment.status)) {
          const nextOrder = await getOrder(token, nextPayment.orderId, controller.signal);
          if (stopped || generation !== pollingGeneration.current) return;
          setPayment(nextPayment);
          setOrder(nextOrder);
          if (nextPayment.status === 'succeeded') setView('success');
          return;
        }
        setPayment(nextPayment);
        window.setTimeout(tick, 800);
      } catch (caught) {
        const failure = toApiFailure(caught);
        if (!stopped && failure.kind !== 'aborted') setError(failure);
      }
    };

    const timeout = window.setTimeout(tick, paymentRetryAfterMs ?? 800);
    return () => {
      stopped = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [token, payment?.id, payment?.status, paymentRetryAfterMs]);

  useEffect(() => {
    if (!token || !payment || !terminalPayment.has(payment.status)) return;
    const generation = ++pollingGeneration.current;
    const controller = new AbortController();

    const loadFinalOrder = async () => {
      try {
        const nextOrder = await getOrder(token, payment.orderId, controller.signal);
        if (generation !== pollingGeneration.current) return;
        setOrder(nextOrder);
        if (nextOrder.status === 'paid' || nextOrder.paymentMethod === 'cash_on_delivery') {
          setView('success');
        }
      } catch (caught) {
        const failure = toApiFailure(caught);
        if (failure.kind !== 'aborted') setError(failure);
      }
    };

    void loadFinalOrder();
    return () => controller.abort();
  }, [token, payment?.id, payment?.status]);

  const refreshCart = async (sessionToken = token, clearQuote = true) => {
    if (!sessionToken) return;
    const [nextCart, nextOptions] = await Promise.all([
      getCart(sessionToken),
      getCheckoutOptions(sessionToken),
    ]);
    setCart(nextCart);
    setOptions(nextOptions);
    if (clearQuote) setQuote(null);
  };

  const updateQuantity = async (productId: string, quantity: number) => {
    if (!token || quantity < 1) return;
    setPendingProductId(productId);
    setError(null);
    try {
      await setCartItem(token, productId, quantity);
      clearStoredOrder();
      setOrder(null);
      setPayment(null);
      await refreshCart();
    } catch (caught) {
      setError(toApiFailure(caught));
    } finally {
      setPendingProductId(null);
    }
  };

  const removeItem = async (productId: string) => {
    if (!token) return;
    setPendingProductId(productId);
    setError(null);
    try {
      await removeCartItem(token, productId);
      clearStoredOrder();
      setOrder(null);
      setPayment(null);
      await refreshCart();
    } catch (caught) {
      setError(toApiFailure(caught));
    } finally {
      setPendingProductId(null);
    }
  };

  const calculateQuote = async () => {
    if (!token || !cart) return null;
    setError(null);
    const delivery = deliveryFromForm(deliveryMode, pickupPointId, address);
    try {
      const nextQuote = await createQuote(token, cart.version, delivery);
      setQuote(nextQuote);
      return nextQuote;
    } catch (caught) {
      const failure = toApiFailure(caught);
      setError(failure);
      if (
        failure.code === 'CART_VERSION_CONFLICT' ||
        failure.code === 'QUOTE_EXPIRED' ||
        failure.code === 'CART_EMPTY'
      ) {
        await refreshCart();
      }
      return null;
    }
  };

  const changeDeliveryMode = (mode: DeliveryMode) => {
    setDeliveryMode(mode);
    setQuote(null);
  };

  const changePickupPoint = (nextPickupPointId: string) => {
    setPickupPointId(nextPickupPointId);
    setQuote(null);
  };

  const changeAddress = (field: keyof typeof emptyAddress, value: string) => {
    setAddress((current) => ({ ...current, [field]: value }));
    setQuote(null);
  };

  const startCheckout = async () => {
    if (!canCheckout) return;
    setLoadState('saving');
    try {
      await calculateQuote();
      setView('checkout');
    } finally {
      setLoadState('idle');
    }
  };

  const submitOrder = async (event?: FormEvent<HTMLFormElement>) => {
    event?.preventDefault();
    if (!token || !cart?.items.length) return;
    const errors = validateForm(customer, deliveryMode, address);
    setFormErrors(errors);
    if (Object.keys(errors).length) return;
    setLoadState('saving');
    setError(null);
    try {
      const activeQuote = quote ?? (await calculateQuote());
      if (!activeQuote) return;
      const body = buildCreateOrderBody(activeQuote.id, customer, paymentMethod);
      const storedState = readStoredCheckout();
      const key = storedState.orderKey ?? newIdempotencyKey();
      writeStoredCheckout({ orderKey: key });
      const nextOrder = await createOrder(token, body, key);
      setOrder(nextOrder);
      writeStoredCheckout({ orderId: nextOrder.id, paymentId: null, paymentKey: null });
      await refreshCart(token, false);
      if (nextOrder.paymentMethod === 'cash_on_delivery') {
        setView('success');
      }
    } catch (caught) {
      const failure = toApiFailure(caught);
      setError(failure);
      setFormErrors((current) => ({ ...current, ...fieldErrorsFromApi(failure) }));
      if (failure.code === 'CART_VERSION_CONFLICT' || failure.code === 'QUOTE_EXPIRED')
        await refreshCart();
    } finally {
      setLoadState('idle');
    }
  };

  const submitPaymentScenario = async (scenario: Scenario) => {
    if (!token || !order || !canPay) return;
    setLoadState('saving');
    setError(null);
    try {
      const storedState = readStoredCheckout();
      const key =
        payment && terminalPayment.has(payment.status)
          ? newIdempotencyKey()
          : (storedState.paymentKey ?? newIdempotencyKey());
      writeStoredCheckout({ paymentKey: key });
      const nextPayment =
        payment && !terminalPayment.has(payment.status)
          ? payment
          : await createPayment(token, order.id, key);
      setPayment(nextPayment);
      writeStoredCheckout({ paymentId: nextPayment.id });
      const response = await simulatePayment(token, nextPayment.id, scenario);
      setPaymentRetryAfterMs(response.retryAfterMs ?? null);
      const paymentAfterSimulation = await getPayment(token, nextPayment.id);
      setPayment(paymentAfterSimulation);
      if (
        response.status === 200 ||
        response.status === 201 ||
        terminalPayment.has(paymentAfterSimulation.status)
      ) {
        const nextOrder = await getOrder(token, order.id);
        setOrder(nextOrder);
        if (nextOrder.status === 'paid') setView('success');
      }
    } catch (caught) {
      const failure = toApiFailure(caught);
      setError(failure);
      if (failure.code === 'PAYMENT_IN_PROGRESS' && token && order) {
        const payments = await listPayments(token, order.id);
        setPayment(payments[0] ?? null);
        if (payments[0]) writeStoredCheckout({ paymentId: payments[0].id });
      }
    } finally {
      setLoadState('idle');
    }
  };

  const startPayment = () => {
    if (!selectedCard) return;
    return submitPaymentScenario(selectedCard.scenario);
  };

  const cancelPayment = () => submitPaymentScenario('cancel');

  const resetOrder = () => {
    clearStoredOrder();
    setOrder(null);
    setPayment(null);
    setQuote(null);
    setView('shop');
  };

  const renderPaymentStatus = () => {
    if (!payment) return null;
    const text =
      payment.status === 'processing'
        ? 'Платёж обрабатывается'
        : payment.status === 'failed'
          ? 'Банк отказал в оплате. Можно повторить этот же заказ.'
          : payment.status === 'cancelled'
            ? 'Оплата отменена. Заказ сохранён, можно попробовать снова.'
            : payment.status === 'succeeded'
              ? 'Оплата подтверждена сервером.'
              : 'Попытка оплаты создана.';
    return (
      <div className={`notice ${payment.status === 'failed' ? 'notice-error' : 'notice-info'}`}>
        {payment.status === 'processing' ? (
          <Loader2 className="spin" size={18} aria-hidden />
        ) : (
          <CreditCard size={18} aria-hidden />
        )}
        <div>
          <strong>{text}</strong>
          <span>
            {payment.failureCode ? `Код: ${payment.failureCode}` : `Статус: ${payment.status}`}
          </span>
        </div>
      </div>
    );
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Учебный магазин</p>
          <h1>Оформление заказа</h1>
        </div>
        <div className="cart-pill" aria-live="polite">
          <ShoppingBag size={18} aria-hidden />
          {cart ? `${cart.quantity} шт. · ${formatMoney(cart.subtotal)}` : 'Корзина загружается'}
        </div>
      </header>

      <ErrorPanel error={error} onRetry={loadInitial} />

      {loadState === 'loading' ? (
        <section className="center-state">
          <Loader2 className="spin" size={28} aria-hidden />
          <p>Загружаем каталог и сессию</p>
        </section>
      ) : null}

      {view === 'shop' && loadState !== 'loading' ? (
        <div className="layout">
          <section className="panel catalog-panel" aria-labelledby="catalog-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Каталог</p>
                <h2 id="catalog-title">Товары</h2>
              </div>
            </div>
            <div className="product-grid">
              {cartIndex.availableProducts.map((product) => {
                const item = cartIndex.byProductId.get(product.id);
                const pending = pendingProductId === product.id;
                return (
                  <article className="product-card" key={product.id}>
                    <div>
                      <span className="sku">{product.sku}</span>
                      <h3>{product.title}</h3>
                      <p>{product.description}</p>
                    </div>
                    <div className="product-bottom">
                      <strong>{formatMoney(product.price)}</strong>
                      <span>{`Доступно ${product.stock}`}</span>
                    </div>
                    {item ? (
                      <div className="quantity-control" aria-label={`Количество ${product.title}`}>
                        <button
                          type="button"
                          aria-label={`Уменьшить количество ${product.title}`}
                          disabled={pending}
                          onClick={() => updateQuantity(product.id, item.quantity - 1)}
                        >
                          <Minus size={16} aria-hidden />
                        </button>
                        <output>{item.quantity}</output>
                        <button
                          type="button"
                          aria-label={`Увеличить количество ${product.title}`}
                          disabled={pending || item.quantity >= product.stock}
                          onClick={() => updateQuantity(product.id, item.quantity + 1)}
                        >
                          <Plus size={16} aria-hidden />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="primary-button"
                        type="button"
                        disabled={pending}
                        onClick={() => updateQuantity(product.id, 1)}
                      >
                        {pending ? (
                          <Loader2 className="spin" size={16} aria-hidden />
                        ) : (
                          <Plus size={16} aria-hidden />
                        )}
                        Добавить
                      </button>
                    )}
                  </article>
                );
              })}
              {cartIndex.blockedProducts.map((product) => {
                const item = cartIndex.byProductId.get(product.id);
                const pending = pendingProductId === product.id;
                return (
                  <article className="product-card" key={product.id}>
                    <div>
                      <span className="sku">{product.sku}</span>
                      <h3>{product.title}</h3>
                      <p>{product.description}</p>
                    </div>
                    <div className="product-bottom">
                      <strong>{formatMoney(product.price)}</strong>
                      <span>
                        {product.stock > 0 ? `Доступно ${product.stock}` : 'Нет в наличии'}
                      </span>
                    </div>
                    {item ? (
                      <div className="quantity-control" aria-label={`Количество ${product.title}`}>
                        <button
                          type="button"
                          aria-label={`Уменьшить количество ${product.title}`}
                          disabled={pending}
                          onClick={() => updateQuantity(product.id, item.quantity - 1)}
                        >
                          <Minus size={16} aria-hidden />
                        </button>
                        <output>{item.quantity}</output>
                        <button
                          type="button"
                          aria-label={`Увеличить количество ${product.title}`}
                          disabled={pending || item.quantity >= product.stock}
                          onClick={() => updateQuantity(product.id, item.quantity + 1)}
                        >
                          <Plus size={16} aria-hidden />
                        </button>
                      </div>
                    ) : (
                      <button
                        className="primary-button"
                        type="button"
                        disabled={product.stock === 0 || pending}
                        onClick={() => updateQuantity(product.id, 1)}
                      >
                        {pending ? (
                          <Loader2 className="spin" size={16} aria-hidden />
                        ) : (
                          <Plus size={16} aria-hidden />
                        )}
                        Добавить
                      </button>
                    )}
                  </article>
                );
              })}
            </div>
          </section>

          <aside className="panel cart-panel" aria-labelledby="cart-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Корзина</p>
                <h2 id="cart-title">Состав</h2>
              </div>
              {cart?.items.length ? <span className="muted">v{cart.version}</span> : null}
            </div>
            {!cart?.items.length ? (
              <div className="empty-state">
                <ShoppingBag size={28} aria-hidden />
                <p>Корзина пуста. Добавьте доступный товар, чтобы перейти к оформлению.</p>
              </div>
            ) : (
              <>
                <div className="cart-list">
                  {cart.items.map((item) => (
                    <div className="cart-row" key={item.productId}>
                      <div>
                        <strong>{item.title}</strong>
                        <span>
                          {item.quantity} × {formatMoney(item.unitPrice)}
                        </span>
                      </div>
                      <div>
                        <strong>{formatMoney(item.lineTotal)}</strong>
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`Удалить ${item.title}`}
                          onClick={() => removeItem(item.productId)}
                        >
                          <Trash2 size={16} aria-hidden />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="total-line">
                  <span>Итого</span>
                  <strong>{formatMoney(cart.subtotal)}</strong>
                </div>
                <button
                  className="checkout-button"
                  type="button"
                  disabled={!canCheckout}
                  onClick={startCheckout}
                >
                  Перейти к оформлению
                </button>
              </>
            )}
          </aside>
        </div>
      ) : null}

      {view === 'checkout' && loadState !== 'loading' ? (
        <div className="layout checkout-layout">
          <form
            className="panel form-panel"
            aria-labelledby="checkout-title"
            onSubmit={submitOrder}
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Оформление</p>
                <h2 id="checkout-title">Контакты и доставка</h2>
              </div>
            </div>
            <div className="form-grid">
              <Field
                id="name"
                label="Имя"
                value={customer.name}
                error={formErrors.name}
                onChange={(name) => setCustomer((current) => ({ ...current, name }))}
              />
              <Field
                id="email"
                label="Email"
                type="email"
                value={customer.email}
                error={formErrors.email}
                onChange={(email) => setCustomer((current) => ({ ...current, email }))}
                placeholder="buyer@example.test"
              />
              <Field
                id="phone"
                label="Телефон"
                type="tel"
                value={customer.phone}
                error={formErrors.phone}
                onChange={(phone) => setCustomer((current) => ({ ...current, phone }))}
                placeholder="+79990000000"
              />
            </div>

            <div className="radio-grid" role="radiogroup" aria-label="Способ доставки">
              <button
                className={deliveryMode === 'pickup' ? 'choice active' : 'choice'}
                type="button"
                role="radio"
                aria-checked={deliveryMode === 'pickup'}
                onClick={() => changeDeliveryMode('pickup')}
              >
                <MapPin size={18} aria-hidden />
                Самовывоз
              </button>
              <button
                className={deliveryMode === 'courier' ? 'choice active' : 'choice'}
                type="button"
                role="radio"
                aria-checked={deliveryMode === 'courier'}
                onClick={() => changeDeliveryMode('courier')}
              >
                <Truck size={18} aria-hidden />
                Курьер
              </button>
            </div>

            {deliveryMode === 'pickup' ? (
              <label className="field" htmlFor="pickup">
                <span>Пункт выдачи</span>
                <select
                  id="pickup"
                  value={pickupPointId}
                  onChange={(event) => changePickupPoint(event.target.value)}
                >
                  {options?.deliveryMethods
                    .find((method) => method.id === 'pickup')
                    ?.pickupPoints.map((point) => (
                      <option value={point.id} key={point.id}>
                        {point.title} · {point.address}
                      </option>
                    ))}
                </select>
              </label>
            ) : (
              <div className="form-grid">
                <Field
                  id="city"
                  label="Город"
                  value={address.city}
                  error={formErrors.city}
                  onChange={(city) => changeAddress('city', city)}
                />
                <Field
                  id="street"
                  label="Улица"
                  value={address.street}
                  error={formErrors.street}
                  onChange={(street) => changeAddress('street', street)}
                />
                <Field
                  id="house"
                  label="Дом"
                  value={address.house}
                  error={formErrors.house}
                  onChange={(house) => changeAddress('house', house)}
                />
                <Field
                  id="apartment"
                  label="Квартира"
                  value={address.apartment}
                  onChange={(apartment) => changeAddress('apartment', apartment)}
                />
              </div>
            )}

            <div className="radio-grid" role="radiogroup" aria-label="Способ оплаты">
              <button
                className={paymentMethod === 'card' ? 'choice active' : 'choice'}
                type="button"
                role="radio"
                aria-checked={paymentMethod === 'card'}
                onClick={() => setPaymentMethod('card')}
              >
                <CreditCard size={18} aria-hidden />
                Картой онлайн
              </button>
              <button
                className={paymentMethod === 'cash_on_delivery' ? 'choice active' : 'choice'}
                type="button"
                role="radio"
                aria-checked={paymentMethod === 'cash_on_delivery'}
                onClick={() => setPaymentMethod('cash_on_delivery')}
              >
                <PackageCheck size={18} aria-hidden />
                При получении
              </button>
            </div>

            <div className="actions-row">
              <button className="ghost-button" type="button" onClick={() => setView('shop')}>
                Вернуться в корзину
              </button>
              <button
                className="primary-button"
                type="submit"
                disabled={isBusy || !cart?.items.length}
              >
                {loadState === 'saving' ? <Loader2 className="spin" size={16} aria-hidden /> : null}
                {order ? 'Обновить заказ' : 'Создать заказ'}
              </button>
            </div>
          </form>

          <aside className="panel summary-panel" aria-labelledby="summary-title">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Расчёт</p>
                <h2 id="summary-title">Суммы</h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Обновить расчёт"
                onClick={calculateQuote}
                disabled={!cart?.items.length}
              >
                <RefreshCw size={16} aria-hidden />
              </button>
            </div>
            {quote ? (
              <div className="summary-lines">
                <div>
                  <span>Товары</span>
                  <strong>{formatMoney(quote.subtotal)}</strong>
                </div>
                <div>
                  <span>Доставка</span>
                  <strong>{formatMoney(quote.shipping)}</strong>
                </div>
                <div className="grand">
                  <span>К оплате</span>
                  <strong>{formatMoney(quote.total)}</strong>
                </div>
                <small>Расчёт действует до {formatDateTime(quote.expiresAt)}</small>
              </div>
            ) : (
              <p className="muted">
                Нажмите «Обновить расчёт» или создайте заказ, чтобы получить сумму от сервера.
              </p>
            )}

            {order && paymentMethod === 'card' ? (
              <div className="payment-box">
                <h3>Тестовая оплата</h3>
                <label className="field" htmlFor="card">
                  <span>Тестовая карта</span>
                  <select
                    id="card"
                    value={selectedCard?.id ?? ''}
                    onChange={(event) => setSelectedCardId(event.target.value)}
                  >
                    {sandbox?.cards.map((card) => (
                      <option value={card.id} key={card.id}>
                        {card.title} · {card.maskedNumber}
                      </option>
                    ))}
                  </select>
                </label>
                {renderPaymentStatus()}
                <div className="actions-row compact">
                  <button
                    className="ghost-button"
                    type="button"
                    disabled={
                      isBusy ||
                      payment?.status === 'processing' ||
                      Boolean(payment && terminalPayment.has(payment.status))
                    }
                    onClick={cancelPayment}
                  >
                    <X size={16} aria-hidden />
                    Отменить
                  </button>
                  <button
                    className="checkout-button"
                    type="button"
                    disabled={!canPay || payment?.status === 'processing'}
                    onClick={startPayment}
                  >
                    {loadState === 'saving' ? (
                      <Loader2 className="spin" size={16} aria-hidden />
                    ) : (
                      <CreditCard size={16} aria-hidden />
                    )}
                    Оплатить
                  </button>
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {view === 'success' && order ? (
        <section className="panel success-panel" aria-labelledby="success-title">
          <CheckCircle2 size={40} aria-hidden />
          <p className="eyebrow">Заказ {order.number}</p>
          <h2 id="success-title">
            {order.paymentMethod === 'cash_on_delivery'
              ? 'Заказ оформлен, оплата при получении'
              : 'Оплата подтверждена'}
          </h2>
          <div className="cart-list success-list">
            {order.items.map((item) => (
              <div className="cart-row" key={item.productId}>
                <div>
                  <strong>{item.title}</strong>
                  <span>
                    {item.quantity} × {formatMoney(item.unitPrice)}
                  </span>
                </div>
                <strong>{formatMoney(item.lineTotal)}</strong>
              </div>
            ))}
          </div>
          <div className="summary-lines success-summary">
            <div>
              <span>Доставка</span>
              <strong>{order.delivery.method === 'pickup' ? 'Самовывоз' : 'Курьер'}</strong>
            </div>
            <div>
              <span>Стоимость доставки</span>
              <strong>{formatMoney(order.shipping)}</strong>
            </div>
            <div className="grand">
              <span>Итого</span>
              <strong>{formatMoney(order.total)}</strong>
            </div>
          </div>
          <button className="primary-button" type="button" onClick={resetOrder}>
            Вернуться в магазин
          </button>
        </section>
      ) : null}
    </main>
  );
}
