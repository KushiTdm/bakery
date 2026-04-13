'use client';
// components/flash-section.tsx
// Section flash côté client — affiche les produits disponibles avec
// allergènes, quantités, économies et modal détail du panier.

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, Clock, X, ShoppingBag, Package, Info, ChevronRight, AlertTriangle, Loader2, Check } from 'lucide-react';
import { useFlashPaniers } from '@/hooks/use-flash-paniers';
import { useCart } from '@/context/cart-context';
import { useSlug } from '@/hooks/use-slug';
import { supabase } from '@/lib/supabase';

// ── Types étendus (alignés avec la nouvelle fonction SQL) ─────

interface InvenduItem {
  nom:          string;
  emoji:        string;
  categorie:    string;
  prixOriginal: number;
  prixFlash:    number;
  quantite:     number;
  allergenes:   string[];
}

// ── Mapping noms français allergènes ─────────────────────────

const ALLERGENE_LABEL: Record<string, string> = {
  gluten:         'Gluten',
  crustaces:      'Crustacés',
  oeufs:          'Œufs',
  poisson:        'Poisson',
  arachides:      'Arachides',
  soja:           'Soja',
  lait:           'Lait',
  fruits_a_coque: 'Fruits à coque',
  celeri:         'Céleri',
  moutarde:       'Moutarde',
  sesame:         'Sésame',
  sulfites:       'Sulfites',
  lupin:          'Lupin',
  mollusques:     'Mollusques',
};

function allergenLabel(a: string): string {
  return ALLERGENE_LABEL[a] ?? a;
}

// ── Hook countdown ────────────────────────────────────────────

function useCountdown(heureDebut: number, heureFin: number) {
  const [timeLeft, setTimeLeft] = useState('');
  const [isLive,   setIsLive]   = useState(false);
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!mounted) return;
    const tick = () => {
      const now  = new Date();
      const hour = now.getHours();
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

// ── Modal détail panier ───────────────────────────────────────

function ModalePanier({
  invendus,
  remise,
  heureFin,
  timeLeft,
  onClose,
  onPurchase,
  purchasing,
  purchaseOk,
  purchaseError,
}: {
  invendus:      InvenduItem[];
  remise:        number;
  heureFin:      number;
  timeLeft:      string;
  onClose:       () => void;
  onPurchase:    () => void;
  purchasing:    boolean;
  purchaseOk:    boolean;
  purchaseError: string | null;
}) {
  const totalOriginal = invendus.reduce((s, p) => s + p.prixOriginal, 0);
  const totalFlash    = invendus.reduce((s, p) => s + p.prixFlash,    0);
  const economie      = totalOriginal - totalFlash;

  // Tous les allergènes uniques du panier
  const allergenesTous = [...new Set(invendus.flatMap(p => p.allergenes ?? []))];

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
          exit={{   y: 60,  opacity: 0, scale: 0.97 }}
          transition={{ type: 'spring', damping: 28, stiffness: 300 }}
          className="relative w-full max-w-md bg-[#1C1008] border border-white/10 rounded-3xl overflow-hidden shadow-2xl max-h-[90vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative bg-gradient-to-r from-[#8B4513] to-[#C19A6B] px-5 py-5 flex-shrink-0">
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
                    Panier Anti-Gaspi du soir
                  </span>
                </div>
                <p className="text-white/65 text-xs">
                  −{remise}% · Jusqu'à {heureFin}h · {timeLeft} restant
                </p>
              </div>
              <button onClick={onClose} className="text-white/50 hover:text-white transition-colors p-1 flex-shrink-0">
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Contenu scrollable */}
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">

            {/* Liste des produits */}
            <div>
              <p className="text-white/40 text-xs uppercase tracking-widest mb-3">
                {invendus.length} produit{invendus.length > 1 ? 's' : ''} disponible{invendus.length > 1 ? 's' : ''}
              </p>
              <div className="space-y-2">
                {invendus.map((produit, i) => (
                  <motion.div
                    key={produit.nom}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="bg-white/5 border border-white/8 rounded-2xl px-4 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-2xl flex-shrink-0 mt-0.5">{produit.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-white font-medium text-sm">{produit.nom}</p>
                          <div className="text-right flex-shrink-0">
                            <p className="text-white/30 text-xs line-through font-mono">
                              {produit.prixOriginal.toFixed(2)}€
                            </p>
                            <p className="text-yellow-400 text-sm font-bold font-mono">
                              {produit.prixFlash.toFixed(2)}€
                            </p>
                          </div>
                        </div>

                        {/* Quantité restante */}
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="flex items-center gap-1">
                            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              produit.quantite <= 1 ? 'bg-red-400' :
                              produit.quantite <= 3 ? 'bg-amber-400' : 'bg-green-400'
                            }`} />
                            <span className="text-white/40 text-xs">
                              {produit.quantite} restant{produit.quantite > 1 ? 's' : ''}
                            </span>
                          </div>
                          <span className="text-white/20 text-xs">·</span>
                          <span className="text-white/35 text-xs capitalize">{produit.categorie}</span>
                        </div>

                        {/* Allergènes du produit */}
                        {produit.allergenes && produit.allergenes.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {produit.allergenes.map(a => (
                              <span
                                key={a}
                                className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/12 border border-amber-400/20 text-amber-400/80"
                              >
                                {allergenLabel(a)}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Récapitulatif prix */}
            <div className="bg-white/5 border border-white/8 rounded-2xl px-4 py-3 space-y-2">
              <div className="flex justify-between text-xs text-white/40">
                <span>Valeur normale</span>
                <span className="line-through font-mono">{totalOriginal.toFixed(2)}€</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-green-400 font-medium">Remise −{remise}%</span>
                <span className="text-green-400 font-mono">−{economie.toFixed(2)}€</span>
              </div>
              <div className="h-px bg-white/8" />
              <div className="flex justify-between items-center">
                <span className="text-white font-semibold">Prix flash</span>
                <span className="text-yellow-400 text-xl font-bold font-mono">{totalFlash.toFixed(2)}€</span>
              </div>
            </div>

            {/* Tous les allergènes du panier */}
            {allergenesTous.length > 0 && (
              <div className="bg-amber-400/8 border border-amber-400/20 rounded-2xl px-4 py-3">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle size={13} className="text-amber-400 flex-shrink-0" />
                  <p className="text-amber-400 text-xs font-semibold uppercase tracking-wide">
                    Allergènes dans ce panier
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allergenesTous.map(a => (
                    <span
                      key={a}
                      className="text-xs px-2.5 py-1 rounded-full bg-amber-400/15 border border-amber-400/25 text-amber-300 font-medium"
                    >
                      {allergenLabel(a)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Note paiement */}
            <div className="flex items-start gap-2 bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-xl px-3 py-2.5">
              <Info size={13} className="text-[#C19A6B] flex-shrink-0 mt-0.5" />
              <p className="text-white/45 text-xs leading-relaxed">
                Réservation en ligne · Paiement sur place ·
                Retrait avant la fermeture du flash
              </p>
            </div>
          </div>

          {/* Footer CTA */}
          <div className="flex-shrink-0 px-5 pb-5 pt-3 border-t border-white/8 space-y-2">
            {purchaseError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 flex items-center gap-2">
                <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
                <p className="text-red-300 text-xs">{purchaseError}</p>
              </div>
            )}
            {purchaseOk ? (
              <div className="bg-green-500/15 border border-green-500/25 rounded-2xl py-3.5 flex items-center justify-center gap-2">
                <Check size={16} className="text-green-400" />
                <span className="text-green-400 font-bold text-sm">Commande confirmée !</span>
              </div>
            ) : (
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                onClick={onPurchase}
                disabled={purchasing}
                className="w-full bg-gradient-to-r from-[#8B4513] to-[#C19A6B] hover:from-[#C19A6B] hover:to-[#8B4513] text-white py-3.5 rounded-2xl font-bold text-sm transition-all shadow-lg flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {purchasing ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <ShoppingBag size={16} />
                )}
                {purchasing ? 'Réservation...' : `Réserver mon panier — ${totalFlash.toFixed(2)}€`}
              </motion.button>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ── Composant principal ───────────────────────────────────────

export default function FlashSection() {
  const { data, loading, refetch }        = useFlashPaniers();
  const { user, setIsAuthOpen }           = useCart();
  const resolution                         = useSlug();
  const [modaleOuverte, setModaleOuverte] = useState(false);
  const [purchasing,    setPurchasing]    = useState(false);
  const [purchaseOk,    setPurchaseOk]    = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);

  const { flashActif, heureDebut, heureFin, remise, nbPaniers } = data;

  // Cast invendus avec le nouveau champ quantite + allergenes
  const invendus = (data.invendus as InvenduItem[]) ?? [];

  const { timeLeft, isLive } = useCountdown(heureDebut, heureFin);

  const handlePurchase = async () => {
    if (!user) {
      setIsAuthOpen(true);
      setModaleOuverte(false);
      return;
    }

    if (!resolution?.slug) return;

    setPurchasing(true);
    setPurchaseError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setIsAuthOpen(true);
        return;
      }

      const res = await fetch(`/api/paniers/${resolution.slug}/acheter`, {
        method: 'POST',
        headers: {
          'Content-Type':  'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ panier_complet: true }),
      });

      if (res.ok) {
        setPurchaseOk(true);
        refetch(); // Rafraîchir les quantités
        setTimeout(() => {
          setModaleOuverte(false);
          setPurchaseOk(false);
        }, 2500);
      } else {
        const err = await res.json().catch(() => ({ error: 'Erreur inconnue' })) as { error?: string };
        setPurchaseError(err.error ?? 'Erreur lors de l\'achat');
      }
    } catch {
      setPurchaseError('Erreur réseau');
    } finally {
      setPurchasing(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-[#2C1810] rounded-2xl sm:rounded-3xl p-5 sm:p-8 animate-pulse">
        <div className="h-5 sm:h-6 bg-white/10 rounded w-3/4 mb-3" />
        <div className="h-4 bg-white/10 rounded w-1/2" />
      </div>
    );
  }

  // Flash inactif (hors horaire)
  if (!isLive) {
    return (
      <div className="bg-[#2C1810] rounded-2xl sm:rounded-3xl p-4 sm:p-8 text-center overflow-hidden">
        <div className="w-10 h-10 sm:w-14 sm:h-14 bg-[#C19A6B]/15 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-5">
          <Clock size={20} className="text-[#C19A6B] sm:hidden" />
          <Clock size={26} className="text-[#C19A6B] hidden sm:block" />
        </div>
        <h2 className="text-white text-sm sm:text-xl font-bold mb-1.5 sm:mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
          Invendus du jour — disponibles à {heureDebut}h
        </h2>
        <p className="text-white/50 text-[11px] sm:text-sm leading-relaxed max-w-sm mx-auto">
          Chaque soir à {heureDebut}h, nos invendus sont proposés à −{remise}%
          jusqu'à {heureFin}h ou épuisement.
        </p>
        <div className="mt-3 sm:mt-6 inline-flex items-center gap-1.5 sm:gap-2 bg-white/8 border border-white/10 rounded-full px-3 sm:px-4 py-1.5 sm:py-2">
          <Info size={11} className="text-[#C19A6B]" />
          <span className="text-white/50 text-[10px] sm:text-xs">Pas de réservation · Paiement en boutique</span>
        </div>
      </div>
    );
  }

  // Flash actif mais aucun produit disponible
  if (nbPaniers === 0 || invendus.length === 0) {
    return (
      <div className="bg-gradient-to-br from-[#2C1810] to-[#8B4513] rounded-2xl sm:rounded-3xl p-4 sm:p-8 text-center">
        <div className="w-10 h-10 sm:w-14 sm:h-14 bg-green-500/20 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-3 sm:mb-4">
          <Zap size={20} className="text-green-400 sm:hidden" />
          <Zap size={26} className="text-green-400 hidden sm:block" />
        </div>
        <h2 className="text-white text-sm sm:text-lg font-bold mb-1.5 sm:mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
          Flash actif · {timeLeft} restant
        </h2>
        <p className="text-white/50 text-[11px] sm:text-sm">Tous les produits ont été vendus aujourd&apos;hui</p>
      </div>
    );
  }

  // ── Flash actif avec produits disponibles ─────────────────────

  // Tous les allergènes uniques pour le résumé
  const tousAllergenes = [...new Set(invendus.flatMap(p => p.allergenes ?? []))];

  return (
    <>
      <section
        aria-label="Flash Invendus — paniers anti-gaspi à prix réduit"
        className="relative overflow-hidden bg-gradient-to-br from-[#2C1810] to-[#8B4513] rounded-2xl sm:rounded-3xl p-4 sm:p-6"
      >
        <motion.div
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent pointer-events-none"
          animate={{ x: ['-100%', '100%'] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
          aria-hidden="true"
        />

        <div className="relative">
          {/* En-tête */}
          <div className="flex items-start justify-between mb-4">
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

          {/* Liste des produits — aperçu compact */}
          <div className="space-y-2 mb-4">
            {invendus.map((produit) => (
              <div
                key={produit.nom}
                className="flex items-center gap-3 bg-white/10 rounded-2xl px-3 py-2.5 border border-white/10"
              >
                <span className="text-xl flex-shrink-0">{produit.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white/90 text-sm font-medium truncate">{produit.nom}</p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {/* Quantité avec indicateur couleur */}
                    <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                      produit.quantite <= 1 ? 'bg-red-400' :
                      produit.quantite <= 3 ? 'bg-amber-400' : 'bg-green-400'
                    }`} />
                    <span className="text-white/45 text-xs">
                      {produit.quantite} restant{produit.quantite > 1 ? 's' : ''}
                    </span>
                    {/* Allergènes résumé */}
                    {produit.allergenes && produit.allergenes.length > 0 && (
                      <>
                        <span className="text-white/20 text-xs">·</span>
                        <span className="text-amber-400/70 text-xs">
                          {produit.allergenes.length} allergène{produit.allergenes.length > 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-white/35 text-xs line-through font-mono">
                    {produit.prixOriginal.toFixed(2)}€
                  </p>
                  <p className="text-yellow-400 text-sm font-bold font-mono">
                    {produit.prixFlash.toFixed(2)}€
                  </p>
                </div>
              </div>
            ))}
          </div>

          {/* Allergènes résumé si présents */}
          {tousAllergenes.length > 0 && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              <AlertTriangle size={12} className="text-amber-400/70 flex-shrink-0" />
              <span className="text-amber-400/70 text-xs">Contient :</span>
              {tousAllergenes.slice(0, 4).map(a => (
                <span key={a} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-400/15 border border-amber-400/20 text-amber-400/80">
                  {allergenLabel(a)}
                </span>
              ))}
              {tousAllergenes.length > 4 && (
                <span className="text-amber-400/60 text-xs">+{tousAllergenes.length - 4}</span>
              )}
            </div>
          )}

          {/* CTA */}
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => setModaleOuverte(true)}
            className="w-full bg-white/15 hover:bg-white/25 border border-white/20 text-white font-bold py-3 rounded-2xl text-sm transition-all flex items-center justify-center gap-2"
          >
            <ShoppingBag size={15} />
            Réserver mon panier · détail + allergènes
            <ChevronRight size={14} />
          </motion.button>
        </div>
      </section>

      {/* Modal détail */}
      {modaleOuverte && (
        <ModalePanier
          invendus={invendus}
          remise={remise}
          heureFin={heureFin}
          timeLeft={timeLeft}
          onClose={() => { setModaleOuverte(false); setPurchaseError(null); }}
          onPurchase={handlePurchase}
          purchasing={purchasing}
          purchaseOk={purchaseOk}
          purchaseError={purchaseError}
        />
      )}
    </>
  );
}