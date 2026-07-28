import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const CartContext = createContext(null);

export function CartProvider({ children }) {
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('cart') || '{}');
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);

  const value = useMemo(() => {
    const items = Object.entries(cart).map(([code, item]) => ({ code, ...item }));
    const totalQty = items.reduce((sum, i) => sum + i.qty, 0);
    const totalPrice = items.reduce((sum, i) => sum + i.qty * i.price, 0);

    return {
      items,
      totalQty,
      totalPrice,
      addItem(product) {
        setCart((prev) => {
          const existing = prev[product.code];
          if (existing) {
            return { ...prev, [product.code]: { ...existing, qty: existing.qty + 1 } };
          }
          return {
            ...prev,
            [product.code]: {
              name: product.name,
              price: Number(product.price),
              image: product.image,
              qty: 1,
            },
          };
        });
      },
      updateQty(code, qty) {
        setCart((prev) => {
          if (!prev[code]) return prev;
          return { ...prev, [code]: { ...prev[code], qty: Math.max(1, qty) } };
        });
      },
      removeItem(code) {
        setCart((prev) => {
          const next = { ...prev };
          delete next[code];
          return next;
        });
      },
      clear() {
        setCart({});
      },
    };
  }, [cart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  return useContext(CartContext);
}
