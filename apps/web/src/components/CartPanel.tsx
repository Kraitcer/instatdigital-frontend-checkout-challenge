import { ShoppingBag, Trash2 } from 'lucide-react';
import type { Cart } from '@checkout/contracts';
import { formatMoney } from '../lib/format';

type CartPanelProps = {
  cart: Cart | undefined;
  busy: boolean;
  onRemove: (productId: string) => void;
  onCheckout: () => void;
};

export function CartPanel({ cart, busy, onRemove, onCheckout }: CartPanelProps) {
  return (
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
                    disabled={busy}
                    onClick={() => onRemove(item.productId)}
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
          <button className="checkout-button" type="button" disabled={busy} onClick={onCheckout}>
            Перейти к оформлению
          </button>
        </>
      )}
    </aside>
  );
}
