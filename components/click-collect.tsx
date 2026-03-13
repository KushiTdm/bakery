'use client';

// components/click-collect.tsx
// ─────────────────────────────────────────────────────────────
// CORRECTIONS :
//   - UNSOLD_IDS hardcodés supprimés
//   - FlashSection utilise unsoldIds + flashConfig depuis useProducts()
//   - Les invendus affichés correspondent aux vrais stocks du boulanger
//   - stockRestant affiché si disponible
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, Zap, Clock, Package, Info } from 'lucide-react';
import { useProducts } from '@/hooks/use-products';
import type { FlashConfig } from '@/hooks/use-products';
import { useCart } from '@/context/cart-context';
import { products as LOCAL_PRODUCTS, categories } from '@/lib/products';

// ─── Calcul de l'état du flash en fonction de flashConfig ────
function useFlashTime(config: FlashConfig) {
  const [now] = useState(() => new Date());
  const hour  = now.getHours();
  const active = config.flashActif && hour >= config.heureDebut && hour < config.heureFin;
  if (!active) return { isFlash: false, timeLeft: '' };
  const end = new Date();
  end.setHours(config.heureFin, 0, 0, 0);
  const diff = end.getTime() - now.getTime();
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  return { isFlash: true, timeLeft: `${h}h ${String(m).padStart(2, '0')}m` };
}

// ─── Card produit standard ────────────────────────────────────
function ProductCard({ product, index }: { product: any; index: number }) {
  const { addItem, user, setIsAuthOpen, setPendingProduct } = useCart();

  const handleAdd = () => {
    if (!user) { setPendingProduct(product); setIsAuthOpen(true); return; }
    addItem(product);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-[#E8E0D5]/60"
    >
      <div className="relative overflow-hidden aspect-[4/3]">
        <img
          src={product.image}
          alt={product.name}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
        <span className="absolute top-3 left-3 bg-white/90 text-[#2C1810] text-xs font-medium px-2.5 py-1 rounded-full capitalize backdrop-blur-sm">
          {product.category}
        </span>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-[#2C1810] text-sm mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>
          {product.name}
        </h3>
        <p className="text-[#2C1810]/50 text-xs mb-3 line-clamp-1">{product.description}</p>
        <div className="flex items-center justify-between">
          <span className="text-lg font-bold text-[#C19A6B]">{product.price.toFixed(2)} €</span>
          <motion.button
            whileHover={{ scale: 1.08 }}
            whileTap={{ scale: 0.93 }}
            onClick={handleAdd}
            className="bg-[#2C1810] text-white p-2.5 rounded-full hover:bg-[#C19A6B] transition-colors"
          >
            <ShoppingBag size={15} />
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Section paniers invendus ─────────────────────────────────
// Reçoit les données Airtable en prop : flashConfig + unsoldProducts réels
function FlashSection({
  flashConfig,
  unsoldProducts,
}: {
  flashConfig: FlashConfig;
  unsoldProducts: any[];
}) {
  const { isFlash, timeLeft } = useFlashTime(flashConfig);
  const { addItem, user, setIsAuthOpen } = useCart();

  const addDiscounted = (product: any) => {
    if (!user) { setIsAuthOpen(true); return; }
    const discounted = {
      ...product,
      price: +(product.price * (1 - flashConfig.remisePercent / 100)).toFixed(2),
      name: `${product.name} ⚡`,
    };
    addItem(discounted);
  };

  if (!isFlash) {
    return (
      <div className="bg-[#2C1810] rounded-3xl p-8 text-center">
        <div className="w-14 h-14 bg-[#C19A6B]/15 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Clock size={26} className="text-[#C19A6B]" />
        </div>
        <h3 className="text-white text-xl font-bold mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
          Invendus du jour — Disponibles à {flashConfig.heureDebut}h
        </h3>
        <p className="text-white/50 text-sm leading-relaxed max-w-sm mx-auto">
          Chaque soir à {flashConfig.heureDebut}h, nos invendus sont proposés à -{flashConfig.remisePercent}%
          jusqu'à épuisement. Premier arrivé, premier servi.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 bg-white/8 border border-white/10 rounded-full px-4 py-2">
          <Info size={13} className="text-[#C19A6B]" />
          <span className="text-white/50 text-xs">Pas de réservation · Paiement en boutique</span>
        </div>
      </div>
    );
  }

  // Flash actif mais aucun invendu déclaré par le boulanger
  if (unsoldProducts.length === 0) {
    return (
      <div className="bg-gradient-to-br from-[#2C1810] to-[#8B4513] rounded-3xl p-8 text-center">
        <div className="w-14 h-14 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Zap size={26} className="text-green-400" />
        </div>
        <h3 className="text-white text-lg font-bold mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
          Flash actif · {timeLeft} restant
        </h3>
        <p className="text-white/50 text-sm">Tous les produits ont été vendus aujourd'hui 🎉</p>
      </div>
    );
  }

  const basketsLeft = flashConfig.panierMystereCount;

  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-[#2C1810] to-[#8B4513] rounded-3xl p-6">
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent"
        animate={{ x: ['-100%', '100%'] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <motion.div
                animate={{ scale: [1, 1.2, 1] }}
                transition={{ duration: 1.5, repeat: Infinity }}
                className="bg-yellow-400 rounded-lg p-1.5"
              >
                <Zap size={14} className="text-[#2C1810] fill-current" />
              </motion.div>
              <h3 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
                Flash Invendus
              </h3>
              <span className="bg-yellow-400 text-[#2C1810] text-xs font-black px-2 py-0.5 rounded-full">
                -{flashConfig.remisePercent}%
              </span>
            </div>
            <p className="text-white/55 text-xs">
              Premier arrivé, premier servi · {timeLeft} restant
            </p>
          </div>
          <div className="flex items-center gap-1.5 bg-black/25 rounded-xl px-3 py-2 flex-shrink-0">
            <Package size={13} className="text-yellow-400" />
            <span className="text-white text-sm font-bold">{basketsLeft}</span>
            <span className="text-white/50 text-xs">paniers</span>
          </div>
        </div>

        <div className="bg-white/8 border border-white/15 rounded-xl px-3 py-2.5 mb-5 flex items-center gap-2">
          <Info size={13} className="text-yellow-400 flex-shrink-0" />
          <p className="text-white/65 text-xs">
            Aucune réservation — venez récupérer avant {flashConfig.heureFin}h
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {unsoldProducts.map((product, i) => {
            const discountedPrice = +(product.price * (1 - flashConfig.remisePercent / 100)).toFixed(2);
            return (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.07 }}
                className="bg-white/10 backdrop-blur-sm rounded-xl overflow-hidden group border border-white/10 hover:bg-white/15 transition-colors"
              >
                <div className="aspect-square relative overflow-hidden">
                  <img src={product.image} alt={product.name}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <div className="absolute bottom-2 left-2 right-2">
                    <p className="text-white text-xs font-semibold truncate leading-tight">{product.name}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-white/50 text-xs line-through">{product.price.toFixed(2)}€</span>
                      <span className="text-yellow-400 text-sm font-bold">{discountedPrice.toFixed(2)}€</span>
                    </div>
                  </div>
                  {/* Stock restant si disponible */}
                  {product.stockRestant > 0 && (
                    <div className="absolute top-2 right-2 bg-black/60 rounded-full px-1.5 py-0.5 text-white text-[10px] font-bold">
                      ×{product.stockRestant}
                    </div>
                  )}
                </div>
                <div className="p-2">
                  <button
                    onClick={() => addDiscounted(product)}
                    className="w-full bg-white/15 hover:bg-yellow-400 hover:text-[#2C1810] text-white text-xs font-medium py-2 rounded-lg transition-all duration-200 flex items-center justify-center gap-1.5"
                  >
                    <ShoppingBag size={12} /> Ajouter
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Page principale Click & Collect ─────────────────────────
export default function ClickCollect() {
  const [activeCategory, setActiveCategory] = useState('all');
  const { products, loading, source, flashConfig, unsoldIds } = useProducts();

  // Les vrais invendus viennent d'Airtable via useProducts()
  const unsoldProducts = products.filter((p: any) => unsoldIds.includes(p.id));

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter((p: any) => p.category === activeCategory);

  return (
    <div className="pt-20 min-h-screen bg-[#FDFBF7]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <h1 className="text-3xl sm:text-4xl font-bold text-[#2C1810]" style={{ fontFamily: 'Playfair Display, serif' }}>
            Click & Collect
          </h1>
          <p className="text-[#2C1810]/55 mt-2 text-sm">
            Commandez en ligne, venez retirer en boutique · Paiement sur place
          </p>
          {!loading && source === 'airtable' && (
            <div className="flex items-center gap-1.5 mt-2">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-xs text-[#2C1810]/35">Catalogue mis à jour</span>
            </div>
          )}
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-8">

          {/* Colonne gauche — Catalogue (2/3) */}
          <div className="lg:col-span-2">
            <div className="flex flex-wrap gap-2 mb-7">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-xs font-medium transition-all duration-200 ${
                    activeCategory === cat.id
                      ? 'bg-[#2C1810] text-white'
                      : 'bg-white text-[#2C1810]/70 border border-[#E8E0D5] hover:border-[#C19A6B]/50'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse border border-[#E8E0D5]/60">
                    <div className="aspect-[4/3] bg-[#E8E0D5]" />
                    <div className="p-4 space-y-2">
                      <div className="h-3 bg-[#E8E0D5] rounded w-3/4" />
                      <div className="h-3 bg-[#E8E0D5] rounded w-full" />
                      <div className="flex justify-between items-center pt-1">
                        <div className="h-5 bg-[#E8E0D5] rounded w-14" />
                        <div className="w-8 h-8 bg-[#E8E0D5] rounded-full" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeCategory}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-2 sm:grid-cols-3 gap-4"
                >
                  {filteredProducts.map((product: any, index: number) => (
                    <ProductCard key={product.id} product={product} index={index} />
                  ))}
                </motion.div>
              </AnimatePresence>
            )}
          </div>

          {/* Colonne droite — Flash (1/3) */}
          <div className="lg:col-span-1">
            <div className="sticky top-28">
              <FlashSection
                flashConfig={flashConfig}
                unsoldProducts={unsoldProducts}
              />

              <div className="mt-5 bg-white rounded-2xl p-5 border border-[#E8E0D5] space-y-3">
                <h4 className="text-[#2C1810] font-semibold text-sm" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Informations retrait
                </h4>
                <div className="space-y-2.5 text-xs text-[#2C1810]/60">
                  {[
                    { text: 'Commande disponible <strong class="text-[#2C1810]/80">dès le lendemain matin</strong> à partir de 7h' },
                    { text: 'Paiement <strong class="text-[#2C1810]/80">sur place uniquement</strong> — espèces ou carte' },
                    { text: 'Commande conservée <strong class="text-[#2C1810]/80">jusqu\'à 10h</strong>, puis libérée' },
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#C19A6B] mt-1.5 flex-shrink-0" />
                      <p dangerouslySetInnerHTML={{ __html: item.text }} />
                    </div>
                  ))}
                  <div className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                    <p>Click & Collect <strong className="text-[#2C1810]/80">100% gratuit</strong></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}