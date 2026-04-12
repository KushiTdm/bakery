'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, MapPin, Clock, CalendarPlus } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useSlug } from '@/hooks/use-slug';
import { categories } from '@/lib/products';
import type { Product } from '@/lib/products';
import FlashSection from '@/components/flash-section';

interface BoulangeriePublicInfo {
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  creneaux_retrait: string[];
}

interface ProductWithStock extends Product {
  stock?: number;
  en_stock?: boolean;
}

function heureToPlage(heure: string): string {
  const h = parseInt(heure.split(':')[0], 10);
  return `${h}h–${h + 4}h`;
}

function useCatalogue(slug: string | null) {
  const [products, setProducts] = useState<ProductWithStock[]>([]);
  const [boulangerie, setBoulangerie] = useState<BoulangeriePublicInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState<'supabase' | 'local'>('local');
  const [hasStock, setHasStock] = useState(false);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/catalogue/${slug}`, { cache: 'no-store' });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as {
          products: ProductWithStock[];
          source: string;
          boulangerie?: BoulangeriePublicInfo;
          hasStock?: boolean;
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

// ── Card produit ── badge catégorie SUPPRIMÉ (dupliqué avec le filtre)
function ProductCard({ product, index, hasStockInfo }: {
  product: ProductWithStock;
  index: number;
  hasStockInfo: boolean;
}) {
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
      transition={{ duration: 0.35, delay: Math.min(index * 0.04, 0.24) }}
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 border border-[#E8E0D5]/60"
    >
      {/* Image — pas de badge catégorie ici pour éviter la duplication */}
      <div className="relative overflow-hidden aspect-[4/3]">
        <img
          src={product.image}
          alt={`${product.name} — artisanal`}
          className={`w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ${isOutOfStock ? 'opacity-60 grayscale-[30%]' : ''}`}
          loading="lazy"
          width={400}
          height={300}
        />
        {/* Badges de stock uniquement */}
        {isOutOfStock && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/65 to-transparent px-3 py-2">
            <span className="text-white text-[10px] sm:text-xs font-semibold">Épuisé aujourd&apos;hui</span>
          </div>
        )}
        {hasStockInfo && !isOutOfStock && typeof product.stock === 'number' && product.stock <= 3 && product.stock > 0 && (
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-amber-900/55 to-transparent px-3 py-2">
            <span className="text-amber-100 text-[10px] sm:text-xs font-semibold">
              Plus que {product.stock} disponible{product.stock > 1 ? 's' : ''}
            </span>
          </div>
        )}
      </div>

      <div className="p-3 sm:p-4">
        <h3 className="font-semibold text-[#2C1810] text-sm leading-tight mb-0.5" style={{ fontFamily: 'Playfair Display, serif' }}>
          {product.name}
        </h3>
        <p className="text-[#2C1810]/50 text-[11px] sm:text-xs mb-2.5 line-clamp-1">{product.description}</p>
        <div className="flex items-center justify-between gap-1">
          <span className="text-base sm:text-lg font-bold text-[#C19A6B]">{product.price.toFixed(2)} €</span>
          {isOutOfStock ? (
            <motion.button
              whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
              onClick={handlePreOrder}
              aria-label={`Réserver ${product.name} pour demain`}
              className="bg-amber-600 text-white px-2 py-1.5 rounded-full hover:bg-amber-500 transition-colors flex items-center gap-1 text-[10px] sm:text-xs font-semibold"
            >
              <CalendarPlus size={12} />
              <span>Demain</span>
            </motion.button>
          ) : (
            <motion.button
              whileHover={{ scale: 1.08 }} whileTap={{ scale: 0.93 }}
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

export default function ClickCollect() {
  const [activeCategory, setActiveCategory] = useState('all');
  const resolution = useSlug();
  const { products, boulangerie, loading, source, hasStock } = useCatalogue(resolution?.slug ?? null);

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter(p => p.category === activeCategory);

  const adresseRetrait = formatAdresseRetrait(boulangerie);
  const creneauxRetrait = boulangerie?.creneaux_retrait ?? ['08:00', '12:00', '16:00'];

  const plagesLabel = creneauxRetrait.sort().map(c => heureToPlage(c)).join(', ');
  const dernierCreneau = creneauxRetrait.length > 0 ? [...creneauxRetrait].sort().pop()! : '16:00';
  const dernierCreneauFin = parseInt(dernierCreneau.split(':')[0], 10) + 4;

  return (
    <div className="pt-16 sm:pt-20 min-h-screen bg-[#FDFBF7]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-10">

        {/* Header */}
        <header className="mb-5 sm:mb-8">
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#2C1810]" style={{ fontFamily: 'Playfair Display, serif' }}>
              Click &amp; Collect
            </h1>
            <p className="text-[#2C1810]/55 mt-1 sm:mt-2 text-xs sm:text-sm max-w-xl">
              Commandez en ligne, retirez en boutique — paiement sur place.
            </p>
            {!loading && source === 'supabase' && (
              <div className="flex items-center gap-1.5 mt-2">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-[10px] sm:text-xs text-[#2C1810]/35">Catalogue mis à jour</span>
              </div>
            )}
          </motion.div>
        </header>

        {/* Layout : sur mobile tout en colonne, lg+ en grille 3 colonnes */}
        <div className="flex flex-col lg:grid lg:grid-cols-3 gap-5 sm:gap-8">

          {/* ── Sidebar (flash + infos) — EN HAUT sur mobile ── */}
          <aside className="lg:col-span-1 lg:order-2 space-y-4 sm:space-y-5">
            {/* Flash section — toujours visible, pas de sticky sur mobile */}
            <FlashSection />

            {/* Infos retrait */}
            <section className="bg-white rounded-2xl p-4 sm:p-5 border border-[#E8E0D5]" aria-label="Informations de retrait">
              <h2 className="text-[#2C1810] font-semibold text-sm mb-3" style={{ fontFamily: 'Playfair Display, serif' }}>
                Informations retrait
              </h2>
              <ul className="space-y-2 text-xs text-[#2C1810]/60">
                <li className="flex items-start gap-2">
                  <MapPin size={11} className="text-[#C19A6B] mt-0.5 flex-shrink-0" />
                  <span><strong className="text-[#2C1810]/80">{adresseRetrait}</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <Clock size={11} className="text-[#C19A6B] mt-0.5 flex-shrink-0" />
                  <span>Créneaux : <strong>{plagesLabel}</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#C19A6B] flex-shrink-0" />
                  <span>Paiement <strong>sur place</strong> — espèces ou carte</span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-[#C19A6B] flex-shrink-0" />
                  <span>Commande conservée jusqu'à <strong>{dernierCreneauFin}h</strong></span>
                </li>
                <li className="flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 flex-shrink-0" />
                  <span>Click &amp; Collect <strong className="text-green-600">100% gratuit</strong></span>
                </li>
              </ul>
            </section>
          </aside>

          {/* ── Produits — EN BAS sur mobile ── */}
          <main className="lg:col-span-2 lg:order-1">
            {/* Filtres catégories — scroll horizontal sur mobile */}
            <nav
              aria-label="Filtrer par catégorie"
              className="flex gap-2 mb-4 sm:mb-6 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide"
            >
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  aria-pressed={activeCategory === cat.id}
                  className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-xs font-medium transition-all duration-200 whitespace-nowrap flex-shrink-0 ${
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
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse border border-[#E8E0D5]/60">
                    <div className="aspect-[4/3] bg-[#E8E0D5]" />
                    <div className="p-3 sm:p-4 space-y-2">
                      <div className="h-3 bg-[#E8E0D5] rounded w-3/4" />
                      <div className="h-3 bg-[#E8E0D5] rounded w-1/2" />
                      <div className="flex justify-between pt-1">
                        <div className="h-4 bg-[#E8E0D5] rounded w-12" />
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
                  className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4"
                >
                  {filteredProducts.length === 0 ? (
                    <div className="col-span-2 sm:col-span-3 text-center py-10">
                      <p className="text-[#2C1810]/40 text-sm">Aucun produit dans cette catégorie</p>
                    </div>
                  ) : (
                    filteredProducts.map((product, index) => (
                      <ProductCard
                        key={product.id}
                        product={product}
                        index={index}
                        hasStockInfo={hasStock}
                      />
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