'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Minus, Plus, ShoppingBag, Trash2, ArrowRight,
  CheckCircle, MapPin, Clock, Mail, AlertCircle, Loader2,
} from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useSlug } from '@/hooks/use-slug';
import { supabase } from '@/lib/supabase';

// ── Types ──────────────────────────────────────────────────────

interface BoulangeriePublicInfo {
  adresse:          string | null;
  ville:            string | null;
  code_postal:      string | null;
  creneaux_retrait: string[];
}

interface ProfilClient {
  prenom:    string;
  telephone: string | null;
}

// ── Conversion créneaux → plages 4h ────────────────────────────

function heureToPlage(heure: string): string {
  const h = parseInt(heure.split(':')[0], 10);
  return `${h}h–${h + 4}h`;
}

function creneauxToPlages(creneaux: string[]): { value: string; label: string }[] {
  if (!creneaux || creneaux.length === 0) {
    return [
      { value: '08:00', label: '8h–12h' },
      { value: '12:00', label: '12h–16h' },
      { value: '16:00', label: '16h–20h' },
    ];
  }
  return [...creneaux].sort().map(c => ({ value: c, label: heureToPlage(c) }));
}

// ── Hook : infos boulangerie ────────────────────────────────────

function useBoulangerieInfo(slug: string | null) {
  const [info, setInfo] = useState<BoulangeriePublicInfo>({
    adresse: null, ville: null, code_postal: null,
    creneaux_retrait: ['08:00', '12:00', '16:00'],
  });

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    fetch(`/api/catalogue/${slug}`)
      .then(r => r.json())
      .then((data: { boulangerie?: BoulangeriePublicInfo }) => {
        if (!cancelled && data?.boulangerie) setInfo(data.boulangerie);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug]);

  return info;
}

// ── Hook : profil client ────────────────────────────────────────
// Récupère le VRAI prénom et téléphone depuis profils_clients
// pour les envoyer correctement dans la commande

function useClientProfil() {
  const [profil, setProfil] = useState<ProfilClient | null>(null);
  const { user } = useCart();

  useEffect(() => {
    if (!user) { setProfil(null); return; }

    async function load() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const res = await fetch('/api/client/profil', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        if (!res.ok) return;

        const { profil: data } = await res.json() as {
          profil: { prenom: string; telephone: string | null } | null
        };
        if (data) setProfil({ prenom: data.prenom, telephone: data.telephone });
      } catch {}
    }
    load();
  }, [user]);

  return profil;
}

function formatAdresse(info: BoulangeriePublicInfo): string {
  const parts = [
    info.adresse,
    info.code_postal && info.ville
      ? `${info.code_postal} ${info.ville}`
      : info.ville,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : '42 Rue de la Boulangerie, 75001 Paris';
}

// ── Écran de confirmation ──────────────────────────────────────

function OrderConfirmation({
  orderNumber, total, heureRetrait, adresse, onClose,
}: {
  orderNumber: string; total: number; heureRetrait: string;
  adresse: string; onClose: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center h-full px-6 py-10 text-center"
    >
      <motion.div
        initial={{ scale: 0 }} animate={{ scale: 1 }}
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
          {[
            { icon: ShoppingBag, label: 'Numéro de commande', value: orderNumber, mono: true },
            { icon: MapPin,      label: 'Retrait en boutique', value: adresse },
            { icon: Clock,       label: 'Créneau de retrait',  value: heureToPlage(heureRetrait) },
            { icon: Mail,        label: 'Confirmation',        value: 'Email envoyé à votre adresse' },
          ].map(({ icon: Icon, label, value, mono }) => (
            <div key={label} className="flex items-center gap-2.5">
              <div className="w-7 h-7 bg-[#C19A6B]/15 rounded-full flex items-center justify-center flex-shrink-0">
                <Icon size={13} className="text-[#C19A6B]" />
              </div>
              <div>
                <p className="text-[#2C1810]/50 text-xs">{label}</p>
                <p className={`text-[#2C1810] text-sm font-medium ${mono ? 'font-mono font-bold' : ''}`}>{value}</p>
              </div>
            </div>
          ))}
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

// ── Sidebar principale ─────────────────────────────────────────

export default function CartSidebar() {
  const {
    isCartOpen, setIsCartOpen,
    items, updateQuantity, removeItem, clearCart,
    totalItems, totalPrice,
    user, setIsAuthOpen,
    boulangerieSlug,
  } = useCart();

  const resolution      = useSlug();
  const boulangerieInfo = useBoulangerieInfo(resolution?.slug ?? boulangerieSlug ?? null);
  const clientProfil    = useClientProfil();

  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [orderNumber, setOrderNumber]       = useState('');
  const [heureRetrait, setHeureRetrait]     = useState('');
  const [selectedHeure, setSelectedHeure]   = useState('');
  const [isSubmitting, setIsSubmitting]     = useState(false);
  const [submitError, setSubmitError]       = useState<string | null>(null);
  const submittingRef = useRef(false);

  const plages = creneauxToPlages(boulangerieInfo.creneaux_retrait);

  useEffect(() => {
    if (plages.length > 0 && !selectedHeure) {
      setSelectedHeure(plages[0].value);
    }
  }, [boulangerieInfo.creneaux_retrait, selectedHeure, plages]);

  const adresseFormatted = formatAdresse(boulangerieInfo);

  // ── Checkout ─────────────────────────────────────────────────

  const handleCheckout = async () => {
    if (!user) { setIsAuthOpen(true); return; }
    if (!selectedHeure) { setSubmitError('Sélectionnez un créneau de retrait'); return; }
    if (submittingRef.current) return;

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // FIX : utilise le vrai prénom depuis profils_clients
      const clientPrenom = clientProfil?.prenom
        ?? user.user_metadata?.prenom
        ?? user.email?.split('@')[0]
        ?? 'Client';

      // FIX : inclut le vrai téléphone depuis profils_clients
      const clientTelephone = clientProfil?.telephone ?? null;

      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boulangerie_slug:  boulangerieSlug,
          client_prenom:     clientPrenom,
          client_email:      user.email!,
          client_telephone:  clientTelephone,
          heure_retrait:     selectedHeure,
          lignes: items.map(({ product, quantity }) => ({
            produit_id:    product.id,
            produit_nom:   product.name,
            quantite:      quantity,
            prix_unitaire: product.price,
          })),
        }),
      });

      const json = await res.json() as { commande_id?: string; error?: string };
      if (!res.ok) { setSubmitError(json.error ?? 'Une erreur est survenue.'); return; }

      setOrderNumber(json.commande_id ?? '');
      setHeureRetrait(selectedHeure);
      setOrderConfirmed(true);
      clearCart();
    } catch {
      setSubmitError('Erreur réseau. Vérifiez votre connexion.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setIsCartOpen(false);
    setOrderConfirmed(false);
    setOrderNumber('');
    setSubmitError(null);
  };

  const TVA       = totalPrice * 0.055;
  const TOTAL_TTC = totalPrice;

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55]"
          />

          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
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
                  <button onClick={clearCart} className="text-white/40 hover:text-white/80 transition-colors text-xs flex items-center gap-1">
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
              {orderConfirmed ? (
                <OrderConfirmation
                  orderNumber={orderNumber} total={TOTAL_TTC}
                  heureRetrait={heureRetrait} adresse={adresseFormatted}
                  onClose={handleClose}
                />
              ) : items.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
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
                        key={product.id} layout
                        initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
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

            {/* Footer */}
            {items.length > 0 && !orderConfirmed && (
              <div className="border-t border-[#E8E0D5] bg-white px-5 py-5 space-y-3">
                {/* Totaux */}
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-[#2C1810]/60">
                    <span>Sous-total HT</span><span>{(totalPrice - TVA).toFixed(2)} €</span>
                  </div>
                  <div className="flex justify-between text-[#2C1810]/60">
                    <span>TVA (5,5%)</span><span>{TVA.toFixed(2)} €</span>
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

                {/* Créneaux — plages horaires */}
                <div>
                  <label className="text-[#2C1810]/60 text-xs font-medium block mb-1.5 flex items-center gap-1.5">
                    <Clock size={12} /> Créneau de retrait
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {plages.map(p => (
                      <button
                        key={p.value}
                        onClick={() => setSelectedHeure(p.value)}
                        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-all border ${
                          selectedHeure === p.value
                            ? 'bg-[#C19A6B] text-white border-[#C19A6B]'
                            : 'bg-[#F5F0E8] text-[#2C1810]/70 border-[#E8E0D5] hover:border-[#C19A6B]/50'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Adresse */}
                <div className="bg-[#F5F0E8] rounded-xl px-3 py-2.5 flex items-start gap-2">
                  <MapPin size={13} className="text-[#C19A6B] mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-[#2C1810]/50 text-xs">Retrait en boutique</p>
                    <p className="text-[#2C1810] text-sm font-medium">{adresseFormatted}</p>
                  </div>
                </div>

                {/* Statut connexion */}
                {user ? (
                  <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                    {clientProfil?.prenom
                      ? <><strong>{clientProfil.prenom}</strong> · {user.email}</>
                      : user.email
                    }
                  </div>
                ) : (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-xs text-amber-700">
                    Vous devrez vous connecter pour finaliser la commande
                  </div>
                )}

                {submitError && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }}
                    className="bg-red-50 border border-red-200 rounded-lg px-3 py-2.5 flex items-start gap-2"
                  >
                    <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-red-600 text-xs">{submitError}</p>
                  </motion.div>
                )}

                <motion.button
                  whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                  onClick={handleCheckout}
                  disabled={isSubmitting || !selectedHeure}
                  className="w-full bg-[#2C1810] hover:bg-[#C19A6B] text-white py-4 rounded-xl font-semibold text-sm transition-colors duration-300 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting
                    ? <><Loader2 size={16} className="animate-spin" /> Envoi en cours…</>
                    : user
                      ? <>Confirmer la commande <ArrowRight size={16} /></>
                      : <>Se connecter pour commander <ArrowRight size={16} /></>
                  }
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