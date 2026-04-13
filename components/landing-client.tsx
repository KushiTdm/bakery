'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { Store, UtensilsCrossed, ShoppingBag, Clock, MapPin, Phone, ArrowRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useActiveTab }    from '@/context/active-tab-context';
import { useCart }          from '@/context/cart-context';
import { useSlug }          from '@/hooks/use-slug';
import Navbar              from '@/components/navbar';
import Hero                from '@/components/hero';
import ClickCollect        from '@/components/click-collect';
import CartSidebar         from '@/components/cart-sidebar';
import AuthModal           from '@/components/auth-modal';
import LoadingScreen       from '@/components/Loadingscreen';
import FlashBanner         from '@/components/FlashBanner';

interface LandingClientProps {
  savoirFaire: ReactNode;
  footer:      ReactNode;
  vitrine?: {
    hero_image_url?: string | null;
    horaires?:       { day: string; hours: string }[] | null;
  } | null;
  nom?: string | null;
  adresse?: string | null;
  ville?: string | null;
  code_postal?: string | null;
  telephone?: string | null;
}

// ── Section "Nos produits phares" ──────────────────────────────

function FeaturedProducts({ setActiveTab }: { setActiveTab: (tab: 'vitrine' | 'commander') => void }) {
  const resolution = useSlug();
  const [products, setProducts] = useState<{ id: string; name: string; image: string; price: number; category: string }[]>([]);

  useEffect(() => {
    if (!resolution?.slug) return;
    let cancelled = false;
    fetch(`/api/catalogue/${resolution.slug}`, { cache: 'no-store' })
      .then(r => r.json())
      .then((data: { products?: { id: string; name: string; image: string; price: number; category: string }[] }) => {
        if (!cancelled && data.products) {
          // Prendre 4 produits variés (1 par catégorie si possible)
          const seen = new Set<string>();
          const featured: typeof products = [];
          for (const p of data.products) {
            if (featured.length >= 4) break;
            if (!seen.has(p.category)) {
              featured.push(p);
              seen.add(p.category);
            }
          }
          // Compléter si moins de 4
          for (const p of data.products) {
            if (featured.length >= 4) break;
            if (!featured.find(f => f.id === p.id)) featured.push(p);
          }
          setProducts(featured);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [resolution?.slug]);

  if (products.length === 0) return null;

  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-[#FDFBF7]">
      <div className="max-w-5xl mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <p className="text-[#C19A6B] text-xs font-medium tracking-[0.3em] uppercase mb-3">
            Nos spécialités
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1810]" style={{ fontFamily: 'Playfair Display, serif' }}>
            La fournée du jour
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-5">
          {products.map((product, i) => (
            <motion.div
              key={product.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.1 }}
              className="group bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all duration-300 border border-[#E8E0D5]/60"
            >
              <div className="relative overflow-hidden aspect-[4/3]">
                <img
                  src={product.image}
                  alt={product.name}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  loading="lazy"
                />
                <span className="absolute top-2 left-2 bg-white/90 text-[#2C1810] text-[10px] font-medium px-2 py-0.5 rounded-full capitalize backdrop-blur-sm">
                  {product.category}
                </span>
              </div>
              <div className="p-3 sm:p-4">
                <h3 className="font-semibold text-[#2C1810] text-xs sm:text-sm" style={{ fontFamily: 'Playfair Display, serif' }}>
                  {product.name}
                </h3>
                <p className="text-[#C19A6B] font-bold text-sm sm:text-base mt-1">{product.price.toFixed(2)} €</p>
              </div>
            </motion.div>
          ))}
        </div>

        <div className="text-center mt-8 sm:mt-10">
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setActiveTab('commander')}
            className="inline-flex items-center gap-2 bg-[#C19A6B] text-white px-6 sm:px-8 py-3 sm:py-3.5 rounded-full text-sm font-semibold hover:bg-[#8B4513] transition-colors shadow-md"
          >
            Commander en ligne
            <ArrowRight size={16} />
          </motion.button>
        </div>
      </div>
    </section>
  );
}

// ── Section "Horaires & Accès" ────────────────────────────────

function HorairesAcces({
  horaires, adresse, ville, code_postal, telephone,
}: {
  horaires?: { day: string; hours: string }[] | null;
  adresse?: string | null;
  ville?: string | null;
  code_postal?: string | null;
  telephone?: string | null;
}) {
  if (!horaires?.length && !adresse) return null;

  return (
    <section className="py-12 sm:py-20 px-4 sm:px-6 lg:px-8 bg-[#F5F0E8]">
      <div className="max-w-4xl mx-auto">
        <div className="text-center mb-8 sm:mb-12">
          <p className="text-[#C19A6B] text-xs font-medium tracking-[0.3em] uppercase mb-3">
            Pratique
          </p>
          <h2 className="text-3xl sm:text-4xl font-bold text-[#2C1810]" style={{ fontFamily: 'Playfair Display, serif' }}>
            Horaires & Accès
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-6 sm:gap-8">
          {/* Horaires */}
          {horaires && horaires.length > 0 && (
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#E8E0D5]/60"
            >
              <div className="flex items-center gap-2.5 mb-4 sm:mb-5">
                <div className="w-9 h-9 bg-[#C19A6B]/10 rounded-xl flex items-center justify-center">
                  <Clock size={18} className="text-[#C19A6B]" />
                </div>
                <h3 className="text-[#2C1810] font-semibold text-base sm:text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Horaires d'ouverture
                </h3>
              </div>
              <div className="space-y-2.5">
                {horaires.map(h => (
                  <div key={h.day} className="flex items-center justify-between py-1 border-b border-[#E8E0D5]/50 last:border-0">
                    <span className="text-[#2C1810] text-sm font-medium">{h.day}</span>
                    <span className="text-[#2C1810]/60 text-sm">{h.hours}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* Adresse & Contact */}
          {adresse && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm border border-[#E8E0D5]/60"
            >
              <div className="flex items-center gap-2.5 mb-4 sm:mb-5">
                <div className="w-9 h-9 bg-[#C19A6B]/10 rounded-xl flex items-center justify-center">
                  <MapPin size={18} className="text-[#C19A6B]" />
                </div>
                <h3 className="text-[#2C1810] font-semibold text-base sm:text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Nous trouver
                </h3>
              </div>
              <div className="space-y-3 text-sm text-[#2C1810]/70">
                <div className="flex items-start gap-2.5">
                  <MapPin size={14} className="text-[#C19A6B] mt-0.5 flex-shrink-0" />
                  <p>
                    {adresse}<br />
                    {code_postal && <>{code_postal} </>}{ville}
                  </p>
                </div>
                {telephone && (
                  <div className="flex items-center gap-2.5">
                    <Phone size={14} className="text-[#C19A6B] flex-shrink-0" />
                    <a href={`tel:${telephone.replace(/\s/g, '')}`} className="text-[#C19A6B] font-medium hover:underline">
                      {telephone}
                    </a>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  );
}

// ── Bottom bar mobile ─────────────────────────────────────────

function MobileBottomBar({
  activeTab,
  setActiveTab,
}: {
  activeTab: 'vitrine' | 'commander';
  setActiveTab: (tab: 'vitrine' | 'commander') => void;
}) {
  const { totalItems, setIsCartOpen } = useCart();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-[#FDFBF7]/95 backdrop-blur-md border-t border-[#E8E0D5] shadow-[0_-2px_10px_rgba(0,0,0,0.06)]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Navigation principale"
    >
      <div className="flex items-center justify-around h-14">
        {/* Vitrine */}
        <button
          onClick={() => { setActiveTab('vitrine'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
            activeTab === 'vitrine'
              ? 'text-[#2C1810]'
              : 'text-[#2C1810]/40'
          }`}
        >
          <Store size={20} strokeWidth={activeTab === 'vitrine' ? 2.2 : 1.5} />
          <span className="text-[10px] font-semibold">Vitrine</span>
          {activeTab === 'vitrine' && (
            <motion.div layoutId="mobile-tab-indicator" className="absolute bottom-0 h-0.5 w-12 bg-[#2C1810] rounded-full" />
          )}
        </button>

        {/* Commander */}
        <button
          onClick={() => setActiveTab('commander')}
          className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
            activeTab === 'commander'
              ? 'text-[#C19A6B]'
              : 'text-[#2C1810]/40'
          }`}
        >
          <UtensilsCrossed size={20} strokeWidth={activeTab === 'commander' ? 2.2 : 1.5} />
          <span className="text-[10px] font-semibold">Commander</span>
          {activeTab === 'commander' && (
            <motion.div layoutId="mobile-tab-indicator" className="absolute bottom-0 h-0.5 w-12 bg-[#C19A6B] rounded-full" />
          )}
        </button>

        {/* Panier */}
        <button
          onClick={() => {
            if (activeTab !== 'commander') setActiveTab('commander');
            setIsCartOpen(true);
          }}
          className="flex flex-col items-center justify-center gap-0.5 flex-1 h-full text-[#2C1810]/40 relative"
          aria-label={`Panier — ${totalItems} article${totalItems > 1 ? 's' : ''}`}
        >
          <div className="relative">
            <ShoppingBag size={20} strokeWidth={1.5} />
            <AnimatePresence>
              {totalItems > 0 && (
                <motion.span
                  key="badge"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  exit={{ scale: 0 }}
                  className="absolute -top-1.5 -right-2.5 bg-[#C19A6B] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center"
                >
                  {totalItems > 9 ? '9+' : totalItems}
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <span className="text-[10px] font-semibold">Panier</span>
        </button>
      </div>
    </nav>
  );
}

export default function LandingClient({
  savoirFaire,
  footer,
  vitrine,
  nom,
  adresse,
  ville,
  code_postal,
  telephone,
}: LandingClientProps) {
  const { activeTab, setActiveTab } = useActiveTab();
  const [loading, setLoading]       = useState(true);

  return (
    <>
      {loading && <LoadingScreen onFinish={() => setLoading(false)} nom={nom} />}
      <FlashBanner activeTab={activeTab} setActiveTab={setActiveTab} />

      <Navbar activeTab={activeTab} setActiveTab={setActiveTab} nom={nom} />

      <main className="min-h-screen pb-16 md:pb-0">
        {activeTab === 'vitrine' ? (
          <>
            <Hero
              heroImage={vitrine?.hero_image_url}
              nom={nom}
            />
            {savoirFaire}
            <FeaturedProducts setActiveTab={setActiveTab} />
            <HorairesAcces
              horaires={vitrine?.horaires}
              adresse={adresse}
              ville={ville}
              code_postal={code_postal}
              telephone={telephone}
            />
            {footer}
          </>
        ) : (
          <ClickCollect />
        )}
      </main>

      {/* Bottom bar mobile — toujours visible */}
      <MobileBottomBar activeTab={activeTab} setActiveTab={setActiveTab} />

      <CartSidebar />
      <AuthModal />
    </>
  );
}
