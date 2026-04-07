'use client';

import {
  createContext, useContext, useState, useEffect,
  useCallback, ReactNode,
} from 'react';
import type { AuthChangeEvent, Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { resolveSlugClient } from '@/lib/resolve-slug';

// ── Types ─────────────────────────────────────────────────────

export interface CartProduct {
  id:          string;
  name:        string;
  price:       number;
  image:       string;
  category:    string;
  description: string;
}

export interface CartItem {
  product:  CartProduct;
  quantity: number;
}

interface CartContextType {
  items:             CartItem[];
  totalItems:        number;
  totalPrice:        number;
  addItem:           (product: CartProduct) => void;
  removeItem:        (productId: string) => void;
  updateQuantity:    (productId: string, quantity: number) => void;
  clearCart:         () => void;
  isCartOpen:        boolean;
  setIsCartOpen:     (open: boolean) => void;
  user:              User | null;
  isAuthOpen:        boolean;
  setIsAuthOpen:     (open: boolean) => void;
  pendingProduct:    CartProduct | null;
  setPendingProduct: (p: CartProduct | null) => void;
  logout:            () => Promise<void>;
  boulangerieSlug:   string;
}

const CartContext = createContext<CartContextType | null>(null);

function resolveBoulangerieSlug(): string {
  const resolution = resolveSlugClient();
  return resolution?.slug ?? 'artisan-dore';
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems]                   = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen]         = useState(false);
  const [user, setUser]                     = useState<User | null>(null);
  const [isAuthOpen, setIsAuthOpen]         = useState(false);
  const [pendingProduct, setPendingProduct] = useState<CartProduct | null>(null);
  const [boulangerieSlug]                   = useState(resolveBoulangerieSlug);

  useEffect(() => {
    supabase.auth.getSession().then(
      ({ data: { session } }: { data: { session: Session | null } }) => {
        setUser(session?.user ?? null);
      }
    );

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        const nextUser = session?.user ?? null;
        setUser(nextUser);

        if (nextUser && pendingProduct) {
          // Ajoute le produit en attente après connexion
          setItems(prev => {
            const existing = prev.find(i => i.product.id === pendingProduct.id);
            if (existing) {
              return prev.map(i =>
                i.product.id === pendingProduct.id
                  ? { ...i, quantity: i.quantity + 1 }
                  : i
              );
            }
            return [...prev, { product: pendingProduct, quantity: 1 }];
          });
          setPendingProduct(null);
          setIsAuthOpen(false);
          setIsCartOpen(true);
        }
      }
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mutations panier ─────────────────────────────────────────
  // CORRECTION : addItem doit TOUJOURS fonctionner, même sans auth,
  // pour permettre d'ajouter plusieurs produits différents au panier.
  // L'auth n'est requise qu'au moment du checkout.

  const addItem = useCallback((product: CartProduct) => {
    setItems(prev => {
      const existing = prev.find(i => i.product.id === product.id);
      if (existing) {
        return prev.map(i =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
    setIsCartOpen(true);
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems(prev => prev.filter(i => i.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setItems(prev => prev.filter(i => i.product.id !== productId));
    } else {
      setItems(prev => prev.map(i => i.product.id === productId ? { ...i, quantity } : i));
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setUser(null);
  }, []);

  const totalItems = items.reduce((s, i) => s + i.quantity, 0);
  const totalPrice = items.reduce((s, i) => s + i.product.price * i.quantity, 0);

  return (
    <CartContext.Provider value={{
      items, totalItems, totalPrice,
      addItem, removeItem, updateQuantity, clearCart,
      isCartOpen, setIsCartOpen,
      user, isAuthOpen, setIsAuthOpen,
      pendingProduct, setPendingProduct,
      logout,
      boulangerieSlug,
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