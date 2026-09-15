import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CartPanel } from '../components/CartPanel';
import { ErrorPanel } from '../components/ErrorPanel';
import { LoadingState } from '../components/LoadingState';
import { ProductCard } from '../components/ProductCard';
import {
  useGetCartQuery,
  useGetProductsQuery,
  useRemoveCartItemMutation,
  useSetCartItemMutation,
} from '../api/checkoutApi';
import { indexCartItems } from '../lib/cart';
import { orderCleared } from '../store/checkoutSlice';
import { useAppDispatch } from '../store/hooks';

export function ShopPage() {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const productsState = useGetProductsQuery();
  const cartState = useGetCartQuery();
  const [setCartItem, setItemState] = useSetCartItemMutation();
  const [removeCartItem, removeState] = useRemoveCartItemMutation();
  const cartItems = useMemo(() => indexCartItems(cartState.data), [cartState.data]);
  const error = productsState.error ?? cartState.error ?? setItemState.error ?? removeState.error;

  const changeQuantity = async (productId: string, quantity: number) => {
    setPendingProductId(productId);
    try {
      if (quantity > 0) await setCartItem({ productId, quantity }).unwrap();
      else await removeCartItem(productId).unwrap();
      dispatch(orderCleared());
    } catch {
      return;
    } finally {
      setPendingProductId(null);
    }
  };

  const removeItem = async (productId: string) => {
    await changeQuantity(productId, 0);
  };

  if (productsState.isLoading || cartState.isLoading) {
    return <LoadingState>Загружаем каталог и корзину</LoadingState>;
  }

  return (
    <>
      <ErrorPanel
        error={error}
        onRetry={() => {
          void productsState.refetch();
          void cartState.refetch();
        }}
      />
      <div className="layout">
        <section className="panel catalog-panel" aria-labelledby="catalog-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Каталог</p>
              <h2 id="catalog-title">Товары</h2>
            </div>
          </div>
          <div className="product-grid">
            {productsState.data?.map((product) => (
              <ProductCard
                key={product.id}
                product={product}
                quantity={cartItems.get(product.id)?.quantity ?? 0}
                pending={pendingProductId === product.id}
                onQuantityChange={changeQuantity}
              />
            ))}
          </div>
        </section>
        <CartPanel
          cart={cartState.data}
          busy={Boolean(pendingProductId)}
          onRemove={removeItem}
          onCheckout={() => navigate('/checkout')}
        />
      </div>
    </>
  );
}
