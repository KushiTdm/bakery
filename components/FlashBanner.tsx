'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ShoppingBag, Gift, X, Clock, ChevronRight, Shuffle } from 'lucide-react';
import { products } from '@/lib/products';
import { useCart } from '@/context/cart-context';

// ─── Config flash (en prod, ces données viennent du Google Sheet boulangerie) ──
const FLASH_CONFIG = {
  // Heure de déclenchement du bandeau (15h = 15)
  startHour: 15,
  // Heure de fermeture
  endHour: 20,
  // Remise sur les invendus individuels
  discountPercent: 40,
  // Nombre de produits dans le panier mystère
  mysteryBasketCount: 4,
  // Prix fixe du panier mystère
  mysteryBasketPrice: 6.90,
};

// Produits invendus simulés (en prod → données du Google Sheet)
const UNSOLD_IDS = ['1', '2', '4', '5', '9', '11'];

type FlashMode = 'banner' | 'modal';
type OfferType = 'discount' | 'mystery';

function useFlashTime() {
  const [isFlashTime, setIsFlashTime] = useState(false);
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const hour = now.getHours();
      const minutes = now.getMinutes();
      const seconds = now.getSeconds();

      const active = hour >= FLASH_CONFIG.startHour && hour < FLASH_CONFIG.endHour;
      setIsFlashTime(active);

      if (active) {
        const endDate = new Date();
        endDate.setHours(FLASH_CONFIG.endHour, 0, 0, 0);
        const diff = endDate.getTime() - now.getTime();
        const h = Math.floor(diff / 3600000);
        const m = Math.floor((diff % 3600000) / 60000);
        const s = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
      }
    };

    check();
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, []);

  // Pour le dev : forcer l'affichage même hors horaires
  // return { isFlashTime: true, timeLeft: '4h 32m 15s' };
  return { isFlashTime, timeLeft };
}

// ─── Composant principal ───────────────────────────────────────────────────────

export default function FlashBanner() {
  const { isFlashTime, timeLeft } = useFlashTime();
  const [dismissed, setDismissed] = useState(false);
  const [mode, setMode] = useState<FlashMode>('banner');
  const [offerType, setOfferType] = useState<OfferType>('discount');
  const [mysteryRevealed, setMysteryRevealed] = useState(false);
  const [mysteryProducts, setMysteryProducts] = useState<typeof products>([]);
  const { addItem, setIsCartOpen, user, setIsAuthOpen, setPendingProduct } = useCart();

  const unsoldProducts = products.filter(p => UNSOLD_IDS.includes(p.id));

  const generateMystery = () => {
    const shuffled = [...unsoldProducts].sort(() => Math.random() - 0.5);
    setMysteryProducts(shuffled.slice(0, FLASH_CONFIG.mysteryBasketCount));
    setMysteryRevealed(false);
  };

  useEffect(() => {
    if (mode === 'modal') generateMystery();
  }, [mode]);

  const addDiscountProduct = (product: typeof products[0]) => {
    if (!user) {
      setPendingProduct(product);
      setIsAuthOpen(true);
      return;
    }
    const discounted = {
      ...product,
      price: +(product.price * (1 - FLASH_CONFIG.discountPercent / 100)).toFixed(2),
      name: `${product.name} ⚡-${FLASH_CONFIG.discountPercent}%`,
    };
    addItem(discounted);
    setIsCartOpen(true);
  };

  const addMysteryBasket = () => {
    if (!user) {
      setIsAuthOpen(true);
      return;
    }
    const basket = {
      id: 'mystery-basket',
      name: '🎁 Panier Mystère du Soir',
      category: 'boulangerie' as const,
      description: `${FLASH_CONFIG.mysteryBasketCount} produits surprises sélectionnés parmi les invendus du jour`,
      price: FLASH_CONFIG.mysteryBasketPrice,
      image: unsoldProducts[0]?.image ?? '',
    };
    addItem(basket);
    setIsCartOpen(true);
    setMode('banner');
  };

  if (!isFlashTime || dismissed) return null;

  return (
    <>
      {/* ── Bandeau sticky ── */}
      <AnimatePresence>
        {mode === 'banner' && (
          <motion.div
            initial={{ y: -80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -80, opacity: 0 }}
            transition={{ type: 'spring', damping: 20, stiffness: 200 }}
            className="fixed top-20 left-0 right-0 z-40 mx-4 sm:mx-8 lg:mx-auto lg:max-w-4xl"
          >
            <div className="relative overflow-hidden rounded-2xl shadow-2xl">

              {/* Fond dégradé animé */}
              <div className="absolute inset-0 bg-gradient-to-r from-[#2C1810] via-[#8B4513] to-[#C19A6B]" />
              <motion.div
                className="absolute inset-0 bg-gradient-to-r from-[#C19A6B]/30 via-transparent to-[#2C1810]/30"
                animate={{ x: ['0%', '100%', '0%'] }}
                transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
              />

              {/* Grain texture */}
              <div className="absolute inset-0 opacity-5"
                style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")' }}
              />

              <div className="relative flex items-center gap-3 px-4 py-3 sm:px-6">

                {/* Icône flash animée */}
                <motion.div
                  animate={{ scale: [1, 1.2, 1], rotate: [0, -10, 10, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="bg-yellow-400 rounded-full p-2 flex-shrink-0"
                >
                  <Zap size={18} className="text-[#2C1810] fill-current" />
                </motion.div>

                {/* Texte */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-white font-bold text-sm sm:text-base" style={{ fontFamily: 'Playfair Display, serif' }}>
                      Flash Fin de Journée
                    </span>
                    <span className="bg-yellow-400 text-[#2C1810] text-xs font-bold px-2 py-0.5 rounded-full">
                      -{FLASH_CONFIG.discountPercent}%
                    </span>
                  </div>
                  <p className="text-white/70 text-xs truncate">
                    Invendus du jour · Récupérez avant {FLASH_CONFIG.endHour}h00
                  </p>
                </div>

                {/* Compte à rebours */}
                <div className="flex-shrink-0 text-center hidden sm:block">
                  <div className="bg-black/30 rounded-lg px-3 py-1.5">
                    <div className="flex items-center gap-1.5 text-white">
                      <Clock size={12} className="text-yellow-400" />
                      <span className="font-mono text-sm font-bold tracking-wider">{timeLeft}</span>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setMode('modal')}
                  className="flex-shrink-0 bg-white text-[#2C1810] px-4 py-2 rounded-xl font-bold text-sm hover:bg-yellow-400 transition-colors duration-200 flex items-center gap-1.5"
                >
                  Voir <ChevronRight size={14} />
                </motion.button>

                {/* Fermer */}
                <button
                  onClick={() => setDismissed(true)}
                  className="flex-shrink-0 text-white/50 hover:text-white transition-colors ml-1"
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modal détail flash ── */}
      <AnimatePresence>
        {mode === 'modal' && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setMode('banner')}
              className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[58]" />

            <motion.div
              initial={{ opacity: 0, y: 60, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 60, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 280 }}
              className="fixed inset-x-4 bottom-4 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg z-[59] max-h-[85vh] overflow-hidden flex flex-col rounded-2xl shadow-2xl"
            >
              {/* Header modal */}
              <div className="relative bg-gradient-to-br from-[#2C1810] to-[#8B4513] px-6 py-5 flex-shrink-0">
                <div className="absolute top-0 right-0 w-32 h-32 bg-[#C19A6B]/20 rounded-full -translate-y-1/2 translate-x-1/2" />
                <button onClick={() => setMode('banner')} className="absolute top-4 right-4 text-white/60 hover:text-white">
                  <X size={20} />
                </button>
                <div className="flex items-center gap-3">
                  <motion.div animate={{ rotate: [0, -15, 15, 0] }} transition={{ duration: 2, repeat: Infinity }}>
                    <Zap size={28} className="text-yellow-400 fill-current" />
                  </motion.div>
                  <div>
                    <h2 className="text-white font-bold text-xl" style={{ fontFamily: 'Playfair Display, serif' }}>
                      Flash Invendus
                    </h2>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Clock size={12} className="text-yellow-400" />
                      <span className="text-white/60 text-xs font-mono">{timeLeft} restant</span>
                    </div>
                  </div>
                </div>

                {/* Toggle discount / mystère */}
                <div className="flex gap-2 mt-4">
                  {(['discount', 'mystery'] as OfferType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setOfferType(type)}
                      className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2 ${
                        offerType === type
                          ? 'bg-white text-[#2C1810]'
                          : 'bg-white/10 text-white/70 hover:bg-white/20'
                      }`}
                    >
                      {type === 'discount'
                        ? <><Zap size={14} /> -{FLASH_CONFIG.discountPercent}% invendus</>
                        : <><Gift size={14} /> Panier mystère</>
                      }
                    </button>
                  ))}
                </div>
              </div>

              {/* Corps modal */}
              <div className="bg-[#FDFBF7] flex-1 overflow-y-auto">
                <AnimatePresence mode="wait">

                  {/* ── Invendus avec remise ── */}
                  {offerType === 'discount' && (
                    <motion.div key="discount" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="p-4 space-y-3">
                      <p className="text-[#2C1810]/60 text-xs text-center pb-1">
                        {unsoldProducts.length} produits disponibles · Stock limité
                      </p>
                      {unsoldProducts.map((product, i) => {
                        const discountedPrice = +(product.price * (1 - FLASH_CONFIG.discountPercent / 100)).toFixed(2);
                        return (
                          <motion.div
                            key={product.id}
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.06 }}
                            className="bg-white rounded-xl p-3 flex items-center gap-3 shadow-sm"
                          >
                            <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
                              <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[#2C1810] font-semibold text-sm truncate">{product.name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className="text-[#2C1810]/40 text-xs line-through">{product.price.toFixed(2)}€</span>
                                <span className="text-[#C19A6B] font-bold text-sm">{discountedPrice.toFixed(2)}€</span>
                                <span className="bg-red-100 text-red-600 text-xs font-bold px-1.5 py-0.5 rounded-full">
                                  -{FLASH_CONFIG.discountPercent}%
                                </span>
                              </div>
                            </div>
                            <motion.button
                              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                              onClick={() => addDiscountProduct(product)}
                              className="bg-[#2C1810] text-white p-2.5 rounded-full hover:bg-[#C19A6B] transition-colors flex-shrink-0"
                            >
                              <ShoppingBag size={15} />
                            </motion.button>
                          </motion.div>
                        );
                      })}
                    </motion.div>
                  )}

                  {/* ── Panier mystère ── */}
                  {offerType === 'mystery' && (
                    <motion.div key="mystery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                      className="p-5 space-y-4">

                      {/* Carte panier mystère */}
                      <div className="bg-gradient-to-br from-[#2C1810] to-[#8B4513] rounded-2xl p-5 text-white text-center relative overflow-hidden">
                        <div className="absolute inset-0 opacity-10"
                          style={{ backgroundImage: 'radial-gradient(circle at 30% 70%, #C19A6B, transparent 60%)' }} />
                        <motion.div
                          animate={{ rotate: [0, 5, -5, 0], scale: [1, 1.05, 1] }}
                          transition={{ duration: 3, repeat: Infinity }}
                          className="text-5xl mb-3"
                        >🎁</motion.div>
                        <h3 className="font-bold text-lg mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>
                          Panier Mystère du Soir
                        </h3>
                        <p className="text-white/70 text-sm mb-3">
                          {FLASH_CONFIG.mysteryBasketCount} produits sélectionnés aléatoirement parmi nos invendus du jour
                        </p>
                        <div className="flex items-center justify-center gap-3 mb-4">
                          <span className="text-white/50 text-sm line-through">
                            ~{unsoldProducts.slice(0, FLASH_CONFIG.mysteryBasketCount).reduce((s, p) => s + p.price, 0).toFixed(2)}€
                          </span>
                          <span className="text-yellow-400 font-bold text-2xl">
                            {FLASH_CONFIG.mysteryBasketPrice.toFixed(2)}€
                          </span>
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
                          onClick={addMysteryBasket}
                          className="w-full bg-yellow-400 text-[#2C1810] py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 hover:bg-yellow-300 transition-colors"
                        >
                          <ShoppingBag size={16} /> Réserver ce panier
                        </motion.button>
                      </div>

                      {/* Aperçu des produits */}
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <p className="text-[#2C1810]/60 text-xs font-medium uppercase tracking-wider">
                            Aperçu du contenu
                          </p>
                          <button
                            onClick={generateMystery}
                            className="text-[#C19A6B] text-xs flex items-center gap-1 hover:text-[#8B4513] transition-colors"
                          >
                            <Shuffle size={12} /> Regenerer
                          </button>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          {mysteryProducts.map((product, i) => (
                            <motion.div
                              key={product.id}
                              initial={{ opacity: 0, scale: 0.8 }}
                              animate={{ opacity: mysteryRevealed ? 1 : 0.3, scale: 1 }}
                              transition={{ delay: i * 0.1 }}
                              className="bg-white rounded-xl overflow-hidden shadow-sm relative"
                            >
                              <div className="aspect-square relative">
                                <img src={product.image} alt={product.name}
                                  className={`w-full h-full object-cover transition-all duration-500 ${mysteryRevealed ? '' : 'blur-sm'}`} />
                                {!mysteryRevealed && (
                                  <div className="absolute inset-0 bg-[#2C1810]/60 flex items-center justify-center">
                                    <span className="text-2xl">?</span>
                                  </div>
                                )}
                              </div>
                              {mysteryRevealed && (
                                <p className="text-[#2C1810] text-xs font-medium p-2 truncate">{product.name}</p>
                              )}
                            </motion.div>
                          ))}
                        </div>

                        {!mysteryRevealed ? (
                          <motion.button
                            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                            onClick={() => setMysteryRevealed(true)}
                            className="w-full mt-3 border-2 border-dashed border-[#C19A6B]/50 text-[#C19A6B] py-2.5 rounded-xl text-sm font-medium hover:border-[#C19A6B] transition-colors"
                          >
                            👁 Révéler le contenu
                          </motion.button>
                        ) : (
                          <p className="text-center text-[#2C1810]/40 text-xs mt-3">
                            Le contenu exact peut varier légèrement selon le stock réel
                          </p>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}