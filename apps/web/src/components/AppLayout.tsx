import { useEffect, useRef } from 'react';
import { Outlet } from 'react-router-dom';
import { ShoppingBag } from 'lucide-react';
import { ErrorPanel } from './ErrorPanel';
import { LoadingState } from './LoadingState';
import { useCreateSessionMutation, useGetCartQuery } from '../api/checkoutApi';
import { formatMoney } from '../lib/format';
import { sessionReceived } from '../store/checkoutSlice';
import { useAppDispatch, useAppSelector } from '../store/hooks';

export function AppLayout() {
  const dispatch = useAppDispatch();
  const token = useAppSelector((state) => state.checkout.token);
  const requestedSession = useRef(false);
  const [createSession, sessionState] = useCreateSessionMutation();
  const { data: cart } = useGetCartQuery(undefined, { skip: !token });

  useEffect(() => {
    if (token || requestedSession.current) return;
    requestedSession.current = true;
    void createSession()
      .unwrap()
      .then((session) => {
        dispatch(sessionReceived({ token: session.token, sessionId: session.id }));
      })
      .catch(() => undefined);
  }, [createSession, dispatch, token]);

  const retrySession = () => {
    sessionState.reset();
    requestedSession.current = true;
    void createSession()
      .unwrap()
      .then((session) => {
        dispatch(sessionReceived({ token: session.token, sessionId: session.id }));
      })
      .catch(() => undefined);
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
      <ErrorPanel error={sessionState.error} onRetry={retrySession} />
      {!token ? <LoadingState>Создаём сессию магазина</LoadingState> : <Outlet />}
    </main>
  );
}
