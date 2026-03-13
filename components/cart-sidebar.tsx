'use client';

// components/cart-sidebar.tsx
// ─────────────────────────────────────────────────────────────
// CORRECTIONS :
//   - alert() JavaScript supprimé (UX inacceptable en prod)
//   - Remplacé par un écran de confirmation inline animé
//   - Numéro de commande généré côté client en attendant /api/orders
//   - TODO: brancher sur POST /api/orders pour persister en base
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Minus, Plus, ShoppingBag, Trash2, ArrowRight, CheckCircle, MapPin, Clock, Mail } from 'lucide-react';
import { useCart } from '@/context/cart-context';

function OrderConfirmation({
  orderNumber,
  total,
  onClose,
}: {
  orderNumber: string;
  total: number;
  onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center h-full px-6 py-10 text-center"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 14, delay: 0.1 }}
        className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-5"
      >
        <CheckCircle size={40} className="text-green-600" />
      </motion.div>

      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <h3 className="text-[#2C1810] text-xl font-bold mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>
          Commande confirmée !
        </h3>
        <p className="text-[#2C1810]/50 text-sm mb-5">
          Total : <span className="font-bold text-[#C19A6B]">{total.toFixed(2)} €</span>
        </p>

        <div className="bg-[#F5F0E8] rounded-2xl p-4 mb-5 space-y-3 text-left">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#C19A6B]/15 rounded-full flex items-center justify-center flex-shrink-0">
              <ShoppingBag size={13} className="text-[#C19A6B]" />
            </div>
            <div>
              <p className="text-[#2C1810]/50 text-xs">Numéro de commande</p>
              <p className="text-[#2C1810] font-mono font-bold text-sm">{orderNumber}</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#C19A6B]/15 rounded-full flex items-center justify-center flex-shrink-0">
              <MapPin size={13} className="text-[#C19A6B]" />
            </div>
            <div>
              <p className="text-[#2C1810]/50 text-xs">Retrait en boutique</p>
              <p className="text-[#2C1810] text-sm font-medium">42 Rue de la Boulangerie, Paris</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#C19A6B]/15 rounded-full flex items-center justify-center flex-shrink-0">
              <Clock size={13} className="text-[#C19A6B]" />
            </div>
            <div>
              <p className="text-[#2C1810]/50 text-xs">Disponible dès demain</p>
              <p className="text-[#2C1810] text-sm font-medium">À partir de 7h · Jusqu'à 10h</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#C19A6B]/15 rounded-full flex items-center justify-center flex-shrink-0">
              <Mail size={13} className="text-[#C19A6B]" />
            </div>
            <div>
              <p className="text-[#2C1810]/50 text-xs">Confirmation</p>
              <p className="text-[#2C1810] text-sm font-medium">Email envoyé à votre adresse</p>
            </div>
          </div>
        </div>

        <p className="text-[#2C1810]/40 text-xs mb-5">
          Paiement sur place uniquement · Espèces ou carte bancaire
        </p>

        <button
          onClick={onClose}
          className="w-full bg-[#2C1810] text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-[#C19A6B] transition-colors"
        >
          Fermer
        </button>
      </motion.div>
    </motion.div>
  );
}

export default function CartSidebar() {
  const {
    isCartOpen, setIsCartOpen,
    items, updateQuantity, removeItem, clearCart,
    totalItems, totalPrice,
    user, setIsAuthOpen,
  } = useCart();

  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [orderNumber, setOrderNumber]       = useState('');

  const handleCheckout = async () => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }

    // TODO: POST /api/orders pour persister la commande en base
    // const res = await fetch('/api/orders', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify({ items, total: totalPrice }),
    // });

    // Génère un numéro de commande côté client (temporaire)
    const num = `ART-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    setOrderNumber(num);
    setOrderConfirmed(true);
    clearCart();
  };

  const handleClose = () => {
    setIsCartOpen(false);
    setOrderConfirmed(false);
    setOrderNumber('');
  };

  const LIVRAISON = 0;
  const TVA       = totalPrice * 0.055;
  const TOTAL_TTC = totalPrice;

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55]"
          />

          {/* Sidebar */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-[#FDFBF7] z-[56] flex flex-col shadow-2xl"
          >
            {/* Header */}
            <div className="bg-[#2C1810] px-6 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ShoppingBag size={20} className="text-[#C19A6B]" />
                <h2 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
                  {orderConfirmed ? 'Commande passée' : 'Mon Panier'}
                </h2>
                {!orderConfirmed && totalItems > 0 && (
                  <span className="bg-[#C19A6B] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {!orderConfirmed && items.length > 0 && (
                  <button
                    onClick={clearCart}
                    className="text-white/40 hover:text-white/80 transition-colors text-xs flex items-center gap-1"
                  >
                    <Trash2 size={12} /> Vider
                  </button>
                )}
                <button onClick={handleClose} className="text-white/60 hover:text-white transition-colors">
                  <X size={22} />
                </button>
              </div>
            </div>

            {/* Corps */}
            <div className="flex-1 overflow-y-auto">

              {/* Écran confirmation */}
              {orderConfirmed ? (
                <OrderConfirmation
                  orderNumber={orderNumber}
                  total={TOTAL_TTC}
                  onClose={handleClose}
                />
              ) : items.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center h-full px-6 text-center"
                >
                  <div className="w-20 h-20 bg-[#C19A6B]/10 rounded-full flex items-center justify-center mb-4">
                    <ShoppingBag size={36} className="text-[#C19A6B]/50" />
                  </div>
                  <h3 className="text-[#2C1810] font-semibold text-lg mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                    Panier vide
                  </h3>
                  <p className="text-[#2C1810]/50 text-sm mb-6">
                    Découvrez notre sélection du jour et ajoutez vos produits préférés.
                  </p>
                  <button
                    onClick={() => setIsCartOpen(false)}
                    className="bg-[#C19A6B] text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-[#8B4513] transition-colors"
                  >
                    Voir la fournée du jour
                  </button>
                </motion.div>
              ) : (
                <div className="p-4 space-y-3">
                  <AnimatePresence>
                    {items.map(({ product, quantity }) => (
                      <motion.div
                        key={product.id}
                        layout
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, x: 60, transition: { duration: 0.2 } }}
                        className="bg-white rounded-xl p-3 flex gap-3 shadow-sm"
                      >
                        <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
                          <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[#2C1810] font-semibold text-sm truncate">{product.name}</p>
                          <p className="text-[#C19A6B] font-bold text-sm mt-0.5">{product.price.toFixed(2)} €</p>
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              onClick={() => updateQuantity(product.id, quantity - 1)}
                              className="w-6 h-6 rounded-full bg-[#F5F0E8] flex items-center justify-center hover:bg-[#C19A6B] hover:text-white transition-colors"
                            >
                              <Minus size={10} />
                            </button>
                            <span className="text-[#2C1810] font-bold text-sm w-4 text-center">{quantity}</span>
                            <button
                              onClick={() => updateQuantity(product.id, quantity + 1)}
                              className="w-6 h-6 rounded-full bg-[#F5F0E8] flex items-center justify-center hover:bg-[#C19A6B] hover:text-white transition-colors"
                            >
                              <Plus size={10} />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-col items-end justify-between flex-shrink-0">
                          <button onClick={() => removeItem(product.id)} className="text-[#2C1810]/30 hover:text-red-400 transition-colors">
                            <X size={14} />
                          </button>
                          <p className="text-[#2C1810] font-bold text-sm">{(product.price * quantity).toFixed(2)} €</p>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </div>

            {/* Footer récap + CTA */}
            {items.length > 0 && !orderConfirmed && (
              <div className="border-t border-[#E8E0D5] bg-white px-5 py-5 space-y-3">
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-[#2C1810]/60">
                    <span>Sous-total HT</span>
                    <span>{(totalPrice - TVA).toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between text-[#2C1810]/60">
                    <span>TVA (5,5%)</span>
                    <span>{TVA.toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between text-[#2C1810]/60">
                    <span>Click & Collect</span>
                    <span className="text-green-600 font-medium">Gratuit</span>
                  </div>
                  <div className="h-px bg-[#E8E0D5] my-1" />
                  <div className="flex justify-between text-[#2C1810] font-bold text-base">
                    <span>Total TTC</span>
                    <span className="text-[#C19A6B]">{TOTAL_TTC.toFixed(2)} €</span>
                  </div>
                </div>

                {user ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                    Connecté : {user.email}
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    ⚠️ Connexion requise pour commander
                  </div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleCheckout}
                  className="w-full bg-[#2C1810] hover:bg-[#C19A6B] text-white py-4 rounded-xl font-semibold text-sm transition-colors duration-300 flex items-center justify-center gap-2"
                >
                  {user ? 'Confirmer la commande' : 'Se connecter pour commander'}
                  <ArrowRight size={16} />
                </motion.button>

                <p className="text-center text-[#2C1810]/40 text-xs">
                  Retrait en boutique uniquement · Paiement sur place
                </p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}