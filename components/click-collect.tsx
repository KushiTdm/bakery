'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MapPin, Clock, CalendarPlus, User, Search, X } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useSlug } from '@/hooks/use-slug';
import { categories } from '@/lib/products';
import type { Product } from '@/lib/products';
import FlashSection from '@/components/flash-section';

const ALLERGENE_SHORT: Record<string, string> = {
  gluten: 'Gluten', crustaces: 'Crustacés', oeufs: 'Œufs',
  poisson: 'Poisson', arachides: 'Arachides', soja: 'Soja',
  lait: 'Lait', fruits_a_coque: 'Fruits à coque', celeri: 'Céleri',
  moutarde: 'Moutarde', sesame: 'Sésame', sulfites: 'Sulfites',
  lupin: 'Lupin', mollusques: 'Mollusques',
};

interface BoulangeriePublicInfo {
  adresse:          string | null;
  ville:            string | null;
  code_postal:      string | null;
  creneaux_retrait: string[];
}

function heureToPlage(heure: string): string {
  const h = parseInt(heure.split(':')[0], 10);
  const hFin = h + 4;
  return `${h}h–${hFin}h`;
}

interface ProductWithStock extends Product {
  stock?:      number;
  en_stock?:   boolean;
  allergenes?: string[];
}

function useCatalogue(slug: string | null) {
  const [products,    setProducts]    = useState<ProductWithStock[]>([]);
  const [boulangerie, setBoulangerie] = useState<BoulangeriePublicInfo | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [source,      setSource]      = useState<'supabase' | 'local'>('local');
  const [hasStock,    setHasStock]    = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/catalogue/${slug}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as {
          products:     ProductWithStock[];
          source:       string;
          boulangerie?: BoulangeriePublicInfo;
          hasStock?:    boolean;
        };
        if (!cancelled) {
          setProducts(data.products ?? []);
          setSource(data.source === 'supabase' ? 'supabase' : 'local');
          setHasStock(data.hasStock === true);
          if (data.boulangerie) setBoulangerie(data.boulangerie);
        }
      } catch {
        if (!cancelled) {
          const { products: local } = await import('@/lib/products');
          setProducts(local);
          setSource('local');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [slug]);

  return { products, boulangerie, loading, source, hasStock };
}

function formatAdresseRetrait(info: BoulangeriePublicInfo | null): string {
  if (!info) return '42 Rue de la Boulangerie, 75001 Paris';
  const parts = [
    info.adresse,
    [info.code_postal, info.ville].filter(Boolean).join(' '),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '42 Rue de la Boulangerie, 75001 Paris';
}

function ProductCard({ product, index, hasStockInfo }: { product: ProductWithStock; index: number; hasStockInfo: boolean }) {
  const { addItem, setRetraitDate } = useCart();
  const isOutOfStock = hasStockInfo && product.en_stock === false;

  const handleAdd = () => {
    if (isOutOfStock) setRetraitDate('tomorrow');
    addItem(product);
  };

  const handlePreOrder = () => {
    setRetraitDate('tomorrow');
    addItem(product);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: Math.min(index * 0.04, 0.3) }}
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-[#E8E0D5]/60"
    >
      <div className="relative overflow-hidden aspect-[4/3]">
        <img
          src={product.image}
          alt={`${product.name} — ${product.category} artisanal`}
          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${isOutOfStock ? 'opacity-60 grayscale-[30%]' : ''}`}
          loading="lazy"
          width={400}
          height={300}
        />
        <span className="absolute top-2 left-2 sm:top-3 sm:left-3 bg-white/90 text-[#2C1810] text-[10px] sm:text-xs font-medium px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full capitalize backdrop-blur-sm">
          {product.category}
        </span>
        {isOutOfStock && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 sm:px-3 sm:py-2">
            <span className="text-white text-[9px] sm:text-[10px] font-semibold">Épuisé aujourd&apos;hui</span>
          </div>
        )}
        {hasStockInfo && !isOutOfStock && typeof product.stock === 'number' && product.stock <= 3 && product.stock > 0 && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-amber-900/50 to-transparent px-2 py-1.5 sm:px-3 sm:py-2">
            <span className="text-amber-100 text-[9px] sm:text-[10px] font-semibold">Plus que {product.stock} disponible{product.stock > 1 ? 's' : ''}</span>
          </div>
        )}
      </div>
      <div className="p-3 sm:p-4">
        <h3 className="font-semibold text-[#2C1810] text-xs sm:text-sm mb-0.5 sm:mb-1 leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
          {product.name}
        </h3>
        <p className="text-[#2C1810]/50 text-[10px] sm:text-xs mb-1.5 sm:mb-2 line-clamp-1">{product.description}</p>
        {product.allergenes && product.allergenes.length > 0 && (
          <div className="flex flex-wrap gap-0.5 sm:gap-1 mb-2 sm:mb-3">
            {product.allergenes.slice(0, 3).map(a => (
              <span key={a} className="text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-200/60 text-amber-700/80 font-medium">
                {ALLERGENE_SHORT[a] ?? a}
              </span>
            ))}
            {product.allergenes.length > 3 && (
              <span className="text-[8px] sm:text-[9px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600/60 font-medium">
                +{product.allergenes.length - 3}
              </span>
            )}
          </div>
        )}
        <div className="flex items-center justify-between gap-1">
          <span className="text-base sm:text-lg font-bold text-[#C19A6B]">{product.price.toFixed(2)} €</span>
          {isOutOfStock ? (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.93 }}
              onClick={handlePreOrder}
              aria-label={`Réserver ${product.name} pour demain`}
              className="bg-amber-600 text-white p-1.5 sm:p-2 rounded-full hover:bg-amber-500 transition-colors flex items-center gap-0.5 sm:gap-1"
            >
              <CalendarPlus size={12} />
              <span className="text-[9px] sm:text-[10px] font-semibold pr-0.5 sm:pr-1">Demain</span>
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.08 }}
              whileTap={{ scale: 0.93 }}
              onClick={handleAdd}
              aria-label={`Ajouter ${product.name} au panier`}
              className="bg-[#2C1810] text-white p-2 sm:p-2.5 rounded-full hover:bg-[#C19A6B] transition-colors flex-shrink-0"
            >
              <Plus size={14} strokeWidth={2.5} />
            </motion.button>
          )}
        </div>
      </div>
    </motion.article>
  );
}

function AuthHint() {
  const { user, setIsAuthOpen } = useCart();
  if (user) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-xl sm:rounded-2xl px-3 sm:px-4 py-2 sm:py-2.5 flex items-center gap-2 sm:gap-3 mb-3 sm:mb-6"
    >
      <div className="w-7 h-7 sm:w-8 sm:h-8 bg-[#C19A6B]/15 rounded-full flex items-center justify-center flex-shrink-0">
        <User size={13} className="text-[#C19A6B]" />
      </div>
      <p className="text-[#2C1810]/60 text-[11px] sm:text-xs flex-1">
        <button onClick={() => setIsAuthOpen(true)} className="text-[#C19A6B] font-semibold hover:underline">
          Connectez-vous
        </button>{' '}
        pour passer commande et suivre vos retraits
      </p>
    </motion.div>
  );
}

export default function ClickCollect() {
  const [activeCategory, setActiveCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const resolution = useSlug();
  const { products, boulangerie, loading, source, hasStock } = useCatalogue(resolution?.slug ?? null);

  const filteredProducts = products.filter(p => {
    const matchCategory = activeCategory === 'all' || p.category === activeCategory;
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchCategory && matchSearch;
  });

  const adresseRetrait  = formatAdresseRetrait(boulangerie);
  const creneauxRetrait = boulangerie?.creneaux_retrait ?? ['08:00', '12:00', '16:00'];

  const plagesLabel = creneauxRetrait
    .sort()
    .map(c => heureToPlage(c))
    .join(', ');

  const dernierCreneau = creneauxRetrait.length > 0
    ? [...creneauxRetrait].sort().pop()!
    : '16:00';
  const dernierCreneauFin = parseInt(dernierCreneau.split(':')[0], 10) + 4;

  return (
    <div className="pt-14 sm:pt-20 min-h-screen bg-[#FDFBF7]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-3 sm:py-10">

        <header className="mb-3 sm:mb-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 className="text-lg sm:text-3xl lg:text-4xl font-bold text-[#2C1810]" style={{ fontFamily: 'Playfair Display, serif' }}>
              Click &amp; Collect
            </h1>
            <p className="text-[#2C1810]/55 mt-1 sm:mt-2 text-[11px] sm:text-sm max-w-xl leading-relaxed">
              Commandez en ligne nos pains artisanaux, viennoiseries et pâtisseries.
              Retrait en boutique — paiement sur place.
            </p>
            {!loading && source === 'supabase' && (
              <div className="flex items-center gap-1.5 mt-1.5 sm:mt-3">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-[10px] sm:text-xs text-[#2C1810]/35">Catalogue mis à jour</span>
              </div>
            )}
          </motion.div>
        </header>

        <AuthHint />

        {/* Layout responsive — colonne sur mobile, grille sur lg+ */}
        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-3 sm:gap-8">

          {/* Sidebar — compact sur mobile, sticky sur desktop */}
          <aside className="lg:col-span-1 lg:order-2">
            <div className="lg:sticky lg:top-28 space-y-3 sm:space-y-5">
              <FlashSection />

              <section className="bg-white rounded-xl sm:rounded-2xl p-3 sm:p-5 border border-[#E8E0D5]" aria-label="Informations de retrait">
                <h2 className="text-[#2C1810] font-semibold text-xs sm:text-sm mb-2 sm:mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Informations retrait
                </h2>
                {/* Mobile: horizontal compact — Desktop: vertical list */}
                <div className="hidden sm:block">
                  <ul className="space-y-2.5 text-xs text-[#2C1810]/60">
                    <li className="flex items-start gap-2">
                      <MapPin size={11} className="text-[#C19A6B] mt-0.5 flex-shrink-0" />
                      <span><strong>{adresseRetrait}</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <Clock size={11} className="text-[#C19A6B] mt-0.5 flex-shrink-0" />
                      <span>Créneaux : <strong>{plagesLabel}</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#C19A6B] mt-1 flex-shrink-0" />
                      <span>Paiement <strong>sur place</strong> — espèces ou carte</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-[#C19A6B] mt-1 flex-shrink-0" />
                      <span>Commande conservée jusqu'à <strong>{dernierCreneauFin}h</strong></span>
                    </li>
                    <li className="flex items-start gap-2">
                      <div className="w-2 h-2 rounded-full bg-green-500 mt-1 flex-shrink-0" />
                      <span>Click &amp; Collect <strong className="text-green-600">100% gratuit</strong></span>
                    </li>
                  </ul>
                </div>
                {/* Mobile compact */}
                <ul className="sm:hidden space-y-1.5 text-[11px] text-[#2C1810]/60">
                  <li className="flex items-center gap-1.5">
                    <MapPin size={10} className="text-[#C19A6B] flex-shrink-0" />
                    <span className="truncate"><strong>{adresseRetrait}</strong></span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <Clock size={10} className="text-[#C19A6B] flex-shrink-0" />
                    <span className="truncate">Créneaux : <strong>{plagesLabel}</strong></span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#C19A6B] flex-shrink-0" />
                    <span>Paiement <strong>sur place</strong> · Conservé jusqu'à <strong>{dernierCreneauFin}h</strong></span>
                  </li>
                </ul>
              </section>
            </div>
          </aside>

          <main className="lg:col-span-2 lg:order-1">
            {/* Barre de recherche */}
            <div className="relative mb-2.5 sm:mb-4">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#2C1810]/30" />
              <input
                type="text"
                placeholder="Rechercher un produit…"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full bg-white border border-[#E8E0D5] rounded-xl pl-9 pr-8 py-2 sm:py-2.5 text-xs sm:text-sm text-[#2C1810] placeholder:text-[#2C1810]/30 outline-none focus:border-[#C19A6B]/50 focus:ring-1 focus:ring-[#C19A6B]/20 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#2C1810]/30 hover:text-[#2C1810]/60 transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Filtres catégories — scroll horizontal sur mobile */}
            <nav
              aria-label="Filtrer par catégorie"
              className="flex gap-1.5 sm:gap-2 mb-3 sm:mb-7 overflow-x-auto pb-1 scrollbar-none"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  aria-pressed={activeCategory === cat.id}
                  className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-xs font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
                    activeCategory === cat.id
                      ? 'bg-[#2C1810] text-white'
                      : 'bg-white text-[#2C1810]/70 border border-[#E8E0D5] hover:border-[#C19A6B]/50'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </nav>

            {loading ? (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse border border-[#E8E0D5]/60">
                    <div className="aspect-[4/3] bg-[#E8E0D5]" />
                    <div className="p-3 sm:p-4 space-y-2">
                      <div className="h-3 bg-[#E8E0D5] rounded w-3/4" />
                      <div className="h-3 bg-[#E8E0D5] rounded w-full" />
                      <div className="flex justify-between pt-1">
                        <div className="h-4 bg-[#E8E0D5] rounded w-14" />
                        <div className="w-7 h-7 bg-[#E8E0D5] rounded-full" />
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
                  className="grid grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-4"
                >
                  {filteredProducts.length === 0 ? (
                    <div className="col-span-2 md:col-span-3 text-center py-12">
                      <p className="text-[#2C1810]/40 text-sm">Aucun produit dans cette catégorie</p>
                    </div>
                  ) : (
                    filteredProducts.map((product, index) => (
                      <ProductCard key={product.id} product={product} index={index} hasStockInfo={hasStock} />
                    ))
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}