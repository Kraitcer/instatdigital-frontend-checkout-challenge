import type { Cart } from '@checkout/contracts';

export type CartItem = Cart['items'][number];

export const indexCartItems = (cart: Cart | undefined) => {
  const items = new Map<string, CartItem>();
  if (!cart) return items;
  for (let index = 0; index < cart.items.length; index += 1) {
    const item = cart.items[index];
    items.set(item.productId, item);
  }
  return items;
};
