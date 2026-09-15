import type { Product } from '@checkout/contracts';
import { formatMoney } from '../lib/format';
import { QuantityControl } from './QuantityControl';

type ProductCardProps = {
  product: Product;
  quantity: number;
  pending: boolean;
  onQuantityChange: (productId: string, quantity: number) => void;
};

export function ProductCard({ product, quantity, pending, onQuantityChange }: ProductCardProps) {
  return (
    <article className="product-card">
      <div>
        <span className="sku">{product.sku}</span>
        <h3>{product.title}</h3>
        <p>{product.description}</p>
      </div>
      <div className="product-bottom">
        <strong>{formatMoney(product.price)}</strong>
        <span>{product.stock > 0 ? `Доступно ${product.stock}` : 'Нет в наличии'}</span>
      </div>
      <QuantityControl
        title={product.title}
        quantity={quantity}
        stock={product.stock}
        pending={pending}
        onChange={(nextQuantity) => onQuantityChange(product.id, nextQuantity)}
      />
    </article>
  );
}
