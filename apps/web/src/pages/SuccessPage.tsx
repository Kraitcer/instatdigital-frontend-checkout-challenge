import { CheckCircle2 } from 'lucide-react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ErrorPanel } from '../components/ErrorPanel';
import { LoadingState } from '../components/LoadingState';
import { useGetOrderQuery } from '../api/checkoutApi';
import { formatMoney } from '../lib/format';
import { orderCleared } from '../store/checkoutSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

export function SuccessPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const orderId = useAppSelector((state) => state.checkout.orderId);
  const orderState = useGetOrderQuery(orderId ?? '', { skip: !orderId });
  const order = orderState.data;

  if (!orderId) return <Navigate to="/" replace />;
  if (orderState.isLoading) return <LoadingState>Проверяем статус заказа</LoadingState>;
  if (orderState.error)
    return <ErrorPanel error={orderState.error} onRetry={() => void orderState.refetch()} />;
  if (!order) return <Navigate to="/checkout" replace />;
  if (order.paymentMethod === 'card' && order.status !== 'paid')
    return <Navigate to="/checkout" replace />;

  return (
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
      <button
        className="primary-button"
        type="button"
        onClick={() => {
          dispatch(orderCleared());
          navigate('/');
        }}
      >
        Вернуться в магазин
      </button>
    </section>
  );
}
