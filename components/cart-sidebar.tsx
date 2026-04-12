'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Minus, Plus, ShoppingBag, Trash2, ArrowRight,
  CheckCircle, MapPin, Clock, Mail, AlertCircle, Loader2,
  Calendar, CalendarPlus, ChevronDown,
} from 'lucide-react';
import { useCart } from '@/context/cart-context';
import { useSlug } from '@/hooks/use-slug';
import { supabase } from '@/lib/supabase';

interface BoulangeriePublicInfo {
  adresse: string | null;
  ville: string | null;
  code_postal: string | null;
  creneaux_retrait: string[];
}

interface ProfilClient {
  prenom: string;
  telephone: string | null;
}

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
        const { profil: data } = await res.json() as { profil: { prenom: string; telephone: string | null } | null };
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
    info.code_postal && info.ville ? `${info.code_postal} ${info.ville}` : info.ville,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : 'Adresse en boutique';
}

function formatDateRetrait(dateStr: string | null): string {
  if (!dateStr) return "Aujourd'hui";
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1);
  if (d.toDateString() === today.toDateString()) return "Aujourd'hui";
  if (d.toDateString() === tomorrow.toDateString()) return 'Demain';
  return d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
}

function OrderConfirmation({
  orderNumber, total, heureRetrait, adresse, onClose, isPreOrder, dateRetrait,
}: {
  orderNumber: string; total: number; heureRetrait: string;
  adresse: string; onClose: () => void; isPreOrder: boolean; dateRetrait: string | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex flex-col items-center justify-center px-5 py-8 text-center"
    >
      <motion.div
        initial={{ scale: 0 }} animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 14, delay: 0.1 }}
        className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 ${isPreOrder ? 'bg-amber-100' : 'bg-green-100'}`}
      >
        {isPreOrder ? <CalendarPlus size={32} className="text-amber-600" /> : <CheckCircle size={32} className="text-green-600" />}
      </motion.div>
      <h3 className="text-[#2C1810] text-lg font-bold mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>
        {isPreOrder ? 'Pré-commande confirmée !' : 'Commande confirmée !'}
      </h3>
      <p className="text-[#2C1810]/50 text-sm mb-4">
        Total : <span className="font-bold text-[#C19A6B]">{total.toFixed(2)} €</span>
      </p>
      {isPreOrder && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 mb-4 w-full">
          Retrait prévu <strong>{formatDateRetrait(dateRetrait)}</strong>
        </div>
      )}
      <div className="bg-[#F5F0E8] rounded-2xl p-4 mb-4 space-y-2.5 text-left w-full">
        {[
          { icon: ShoppingBag, label: 'Commande', value: orderNumber, mono: true },
          { icon: MapPin, label: 'Retrait', value: adresse },
          ...(isPreOrder ? [{ icon: Calendar, label: 'Date', value: formatDateRetrait(dateRetrait), mono: false }] : []),
          { icon: Clock, label: 'Créneau', value: heureToPlage(heureRetrait) },
          { icon: Mail, label: 'Email', value: 'Confirmation envoyée' },
        ].map(({ icon: Icon, label, value, mono }) => (
          <div key={label} className="flex items-center gap-2.5">
            <div className="w-7 h-7 bg-[#C19A6B]/15 rounded-full flex items-center justify-center flex-shrink-0">
              <Icon size={13} className="text-[#C19A6B]" />
            </div>
            <div className="min-w-0">
              <p className="text-[#2C1810]/40 text-[10px]">{label}</p>
              <p className={`text-[#2C1810] text-sm font-medium truncate ${mono ? 'font-mono font-bold' : ''}`}>{value}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="text-[#2C1810]/40 text-xs mb-5">Paiement sur place · Espèces ou carte</p>
      <button onClick={onClose} className="w-full bg-[#2C1810] text-white py-3.5 rounded-xl font-semibold text-sm hover:bg-[#C19A6B] transition-colors">
        Fermer
      </button>
    </motion.div>
  );
}

export default function CartSidebar() {
  const {
    isCartOpen, setIsCartOpen,
    items, updateQuantity, removeItem, clearCart,
    totalItems, totalPrice,
    user, setIsAuthOpen,
    boulangerieSlug,
    retraitDate, setRetraitDate, isPreOrder,
  } = useCart();

  const resolution = useSlug();
  const boulangerieInfo = useBoulangerieInfo(resolution?.slug ?? boulangerieSlug ?? null);
  const clientProfil = useClientProfil();

  const [orderConfirmed, setOrderConfirmed] = useState(false);
  const [orderNumber, setOrderNumber] = useState('');
  const [confirmedTotal, setConfirmedTotal] = useState(0);
  const [heureRetrait, setHeureRetrait] = useState('');
  const [selectedHeure, setSelectedHeure] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedPreOrder, setConfirmedPreOrder] = useState(false);
  const [confirmedDateRetrait, setConfirmedDateRetrait] = useState<string | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  const submittingRef = useRef(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener('resize', check, { passive: true });
    return () => window.removeEventListener('resize', check);
  }, []);

  const plages = creneauxToPlages(boulangerieInfo.creneaux_retrait);

  useEffect(() => {
    if (plages.length > 0 && !selectedHeure) setSelectedHeure(plages[0].value);
  }, [boulangerieInfo.creneaux_retrait, selectedHeure, plages]);

  useEffect(() => {
    document.body.style.overflow = isCartOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [isCartOpen]);

  const adresseFormatted = formatAdresse(boulangerieInfo);

  const handleCheckout = async () => {
    if (!user) { setIsAuthOpen(true); return; }
    if (!selectedHeure) { setSubmitError('Sélectionnez un créneau de retrait'); return; }
    if (submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const clientPrenom = clientProfil?.prenom ?? user.user_metadata?.prenom ?? user.email?.split('@')[0] ?? 'Client';
      const clientTelephone = clientProfil?.telephone ?? null;
      let dateRetraitStr: string | null = null;
      if (isPreOrder) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        dateRetraitStr = tomorrow.toLocaleDateString('sv-SE');
      }
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          boulangerie_slug: boulangerieSlug,
          client_prenom: clientPrenom,
          client_email: user.email!,
          client_telephone: clientTelephone,
          heure_retrait: selectedHeure,
          date_retrait: dateRetraitStr,
          lignes: items.map(({ product, quantity }) => ({
            produit_id: product.id,
            produit_nom: product.name,
            quantite: quantity,
            prix_unitaire: product.price,
          })),
        }),
      });
      const json = await res.json() as { commande_id?: string; error?: string };
      if (!res.ok) { setSubmitError(json.error ?? 'Une erreur est survenue.'); return; }
      const rawId = json.commande_id ?? '';
      setOrderNumber(`CMD-${rawId.slice(0, 8).toUpperCase()}`);
      setConfirmedTotal(totalPrice);
      setHeureRetrait(selectedHeure);
      setConfirmedPreOrder(isPreOrder);
      setConfirmedDateRetrait(dateRetraitStr);
      setOrderConfirmed(true);
      clearCart();
      setRetraitDate('today');
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
    setConfirmedTotal(0);
    setSubmitError(null);
    setConfirmedPreOrder(false);
    setConfirmedDateRetrait(null);
  };

  const TVA = totalPrice * 0.055;

  // ── Contenu partagé items ──────────────────────────────────────
  const ItemsList = () => (
    <div className="px-4 space-y-2.5 pb-2">
      <AnimatePresence>
        {items.map(({ product, quantity }) => (
          <motion.div
            key={product.id} layout
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, x: 60 }}
            className="bg-white rounded-2xl p-3 flex gap-3 shadow-sm"
          >
            <div className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0">
              <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[#2C1810] font-semibold text-sm truncate">{product.name}</p>
              <p className="text-[#C19A6B] font-bold text-sm">{product.price.toFixed(2)} €</p>
              <div className="flex items-center gap-2 mt-1.5">
                <button onClick={() => updateQuantity(product.id, quantity - 1)}
                  className="w-7 h-7 rounded-full bg-[#F5F0E8] flex items-center justify-center hover:bg-[#C19A6B] hover:text-white transition-colors">
                  <Minus size={11} />
                </button>
                <span className="text-[#2C1810] font-bold text-sm w-5 text-center">{quantity}</span>
                <button onClick={() => updateQuantity(product.id, quantity + 1)}
                  className="w-7 h-7 rounded-full bg-[#F5F0E8] flex items-center justify-center hover:bg-[#C19A6B] hover:text-white transition-colors">
                  <Plus size={11} />
                </button>
              </div>
            </div>
            <div className="flex flex-col items-end justify-between flex-shrink-0">
              <button onClick={() => removeItem(product.id)} className="text-[#2C1810]/25 hover:text-red-400 transition-colors">
                <X size={14} />
              </button>
              <p className="text-[#2C1810] font-bold text-sm">{(product.price * quantity).toFixed(2)} €</p>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );

  // ── Footer checkout partagé (adapté selon breakpoint via prop) ──
  const CheckoutFooter = ({ compact }: { compact?: boolean }) => (
    <div
      className={`border-t border-[#E8E0D5] bg-white flex-shrink-0 space-y-3 ${compact ? 'px-4 pt-3 pb-4' : 'px-5 py-5'}`}
      style={compact ? { paddingBottom: 'calc(1rem + env(safe-area-inset-bottom, 0px))' } : {}}
    >
      {/* Total */}
      {compact ? (
        <div className="flex justify-between items-center">
          <span className="text-[#2C1810]/60 text-sm">Total TTC</span>
          <span className="text-[#C19A6B] font-bold text-lg">{totalPrice.toFixed(2)} €</span>
        </div>
      ) : (
        <div className="space-y-1.5 text-sm">
          <div className="flex justify-between text-[#2C1810]/60">
            <span>Sous-total HT</span><span>{(totalPrice - TVA).toFixed(2)} €</span>
          </div>
          <div className="flex justify-between text-[#2C1810]/60">
            <span>TVA (5,5%)</span><span>{TVA.toFixed(2)} €</span>
          </div>
          <div className="flex justify-between text-[#2C1810]/60">
            <span>Click &amp; Collect</span><span className="text-green-600 font-medium">Gratuit</span>
          </div>
          <div className="h-px bg-[#E8E0D5] my-1" />
          <div className="flex justify-between text-[#2C1810] font-bold text-base">
            <span>Total TTC</span><span className="text-[#C19A6B]">{totalPrice.toFixed(2)} €</span>
          </div>
        </div>
      )}

      {/* Date retrait */}
      <div className="flex gap-2">
        <button
          onClick={() => setRetraitDate('today')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
            retraitDate === 'today' ? 'bg-[#C19A6B] text-white border-[#C19A6B]' : 'bg-[#F5F0E8] text-[#2C1810]/70 border-[#E8E0D5]'
          }`}
        >
          Aujourd&apos;hui
        </button>
        <button
          onClick={() => setRetraitDate('tomorrow')}
          className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border flex items-center justify-center gap-1.5 ${
            retraitDate === 'tomorrow' ? 'bg-amber-500 text-white border-amber-500' : 'bg-[#F5F0E8] text-[#2C1810]/70 border-[#E8E0D5]'
          }`}
        >
          <CalendarPlus size={13} /> Demain
        </button>
      </div>

      {/* Créneaux — scroll horizontal sur mobile */}
      <div>
        <p className="text-[#2C1810]/50 text-xs mb-1.5 flex items-center gap-1">
          <Clock size={11} /> Créneau de retrait
        </p>
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1">
          {plages.map(p => (
            <button
              key={p.value}
              onClick={() => setSelectedHeure(p.value)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold transition-all border whitespace-nowrap flex-shrink-0 ${
                selectedHeure === p.value ? 'bg-[#C19A6B] text-white border-[#C19A6B]' : 'bg-[#F5F0E8] text-[#2C1810]/70 border-[#E8E0D5]'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {isPreOrder && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-700 flex items-center gap-2">
          <CalendarPlus size={12} className="text-amber-500 flex-shrink-0" />
          Pré-commande — produits préparés spécialement pour demain
        </div>
      )}

      {!compact && (
        <div className="bg-[#F5F0E8] rounded-xl px-3 py-2.5 flex items-start gap-2">
          <MapPin size={13} className="text-[#C19A6B] mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-[#2C1810]/50 text-xs">Retrait en boutique</p>
            <p className="text-[#2C1810] text-sm font-medium">{adresseFormatted}</p>
          </div>
        </div>
      )}

      {user && !compact && (
        <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2 text-xs text-green-700 flex items-center gap-2">
          <div className="w-1.5 h-1.5 bg-green-500 rounded-full" />
          {clientProfil?.prenom ? <><strong>{clientProfil.prenom}</strong> · {user.email}</> : user.email}
        </div>
      )}

      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 flex items-center gap-2">
          <AlertCircle size={13} className="text-red-500 flex-shrink-0" />
          <p className="text-red-600 text-xs">{submitError}</p>
        </div>
      )}

      <motion.button
        whileTap={{ scale: 0.98 }}
        onClick={handleCheckout}
        disabled={isSubmitting || !selectedHeure}
        className="w-full bg-[#2C1810] hover:bg-[#C19A6B] text-white py-4 rounded-2xl font-bold text-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
      >
        {isSubmitting
          ? <><Loader2 size={16} className="animate-spin" /> Envoi…</>
          : user
            ? isPreOrder
              ? <>Confirmer la pré-commande <CalendarPlus size={15} /></>
              : <>Commander — {totalPrice.toFixed(2)} € <ArrowRight size={15} /></>
            : <>Se connecter pour commander <ArrowRight size={15} /></>
        }
      </motion.button>

      <p className="text-center text-[#2C1810]/35 text-[10px]">
        Retrait en boutique · Paiement sur place
      </p>
    </div>
  );

  return (
    <AnimatePresence>
      {isCartOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[55]"
          />

          {/* ── MOBILE : Bottom Sheet ── */}
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-[56] bg-[#FDFBF7] rounded-t-3xl shadow-2xl flex flex-col sm:hidden"
            style={{ maxHeight: '92dvh' }}
          >
            {/* Handle */}
            <div className="flex justify-center pt-3 pb-2 flex-shrink-0">
              <div className="w-10 h-1 bg-[#2C1810]/15 rounded-full" />
            </div>

            {/* Header compact */}
            <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
              <div className="flex items-center gap-2">
                <ShoppingBag size={16} className="text-[#C19A6B]" />
                <h2 className="text-[#2C1810] font-bold text-base" style={{ fontFamily: 'Playfair Display, serif' }}>
                  {orderConfirmed ? 'Commande passée' : isPreOrder ? 'Pré-commande' : 'Mon Panier'}
                </h2>
                {!orderConfirmed && totalItems > 0 && (
                  <span className="bg-[#C19A6B] text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!orderConfirmed && items.length > 0 && (
                  <button onClick={clearCart} className="text-[#2C1810]/40 text-xs flex items-center gap-0.5">
                    <Trash2 size={11} /> Vider
                  </button>
                )}
                <button onClick={handleClose} className="text-[#2C1810]/50 p-1">
                  <ChevronDown size={20} />
                </button>
              </div>
            </div>

            {/* Contenu */}
            <div className="flex-1 overflow-y-auto">
              {orderConfirmed ? (
                <OrderConfirmation
                  orderNumber={orderNumber} total={confirmedTotal}
                  heureRetrait={heureRetrait} adresse={adresseFormatted}
                  onClose={handleClose} isPreOrder={confirmedPreOrder}
                  dateRetrait={confirmedDateRetrait}
                />
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                  <div className="w-14 h-14 bg-[#C19A6B]/10 rounded-full flex items-center justify-center mb-3">
                    <ShoppingBag size={24} className="text-[#C19A6B]/50" />
                  </div>
                  <p className="text-[#2C1810] font-semibold mb-1">Panier vide</p>
                  <p className="text-[#2C1810]/50 text-sm mb-5">Ajoutez des produits pour commander</p>
                  <button onClick={handleClose} className="bg-[#C19A6B] text-white px-5 py-2.5 rounded-full text-sm font-medium">
                    Voir les produits
                  </button>
                </div>
              ) : (
                <ItemsList />
              )}
            </div>

            {items.length > 0 && !orderConfirmed && <CheckoutFooter compact />}
          </motion.div>

          {/* ── DESKTOP : Slide from right ── */}
          <motion.div
            initial={{ x: '100%' }} animate={{ x: 0 }} exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 h-full w-full max-w-md bg-[#FDFBF7] z-[56] flex-col shadow-2xl hidden sm:flex"
          >
            {/* Header desktop */}
            <div className="bg-[#2C1810] px-6 py-5 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <ShoppingBag size={20} className="text-[#C19A6B]" />
                <h2 className="text-white font-bold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
                  {orderConfirmed ? 'Commande passée' : isPreOrder ? 'Pré-commande' : 'Mon Panier'}
                </h2>
                {!orderConfirmed && totalItems > 0 && (
                  <span className="bg-[#C19A6B] text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                {!orderConfirmed && items.length > 0 && (
                  <button onClick={clearCart} className="text-white/40 hover:text-white/80 text-xs flex items-center gap-1">
                    <Trash2 size={12} /> Vider
                  </button>
                )}
                <button onClick={handleClose} className="text-white/60 hover:text-white">
                  <X size={22} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {orderConfirmed ? (
                <OrderConfirmation
                  orderNumber={orderNumber} total={confirmedTotal}
                  heureRetrait={heureRetrait} adresse={adresseFormatted}
                  onClose={handleClose} isPreOrder={confirmedPreOrder}
                  dateRetrait={confirmedDateRetrait}
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
                  <p className="text-[#2C1810]/50 text-sm mb-6">Découvrez notre sélection du jour</p>
                  <button onClick={() => setIsCartOpen(false)} className="bg-[#C19A6B] text-white px-6 py-3 rounded-full text-sm font-medium hover:bg-[#8B4513] transition-colors">
                    Voir la fournée du jour
                  </button>
                </motion.div>
              ) : (
                <div className="p-4 space-y-3">
                  <ItemsList />
                </div>
              )}
            </div>

            {items.length > 0 && !orderConfirmed && <CheckoutFooter />}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}