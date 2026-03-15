'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Clock, X, ShoppingBag, Package, Info, ChevronRight } from 'lucide-react';
import { useFlashPaniers } from '@/hooks/use-flash-paniers';
import { useCart } from '@/context/cart-context';

// ── Modale détail panier ──────────────────────────────────────

interface ModalePanierProps {
  invendus: {
    nom:          string;
    emoji:        string;
    categorie:    string;
    prixOriginal: number;
    prixFlash:    number;
  }[];
  remise:      number;
  heureFin:    number;
  timeLeft:    string;
  onClose:     () => void;
  onAddToCart: () => void;
}

function ModalePanier({ invendus, remise, heureFin, timeLeft, onClose, onAddToCart }: ModalePanierProps) {
  const totalOriginal = invendus.reduce((s, p) => s + p.prixOriginal, 0);
  const totalFlash    = invendus.reduce((s, p) => s + p.prixFlash, 0);
  const economie      = totalOriginal - totalFlash;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        onClick={onClose}
      >
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

        <motion.div
          initial={{ y: 60, opacity: 0, scale: 0.97 }}
          animate={{ y: 0,  opacity: 1, scale: 1 }}
          exit={{   y: 60, opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative w-full max-w-md bg-[#1C1008] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
          onClick={e => e.stopPropagation()}
        >
          {/* Header gradient */}
          <div className="relative bg-gradient-to-r from-[#8B4513] to-[#C19A6B] px-5 py-5">
            <motion.div
              className="absolute inset-0 bg-gradient-to-r from-transparent via-white/8 to-transparent"
              animate={{ x: ['-100%', '100%'] }}
              transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
            />
            <div className="relative flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <div className="bg-yellow-400 rounded-lg p-1">
                    <Zap size={14} className="text-[#2C1810] fill-current" />
                  </div>
                  <span className="text-white font-bold text-base" style={{ fontFamily: 'Playfair Display, serif' }}>
                    Panier Anti-Gaspi
                  </span>
                </div>
                <p className="text-white/65 text-xs">
                  −{remise}% · Jusqu'à {heureFin}h · {timeLeft} restant
                </p>
              </div>
              <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Contenu */}
          <div className="px-5 py-4">
            <p className="text-white/40 text-xs uppercase tracking-widest mb-3">
              Contenu du panier ce soir
            </p>

            <div className="space-y-2 mb-4">
              {invendus.map((produit, i) => (
                <motion.div
                  key={produit.nom}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="flex items-center gap-3 bg-white/5 border border-white/8 rounded-xl px-3 py-2.5"
                >
                  <span className="text-xl flex-shrink-0">{produit.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{produit.nom}</p>
                    <p className="text-white/30 text-xs capitalize">{produit.categorie}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-white/30 text-xs line-through">{produit.prixOriginal.toFixed(2)}€</p>
                    <p className="text-yellow-400 text-sm font-bold">{produit.prixFlash.toFixed(2)}€</p>
                  </div>
                </motion.div>
              ))}
            </div>

            {/* Récap prix */}
            <div className="bg-white/5 border border-white/8 rounded-2xl px-4 py-3 mb-4">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-white/40 text-xs">Valeur normale</span>
                <span className="text-white/40 text-xs line-through">{totalOriginal.toFixed(2)}€</span>
              </div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-green-400 text-xs font-medium">Économie −{remise}%</span>
                <span className="text-green-400 text-xs font-medium">−{economie.toFixed(2)}€</span>
              </div>
              <div className="h-px bg-white/8 my-2" />
              <div className="flex items-center justify-between">
                <span className="text-white font-semibold">Prix flash</span>
                <span className="text-yellow-400 text-xl font-bold font-mono">{totalFlash.toFixed(2)}€</span>
              </div>
            </div>

            {/* Note anti-réservation */}
            <div className="flex items-start gap-2 bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-xl px-3 py-2.5 mb-4">
              <Info size={13} className="text-[#C19A6B] flex-shrink-0 mt-0.5" />
              <p className="text-white/45 text-xs leading-relaxed">
                Paiement sur place uniquement · Pas de réservation · Premier arrivé, premier servi
              </p>
            </div>

            {/* CTA */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={onAddToCart}
              className="w-full bg-gradient-to-r from-[#8B4513] to-[#C19A6B] hover:from-[#C19A6B] hover:to-[#8B4513] text-white py-3.5 rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2"
            >
              <ShoppingBag size={16} />
              Ajouter au panier — {totalFlash.toFixed(2)}€
              <ChevronRight size={14} />
            </motion.button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Hook countdown ────────────────────────────────────────────
// FIX B5 : utilise heureDebut dynamique (depuis l'API) au lieu de 18h hardcodé

function useCountdown(heureDebut: number, heureFin: number) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isLive, setIsLive]     = useState(false);
  const [mounted, setMounted]   = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const tick = () => {
      const now  = new Date();
      const hour = now.getHours();
      // FIX : utilise heureDebut depuis les props (dynamique depuis l'API)
      setIsLive(hour >= heureDebut && hour < heureFin);
      const end = new Date();
      end.setHours(heureFin, 0, 0, 0);
      const diff = Math.max(0, end.getTime() - now.getTime());
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft(`${h}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`);
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [heureDebut, heureFin, mounted]);

  return { timeLeft, isLive };
}

// ── Composant principal ───────────────────────────────────────

export default function FlashSection() {
  const { data, loading }                   = useFlashPaniers();
  const { addItem, user, setIsAuthOpen }    = useCart();
  const [modaleOuverte, setModaleOuverte]   = useState(false);

  const { flashActif, heureDebut, heureFin, remise, nbPaniers, invendus } = data;
  // FIX B5 : passe heureDebut dynamique au hook countdown
  const { timeLeft, isLive } = useCountdown(heureDebut, heureFin);

  const handleAddToCart = () => {
    if (!user) {
      setIsAuthOpen(true);
      setModaleOuverte(false);
      return;
    }

    const totalFlash = invendus.reduce((s, p) => s + p.prixFlash, 0);

    addItem({
      id:          `panier-flash-${Date.now()}`,
      name:        `🛍️ Panier Anti-Gaspi ⚡`,
      description: invendus.map(p => p.nom).join(', '),
      category:    'patisserie',
      price:       parseFloat(totalFlash.toFixed(2)),
      image:       'https://images.unsplash.com/photo-1555507036-ab1f4038808a?w=800&q=80',
    });

    setModaleOuverte(false);
  };

  // État chargement
  if (loading) {
    return (
      <div className="bg-[#2C1810] rounded-3xl p-8 animate-pulse">
        <div className="h-6 bg-white/10 rounded w-3/4 mb-3" />
        <div className="h-4 bg-white/10 rounded w-1/2" />
      </div>
    );
  }

  // Flash inactif (hors horaire)
  if (!isLive) {
    return (
      <div className="bg-[#2C1810] rounded-3xl p-8 text-center">
        <div className="w-14 h-14 bg-[#C19A6B]/15 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <Clock size={26} className="text-[#C19A6B]" />
        </div>
        <h2 className="text-white text-xl font-bold mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
          Invendus du jour — Disponibles à {heureDebut}h
        </h2>
        <p className="text-white/50 text-sm leading-relaxed max-w-sm mx-auto">
          Chaque soir à {heureDebut}h, nos invendus sont proposés à −{remise}%
          jusqu'à épuisement. Premier arrivé, premier servi.
        </p>
        <div className="mt-6 inline-flex items-center gap-2 bg-white/8 border border-white/10 rounded-full px-4 py-2">
          <Info size={13} className="text-[#C19A6B]" />
          <span className="text-white/50 text-xs">Pas de réservation · Paiement en boutique</span>
        </div>
      </div>
    );
  }

  // Flash actif, aucun invendu
  if (nbPaniers === 0 || invendus.length === 0) {
    return (
      <div className="bg-gradient-to-br from-[#2C1810] to-[#8B4513] rounded-3xl p-8 text-center">
        <div className="w-14 h-14 bg-green-500/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Zap size={26} className="text-green-400" />
        </div>
        <h2 className="text-white text-lg font-bold mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
          Flash actif · {timeLeft} restant
        </h2>
        <p className="text-white/50 text-sm">Tous les produits ont été vendus aujourd'hui 🎉</p>
      </div>
    );
  }

  // Flash actif, invendus disponibles
  return (
    <>
      <section
        aria-label="Flash Invendus — paniers anti-gaspi à prix réduit"
        className="relative overflow-hidden bg-gradient-to-br from-[#2C1810] to-[#8B4513] rounded-3xl p-6"
      >
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          aria-hidden="true"
        />

        <div className="relative">
          <div className="flex items-start justify-between mb-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <motion.div
                  animate={{ scale: [1, 1.2, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="bg-yellow-400 rounded-lg p-1.5"
                >
                  <Zap size={14} className="text-[#2C1810] fill-current" />
                </motion.div>
                <h2 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Flash Invendus
                </h2>
                <span className="bg-yellow-400 text-[#2C1810] text-xs font-black px-2 py-0.5 rounded-full">
                  −{remise}%
                </span>
              </div>
              <p className="text-white/55 text-xs">
                Premier arrivé, premier servi · {timeLeft} restant
              </p>
            </div>
            <div className="flex items-center gap-1.5 bg-black/25 rounded-xl px-3 py-2 flex-shrink-0">
              <Package size={13} className="text-yellow-400" />
              <span className="text-white text-sm font-bold">{nbPaniers}</span>
              <span className="text-white/50 text-xs">produit{nbPaniers > 1 ? 's' : ''}</span>
            </div>
          </div>

          {/* Aperçu produits */}
          <div className="flex flex-wrap gap-2 mb-5">
            {invendus.map(produit => (
              <div
                key={produit.nom}
                className="flex items-center gap-1.5 bg-white/10 rounded-xl px-2.5 py-1.5 border border-white/10"
              >
                <span className="text-base">{produit.emoji}</span>
                <span className="text-white/80 text-xs font-medium">{produit.nom}</span>
                <span className="text-yellow-400 text-xs font-bold">{produit.prixFlash.toFixed(2)}€</span>
              </div>
            ))}
          </div>

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setModaleOuverte(true)}
            className="w-full bg-white/15 hover:bg-white/25 border border-white/20 text-white font-bold py-3 rounded-2xl text-sm transition-all flex items-center justify-center gap-2"
          >
            <ShoppingBag size={15} />
            Voir le panier du soir
            <ChevronRight size={14} />
          </motion.button>
        </div>
      </section>

      {modaleOuverte && (
        <ModalePanier
          invendus={invendus}
          remise={remise}
          heureFin={heureFin}
          timeLeft={timeLeft}
          onClose={() => setModaleOuverte(false)}
          onAddToCart={handleAddToCart}
        />
      )}
    </>
  );
}