import { useEffect, useEffectEvent, useRef } from 'react';
import { CreditCard, Loader2, X } from 'lucide-react';
import type { Order, Payment, Scenario } from '@checkout/contracts';
import {
  checkoutApi,
  useCreatePaymentMutation,
  useGetPaymentQuery,
  useGetSandboxQuery,
  useLazyListPaymentsQuery,
  useSimulatePaymentMutation,
} from '../api/checkoutApi';
import { newIdempotencyKey } from '../lib/checkout';
import { cardSelected, paymentReceived, paymentRequestStarted } from '../store/checkoutSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';
import { ErrorPanel } from './ErrorPanel';

const terminalPayment = new Set<Payment['status']>(['succeeded', 'failed', 'cancelled']);

const paymentMessage = (payment: Payment) => {
  if (payment.status === 'processing') return 'Платёж обрабатывается';
  if (payment.status === 'failed') return 'Банк отказал в оплате. Можно повторить этот же заказ.';
  if (payment.status === 'cancelled')
    return 'Попытка оплаты отменена. Заказ сохранён, можно попробовать снова.';
  if (payment.status === 'succeeded') return 'Оплата подтверждена сервером.';
  return 'Попытка оплаты создана.';
};

type PaymentPanelProps = {
  order: Order;
  onPaymentSettled: () => Promise<void>;
  onPaymentCancelled: () => Promise<void>;
};

export function PaymentPanel({ order, onPaymentSettled, onPaymentCancelled }: PaymentPanelProps) {
  const dispatch = useAppDispatch();
  const paymentRequestInFlight = useRef(false);
  const { paymentId, paymentKey, form } = useAppSelector((state) => state.checkout);
  const cachedPayment = useAppSelector((state) =>
    paymentId ? checkoutApi.endpoints.getPayment.select(paymentId)(state).data : undefined,
  );
  const sandboxState = useGetSandboxQuery();
  const paymentState = useGetPaymentQuery(paymentId ?? '', {
    skip: !paymentId,
    pollingInterval:
      paymentId && (!cachedPayment || !terminalPayment.has(cachedPayment.status)) ? 800 : 0,
  });
  const [loadPayments] = useLazyListPaymentsQuery();
  const [createPayment, createState] = useCreatePaymentMutation();
  const [simulatePayment, simulationState] = useSimulatePaymentMutation();
  const payment = paymentState.data;
  const selectedCard =
    sandboxState.data?.cards.find((card) => card.id === form.selectedCardId) ??
    sandboxState.data?.cards[0];
  const busy = createState.isLoading || simulationState.isLoading;
  const error =
    sandboxState.error ?? paymentState.error ?? createState.error ?? simulationState.error;
  const notifyPaymentSettled = useEffectEvent(onPaymentSettled);

  useEffect(() => {
    if (!form.selectedCardId && sandboxState.data?.cards[0]) {
      dispatch(cardSelected(sandboxState.data.cards[0].id));
    }
  }, [dispatch, form.selectedCardId, sandboxState.data]);

  useEffect(() => {
    if (paymentId) return;
    void loadPayments(order.id)
      .unwrap()
      .then((payments) => {
        if (payments[0]) dispatch(paymentReceived(payments[0].id));
      })
      .catch(() => undefined);
  }, [dispatch, loadPayments, order.id, paymentId]);

  useEffect(() => {
    if (!payment || !terminalPayment.has(payment.status)) return;
    void notifyPaymentSettled();
  }, [payment]);

  const submitScenario = async (scenario: Scenario) => {
    if (paymentRequestInFlight.current) return;
    paymentRequestInFlight.current = true;
    try {
      let activePayment = payment;
      if (!activePayment || terminalPayment.has(activePayment.status)) {
        const key = activePayment ? newIdempotencyKey() : (paymentKey ?? newIdempotencyKey());
        dispatch(paymentRequestStarted(key));
        activePayment = await createPayment({ orderId: order.id, idempotencyKey: key }).unwrap();
        dispatch(paymentReceived(activePayment.id));
      }
      await simulatePayment({ paymentId: activePayment.id, scenario }).unwrap();
      dispatch(checkoutApi.util.invalidateTags(['Payment', 'Order']));
      if (scenario === 'cancel') await onPaymentCancelled();
    } catch (caught) {
      const failure = caught as { code?: string };
      if (failure.code === 'PAYMENT_IN_PROGRESS') {
        const payments = await loadPayments(order.id)
          .unwrap()
          .catch(() => []);
        if (payments[0]) dispatch(paymentReceived(payments[0].id));
      }
    } finally {
      paymentRequestInFlight.current = false;
    }
  };

  return (
    <div className="payment-box">
      <h3>Тестовая оплата</h3>
      <label className="field" htmlFor="card">
        <span>Тестовая карта</span>
        <select
          id="card"
          value={selectedCard?.id ?? ''}
          onChange={(event) => dispatch(cardSelected(event.target.value))}
        >
          {sandboxState.data?.cards.map((card) => (
            <option value={card.id} key={card.id}>
              {card.title} · {card.maskedNumber}
            </option>
          ))}
        </select>
      </label>
      <ErrorPanel error={error} />
      {payment ? (
        <div className={`notice ${payment.status === 'failed' ? 'notice-error' : 'notice-info'}`}>
          {payment.status === 'processing' ? (
            <Loader2 className="spin" size={18} aria-hidden />
          ) : (
            <CreditCard size={18} aria-hidden />
          )}
          <div>
            <strong>{paymentMessage(payment)}</strong>
            <span>
              {payment.failureCode ? `Код: ${payment.failureCode}` : `Статус: ${payment.status}`}
            </span>
          </div>
        </div>
      ) : null}
      <div className="actions-row compact">
        <button
          className="ghost-button"
          type="button"
          disabled={busy || payment?.status === 'processing' || payment?.status === 'succeeded'}
          onClick={() => void submitScenario('cancel')}
        >
          <X size={16} aria-hidden />
          Отменить попытку
        </button>
        <button
          className="checkout-button"
          type="button"
          disabled={
            busy ||
            !selectedCard ||
            payment?.status === 'processing' ||
            payment?.status === 'succeeded'
          }
          onClick={() => selectedCard && void submitScenario(selectedCard.scenario)}
        >
          {busy ? (
            <Loader2 className="spin" size={16} aria-hidden />
          ) : (
            <CreditCard size={16} aria-hidden />
          )}
          Оплатить
        </button>
      </div>
    </div>
  );
}
