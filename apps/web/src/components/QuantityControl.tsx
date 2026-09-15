import { Loader2, Minus, Plus } from 'lucide-react';

type QuantityControlProps = {
  title: string;
  quantity: number;
  stock: number;
  pending: boolean;
  onChange: (quantity: number) => void;
};

export function QuantityControl({
  title,
  quantity,
  stock,
  pending,
  onChange,
}: QuantityControlProps) {
  if (quantity === 0) {
    return (
      <button
        className="primary-button"
        type="button"
        disabled={stock === 0 || pending}
        onClick={() => onChange(1)}
      >
        {pending ? (
          <Loader2 className="spin" size={16} aria-hidden />
        ) : (
          <Plus size={16} aria-hidden />
        )}
        Добавить
      </button>
    );
  }

  return (
    <div className="quantity-control" aria-label={`Количество ${title}`}>
      <button
        type="button"
        aria-label={`Уменьшить количество ${title}`}
        disabled={pending}
        onClick={() => onChange(quantity - 1)}
      >
        <Minus size={16} aria-hidden />
      </button>
      <output>{quantity}</output>
      <button
        type="button"
        aria-label={`Увеличить количество ${title}`}
        disabled={pending || quantity >= stock}
        onClick={() => onChange(quantity + 1)}
      >
        <Plus size={16} aria-hidden />
      </button>
    </div>
  );
}
