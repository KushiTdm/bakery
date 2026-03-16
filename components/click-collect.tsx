'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ShoppingBag, MapPin, Clock } from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useSlug } from '@/hooks/use-slug';
import { categories } from '@/lib/products';
import type { Product } from '@/lib/products';
import FlashSection from '@/components/flash-section';

// ── Types ──────────────────────────────────────────────────────

interface BoulangeriePublicInfo {
  adresse:          string | null;
  ville:            string | null;
  code_postal:      string | null;
  creneaux_retrait: string[];
}

// ── Hook catalogue ─────────────────────────────────────────────

function useCatalogue(slug: string | null) {
  const [products,    setProducts]    = useState<Product[]>([]);
  const [boulangerie, setBoulangerie] = useState<BoulangeriePublicInfo | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [source,      setSource]      = useState<'supabase' | 'local'>('local');

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch(`/api/catalogue/${slug}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as {
          products:     Product[];
          source:       string;
          boulangerie?: BoulangeriePublicInfo;
        };
        if (!cancelled) {
          setProducts(data.products ?? []);
          setSource(data.source === 'supabase' ? 'supabase' : 'local');
          // 🆕 Infos boulangerie pour l'adresse dynamique
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

  return { products, boulangerie, loading, source };
}

// ── Formatage adresse ──────────────────────────────────────────

function formatAdresseRetrait(info: BoulangeriePublicInfo | null): string {
  if (!info) return '42 Rue de la Boulangerie, 75001 Paris';
  const parts = [
    info.adresse,
    [info.code_postal, info.ville].filter(Boolean).join(' '),
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '42 Rue de la Boulangerie, 75001 Paris';
}

// ── Card produit ───────────────────────────────────────────────

function ProductCard({ product, index }: { product: Product; index: number }) {
  const { addItem, user, setIsAuthOpen, setPendingProduct } = useCart();

  const handleAdd = () => {
    if (!user) { setPendingProduct(product); setIsAuthOpen(true); return; }
    addItem(product);
  };

  return (
    <motion.article
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-[#E8E0D5]/60"
    >
      <div className="relative overflow-hidden aspect-[4/3]">
        <img
          src={product.image}
          alt={`${product.name} — ${product.category} artisanal`}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
          loading="lazy"
          width={400}
          height={300}
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
            aria-label={`Ajouter ${product.name} au panier`}
            className="bg-[#2C1810] text-white p-2.5 rounded-full hover:bg-[#C19A6B] transition-colors"
          >
            <ShoppingBag size={15} />
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
}

// ── Page principale ────────────────────────────────────────────

export default function ClickCollect() {
  const [activeCategory, setActiveCategory] = useState('all');
  const resolution = useSlug();
  const { products, boulangerie, loading, source } = useCatalogue(resolution?.slug ?? null);

  const filteredProducts = activeCategory === 'all'
    ? products
    : products.filter(p => p.category === activeCategory);

  const adresseRetrait  = formatAdresseRetrait(boulangerie);
  const creneauxRetrait = boulangerie?.creneaux_retrait ?? ['08:00', '09:00', '10:00'];

  // Formate "08:00, 09:00, 10:00" → "8h, 9h, 10h"
  const creneauxLabel = creneauxRetrait
    .map(c => {
      const [h, m] = c.split(':');
      return m === '00' ? `${parseInt(h)}h` : `${parseInt(h)}h${m}`;
    })
    .join(', ');

  // Dernier créneau pour "Commande conservée jusqu'à Xh"
  const dernierCreneau = creneauxRetrait.length > 0
    ? creneauxRetrait[creneauxRetrait.length - 1]
    : '10:00';
  const dernierCreneauLabel = (() => {
    const [h, m] = dernierCreneau.split(':');
    return m === '00' ? `${parseInt(h)}h` : `${parseInt(h)}h${m}`;
  })();

  return (
    <div className="pt-20 min-h-screen bg-[#FDFBF7]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">

        <header className="mb-10">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
            <h1 className="text-3xl sm:text-4xl font-bold text-[#2C1810]" style={{ fontFamily: 'Playfair Display, serif' }}>
              Click &amp; Collect — Boulangerie Paris
            </h1>
            <p className="text-[#2C1810]/55 mt-2 text-sm max-w-xl">
              Commandez en ligne nos pains artisanaux, viennoiseries et pâtisseries.
              Retrait en boutique — paiement sur place.
            </p>
            {!loading && source === 'supabase' && (
              <div className="flex items-center gap-1.5 mt-3">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span className="text-xs text-[#2C1810]/35">Catalogue mis à jour</span>
              </div>
            )}
          </motion.div>
        </header>

        <div className="grid lg:grid-cols-3 gap-8">

          <main className="lg:col-span-2">
            {/* Filtres catégorie */}
            <nav aria-label="Filtrer par catégorie" className="flex flex-wrap gap-2 mb-7">
              {categories.map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setActiveCategory(cat.id)}
                  aria-pressed={activeCategory === cat.id}
                  className={`px-4 py-2 rounded-full text-xs font-medium transition-all duration-200 ${
                    activeCategory === cat.id
                      ? 'bg-[#2C1810] text-white'
                      : 'bg-white text-[#2C1810]/70 border border-[#E8E0D5] hover:border-[#C19A6B]/50'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </nav>

            {/* Grille produits */}
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4" aria-busy="true">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse border border-[#E8E0D5]/60">
                    <div className="aspect-[4/3] bg-[#E8E0D5]" />
                    <div className="p-4 space-y-2">
                      <div className="h-3 bg-[#E8E0D5] rounded w-3/4" />
                      <div className="h-3 bg-[#E8E0D5] rounded w-full" />
                      <div className="flex justify-between pt-1">
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
                  {filteredProducts.map((product, index) => (
                    <ProductCard key={product.id} product={product} index={index} />
                  ))}
                </motion.div>
              </AnimatePresence>
            )}
          </main>

          <aside className="lg:col-span-1">
            <div className="sticky top-28 space-y-5">
              {/* Flash section autonome */}
              <FlashSection />

              {/* 🆕 Informations retrait dynamiques */}
              <section className="bg-white rounded-2xl p-5 border border-[#E8E0D5]" aria-label="Informations de retrait">
                <h2 className="text-[#2C1810] font-semibold text-sm mb-4" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Informations retrait
                </h2>
                <ul className="space-y-2.5 text-xs text-[#2C1810]/60">
                  {/* Adresse dynamique */}
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#C19A6B] mt-1.5 flex-shrink-0" />
                    <p className="flex items-start gap-1">
                      <MapPin size={11} className="text-[#C19A6B] mt-0.5 flex-shrink-0" />
                      <span><strong>{adresseRetrait}</strong></span>
                    </p>
                  </li>
                  {/* Créneaux dynamiques */}
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#C19A6B] mt-1.5 flex-shrink-0" />
                    <p className="flex items-start gap-1">
                      <Clock size={11} className="text-[#C19A6B] mt-0.5 flex-shrink-0" />
                      <span>Retrait disponible à <strong>{creneauxLabel}</strong></span>
                    </p>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#C19A6B] mt-1.5 flex-shrink-0" />
                    <p>Paiement <strong>sur place uniquement</strong> — espèces ou carte</p>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#C19A6B] mt-1.5 flex-shrink-0" />
                    <p>Commande conservée <strong>jusqu'à {dernierCreneauLabel}</strong>, puis libérée</p>
                  </li>
                  <li className="flex items-start gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                    <p>Click & Collect <strong className="text-green-600">100% gratuit</strong></p>
                  </li>
                </ul>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}