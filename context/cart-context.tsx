'use client';

// context/cart-context.tsx
// ─────────────────────────────────────────────────────────────
// CORRECTIF : Suppression du double système d'authentification.
// ─────────────────────────────────────────────────────────────

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

// ── Types ─────────────────────────────────────────────────────

export interface CartItem {
  id:       string;
  name:     string;
  emoji:    string;
  price:    number;
  quantity: number;
}

interface CartContextType {
  items:       CartItem[];
  totalItems:  number;
  totalPrice:  number;
  addItem:     (item: Omit<CartItem, 'quantity'>) => void;
  removeItem:  (id: string) => void;
  updateQty:   (id: string, qty: number) => void;
  clearCart:   () => void;
  isOpen:      boolean;
  openCart:    () => void;
  closeCart:   () => void;
  toggleCart:  () => void;
}

const CartContext = createContext<CartContextType | null>(null);

// ── Provider ──────────────────────────────────────────────────

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  const addItem = useCallback((newItem: Omit<CartItem, 'quantity'>) => {
    setItems(prev => {
      const existing = prev.find(i => i.id === newItem.id);
      if (existing) {
        return prev.map(i =>
          i.id === newItem.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { ...newItem, quantity: 1 }];
    });
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  }, []);

  const updateQty = useCallback((id: string, qty: number) => {
    if (qty <= 0) {
      setItems(prev => prev.filter(i => i.id !== id));
    } else {
      setItems(prev =>
        prev.map(i => i.id === id ? { ...i, quantity: qty } : i)
      );
    }
  }, []);

  const clearCart  = useCallback(() => setItems([]), []);
  const openCart   = useCallback(() => setIsOpen(true), []);
  const closeCart  = useCallback(() => setIsOpen(false), []);
  const toggleCart = useCallback(() => setIsOpen(v => !v), []);

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, totalItems, totalPrice,
      addItem, removeItem, updateQty, clearCart,
      isOpen, openCart, closeCart, toggleCart,
    }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart doit être utilisé dans <CartProvider>');
  return ctx;
}