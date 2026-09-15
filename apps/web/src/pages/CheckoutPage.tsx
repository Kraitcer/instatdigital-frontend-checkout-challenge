import { useEffect, useEffectEvent } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { CreditCard, Loader2, MapPin, PackageCheck, RefreshCw, Truck } from 'lucide-react';
import { useForm, useWatch, type FieldPath } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router-dom';
import type { CreateOrder } from '@checkout/contracts';
import {
  useCreateOrderMutation,
  useCreateQuoteMutation,
  useGetCartQuery,
  useGetCheckoutOptionsQuery,
  useGetOrderQuery,
} from '../api/checkoutApi';
import { ErrorPanel, asApiFailure } from '../components/ErrorPanel';
import { Field } from '../components/Field';
import { LoadingState } from '../components/LoadingState';
import { PaymentPanel } from '../components/PaymentPanel';
import {
  checkoutSchema,
  deliveryFromForm,
  formFieldsFromApi,
  newIdempotencyKey,
} from '../lib/checkout';
import { formatDateTime, formatMoney } from '../lib/format';
import {
  formChanged,
  orderReceived,
  orderRequestStarted,
  type CheckoutFormState,
} from '../store/checkoutSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

export function CheckoutPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const stored = useAppSelector((state) => state.checkout);
  const cartState = useGetCartQuery();
  const optionsState = useGetCheckoutOptionsQuery();
  const orderState = useGetOrderQuery(stored.orderId ?? '', { skip: !stored.orderId });
  const [createQuote, quoteState] = useCreateQuoteMutation();
  const [createOrder, createOrderState] = useCreateOrderMutation();
  const resetQuote = useEffectEvent(quoteState.reset);
  const {
    register,
    control,
    getValues,
    handleSubmit,
    setError,
    watch,
    formState: { errors },
  } = useForm<CheckoutFormState>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: stored.form,
    mode: 'onBlur',
  });
  const deliveryMode = useWatch({ control, name: 'deliveryMode' });
  const paymentMethod = useWatch({ control, name: 'paymentMethod' });
  const pickupPointId = useWatch({ control, name: 'pickupPointId' });
  const address = useWatch({ control, name: 'address' });
  const order = orderState.data;
  const error =
    cartState.error ??
    optionsState.error ??
    quoteState.error ??
    createOrderState.error ??
    orderState.error;

  useEffect(() => {
    const subscription = watch((values) => dispatch(formChanged(values as CheckoutFormState)));
    return () => subscription.unsubscribe();
  }, [dispatch, watch]);

  useEffect(() => {
    if (!cartState.data?.items.length || order) return;
    const values = getValues();
    if (
      values.deliveryMode === 'courier' &&
      (values.address.city.trim().length < 2 ||
        values.address.street.trim().length < 2 ||
        !values.address.house.trim())
    ) {
      resetQuote();
      return;
    }
    const timeout = window.setTimeout(() => {
      void createQuote({
        cartVersion: cartState.data!.version,
        delivery: deliveryFromForm(values),
      });
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [address, cartState.data, createQuote, deliveryMode, getValues, order, pickupPointId]);

  useEffect(() => {
    if (order?.paymentMethod === 'cash_on_delivery') navigate('/success', { replace: true });
  }, [navigate, order]);

  const submitOrder = handleSubmit(async (values) => {
    if (!cartState.data?.items.length) return;
    try {
      const quote = await createQuote({
        cartVersion: cartState.data.version,
        delivery: deliveryFromForm(values),
      }).unwrap();
      const key = stored.orderKey ?? newIdempotencyKey();
      dispatch(orderRequestStarted(key));
      const body: CreateOrder = {
        quoteId: quote.id,
        customer: values.customer,
        paymentMethod: values.paymentMethod,
      };
      const nextOrder = await createOrder({ body, idempotencyKey: key }).unwrap();
      dispatch(orderReceived(nextOrder.id));
      if (nextOrder.paymentMethod === 'cash_on_delivery') navigate('/success');
    } catch (caught) {
      const failure = asApiFailure(caught);
      if (failure) {
        const fields = formFieldsFromApi(failure);
        for (let index = 0; index < fields.length; index += 1) {
          const field = fields[index];
          setError(field.name as FieldPath<CheckoutFormState>, { message: field.message });
        }
        if (failure.code === 'CART_VERSION_CONFLICT' || failure.code === 'QUOTE_EXPIRED') {
          void cartState.refetch();
        }
      }
    }
  });

  if (cartState.isLoading || optionsState.isLoading || (stored.orderId && orderState.isLoading)) {
    return <LoadingState>Загружаем оформление</LoadingState>;
  }
  if (!cartState.data?.items.length && !stored.orderId) return <Navigate to="/" replace />;

  return (
    <>
      <ErrorPanel error={error} onRetry={() => void cartState.refetch()} />
      <div className="layout checkout-layout">
        <form className="panel form-panel" aria-labelledby="checkout-title" onSubmit={submitOrder}>
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
              registration={register('customer.name')}
              error={errors.customer?.name?.message}
            />
            <Field
              id="email"
              label="Email"
              type="email"
              placeholder="buyer@example.test"
              registration={register('customer.email')}
              error={errors.customer?.email?.message}
            />
            <Field
              id="phone"
              label="Телефон"
              type="tel"
              placeholder="+79990000000"
              registration={register('customer.phone')}
              error={errors.customer?.phone?.message}
            />
          </div>
          <div className="radio-grid" role="radiogroup" aria-label="Способ доставки">
            <label className={deliveryMode === 'pickup' ? 'choice active' : 'choice'}>
              <input
                className="visually-hidden"
                type="radio"
                value="pickup"
                {...register('deliveryMode')}
              />
              <MapPin size={18} aria-hidden /> Самовывоз
            </label>
            <label className={deliveryMode === 'courier' ? 'choice active' : 'choice'}>
              <input
                className="visually-hidden"
                type="radio"
                value="courier"
                {...register('deliveryMode')}
              />
              <Truck size={18} aria-hidden /> Курьер
            </label>
          </div>
          {deliveryMode === 'pickup' ? (
            <label className="field" htmlFor="pickup">
              <span>Пункт выдачи</span>
              <select id="pickup" {...register('pickupPointId')}>
                {optionsState.data?.deliveryMethods
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
                registration={register('address.city')}
                error={errors.address?.city?.message}
              />
              <Field
                id="street"
                label="Улица"
                registration={register('address.street')}
                error={errors.address?.street?.message}
              />
              <Field
                id="house"
                label="Дом"
                registration={register('address.house')}
                error={errors.address?.house?.message}
              />
              <Field
                id="apartment"
                label="Квартира"
                registration={register('address.apartment')}
                error={errors.address?.apartment?.message}
              />
            </div>
          )}
          <div className="radio-grid" role="radiogroup" aria-label="Способ оплаты">
            <label className={paymentMethod === 'card' ? 'choice active' : 'choice'}>
              <input
                className="visually-hidden"
                type="radio"
                value="card"
                {...register('paymentMethod')}
              />
              <CreditCard size={18} aria-hidden /> Картой онлайн
            </label>
            <label className={paymentMethod === 'cash_on_delivery' ? 'choice active' : 'choice'}>
              <input
                className="visually-hidden"
                type="radio"
                value="cash_on_delivery"
                {...register('paymentMethod')}
              />
              <PackageCheck size={18} aria-hidden /> При получении
            </label>
          </div>
          <div className="actions-row">
            <button className="ghost-button" type="button" onClick={() => navigate('/')}>
              Вернуться в корзину
            </button>
            {!order ? (
              <button
                className="primary-button"
                type="submit"
                disabled={createOrderState.isLoading || quoteState.isLoading}
              >
                {createOrderState.isLoading ? (
                  <Loader2 className="spin" size={16} aria-hidden />
                ) : null}
                Создать заказ
              </button>
            ) : null}
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
              disabled={!cartState.data?.items.length || Boolean(order)}
              onClick={() => {
                const values = getValues();
                if (cartState.data)
                  void createQuote({
                    cartVersion: cartState.data.version,
                    delivery: deliveryFromForm(values),
                  });
              }}
            >
              <RefreshCw size={16} aria-hidden />
            </button>
          </div>
          {quoteState.data ? (
            <div className="summary-lines">
              <div>
                <span>Товары</span>
                <strong>{formatMoney(quoteState.data.subtotal)}</strong>
              </div>
              <div>
                <span>Доставка</span>
                <strong>{formatMoney(quoteState.data.shipping)}</strong>
              </div>
              <div className="grand">
                <span>К оплате</span>
                <strong>{formatMoney(quoteState.data.total)}</strong>
              </div>
              <small>Расчёт действует до {formatDateTime(quoteState.data.expiresAt)}</small>
            </div>
          ) : (
            <p className="muted">Заполните доставку, чтобы получить сумму от сервера.</p>
          )}
          {order?.paymentMethod === 'card' ? (
            <PaymentPanel
              order={order}
              onPaymentSettled={async () => {
                const result = await orderState.refetch();
                if (result.data?.status === 'paid') navigate('/success');
              }}
            />
          ) : null}
        </aside>
      </div>
    </>
  );
}
