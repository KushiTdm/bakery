'use client';

import { useState, useEffect, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { useCart } from '@/context/cart-context';
import { Zap, Phone, User, Shield, Check, ChevronRight, Loader2 } from 'lucide-react';

type Step = 'email' | 'otp' | 'profil';

export default function AuthModal() {
  const { isAuthOpen, setIsAuthOpen } = useCart();

  const [email,   setEmail]   = useState('');
  const [step,    setStep]    = useState<Step>('email');
  const [otp,     setOtp]     = useState('');
  const [error,   setError]   = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // Champs étape 2
  const [prenom,         setPrenom]         = useState('');
  const [telephone,      setTelephone]      = useState('');
  const [optinFlash,     setOptinFlash]     = useState(true);
  const [rgpdAccepted,   setRgpdAccepted]   = useState(false);
  const [savingProfil,   setSavingProfil]   = useState(false);
  const [profilError,    setProfilError]    = useState<string | null>(null);

  // Écoute l'auth → décide si on passe à l'étape profil
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event: AuthChangeEvent, session: Session | null) => {
        if (!session?.user?.email) return;

        // Vérifie si le profil est déjà complété
        const res = await fetch('/api/client/profil', {
          headers: { Authorization: `Bearer ${session.access_token}` },
        });
        const { profil } = await res.json() as { profil: { profil_completed: boolean; prenom: string } | null };

        if (profil?.profil_completed) {
          // Profil existant → ferme directement
          setIsAuthOpen(false);
        } else {
          // Nouveau client → étape 2
          if (profil?.prenom) setPrenom(profil.prenom);
          setStep('profil');
        }
      }
    );
    return () => subscription.unsubscribe();
  }, [setIsAuthOpen]);

  useEffect(() => {
    if (!isAuthOpen) {
      setTimeout(() => {
        setStep('email');
        setOtp('');
        setPrenom('');
        setTelephone('');
        setOptinFlash(true);
        setRgpdAccepted(false);
        setError(null);
        setProfilError(null);
      }, 300);
    }
  }, [isAuthOpen]);

  if (!isAuthOpen) return null;

  const handleClose = () => setIsAuthOpen(false);

  // ── Étape 1a : envoi OTP ──────────────────────────────────
  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: true },
      });
      if (error) { setError(error.message); return; }
      setStep('otp');
    });
  }

  // ── Étape 1b : vérification OTP ───────────────────────────
  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.verifyOtp({
        email, token: otp, type: 'email',
      });
      if (error) { setError('Code invalide ou expiré.'); return; }
      // L'auth state change va déclencher la vérification profil
    });
  }

  // ── Étape 2 : sauvegarde profil ───────────────────────────
  async function handleSaveProfil(e: React.FormEvent) {
    e.preventDefault();
    setProfilError(null);

    if (!prenom.trim()) { setProfilError('Votre prénom est requis'); return; }
    if (!rgpdAccepted)  { setProfilError('Vous devez accepter la politique de confidentialité'); return; }

    setSavingProfil(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      const res = await fetch('/api/client/profil', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          prenom:         prenom.trim(),
          telephone:      telephone.trim() || null,
          optin_flash:    optinFlash,
          optin_marketing: false,
          rgpd_accepted:  true,
        }),
      });

      if (!res.ok) {
        const j = await res.json() as { error?: string };
        setProfilError(j.error ?? 'Erreur de sauvegarde');
        return;
      }

      setIsAuthOpen(false);
    } finally {
      setSavingProfil(false);
    }
  }

  // ── Rendu ─────────────────────────────────────────────────
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto">
        <motion.div
          key={step}
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="bg-[#1A0F0A] border border-white/12 rounded-2xl shadow-2xl overflow-hidden"
        >

          {/* ── Étape email ─────────────────────────────── */}
          {step === 'email' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-white font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
                    Votre commande
                  </h2>
                  <p className="text-white/35 text-xs mt-0.5">Connectez-vous pour finaliser</p>
                </div>
                <button onClick={handleClose} className="text-white/25 hover:text-white/50 transition-colors text-xl">×</button>
              </div>
              <form onSubmit={handleSendOTP} className="space-y-4">
                <input
                  type="email"
                  placeholder="votre@email.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required autoFocus
                  className="w-full bg-black/30 border border-white/12 rounded-xl px-4 py-3 text-white placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
                />
                {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                <button type="submit" disabled={isPending}
                  className="w-full bg-[#C19A6B] text-[#1A0F0A] py-3 rounded-xl font-bold disabled:opacity-50 hover:bg-[#D4AE85] transition-colors">
                  {isPending ? 'Envoi…' : 'Continuer →'}
                </button>
                <p className="text-white/18 text-xs text-center">Un code à 6 chiffres vous sera envoyé</p>
              </form>
            </div>
          )}

          {/* ── Étape OTP ───────────────────────────────── */}
          {step === 'otp' && (
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-white font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
                    Vérifiez votre email
                  </h2>
                  <p className="text-white/35 text-xs mt-0.5">Code envoyé à {email}</p>
                </div>
                <button onClick={handleClose} className="text-white/25 hover:text-white/50 transition-colors text-xl">×</button>
              </div>
              <form onSubmit={handleVerifyOTP} className="space-y-4">
                <input
                  type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6}
                  placeholder="000000" value={otp} onChange={e => setOtp(e.target.value)}
                  required autoFocus
                  className="w-full bg-black/30 border border-white/12 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.35em] font-mono outline-none focus:border-[#C19A6B]/50 transition-colors"
                />
                {error && <p className="text-red-400 text-xs text-center">{error}</p>}
                <button type="submit" disabled={isPending || otp.length < 6}
                  className="w-full bg-[#C19A6B] text-[#1A0F0A] py-3 rounded-xl font-bold disabled:opacity-50 hover:bg-[#D4AE85] transition-colors">
                  {isPending ? 'Vérification…' : 'Valider →'}
                </button>
                <button type="button" onClick={() => { setStep('email'); setOtp(''); setError(null); }}
                  className="w-full text-white/25 text-xs hover:text-white/40 transition-colors">
                  ← Changer d'adresse
                </button>
              </form>
            </div>
          )}

          {/* ── Étape profil (nouveau client) ───────────── */}
          {step === 'profil' && (
            <div>
              {/* Header coloré */}
              <div className="bg-gradient-to-r from-[#2C1810] to-[#3D1F0D] px-6 py-5">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#C19A6B]/20 rounded-xl flex items-center justify-center">
                    <span className="text-xl">🥐</span>
                  </div>
                  <div>
                    <h2 className="text-white font-bold text-base" style={{ fontFamily: 'Playfair Display, serif' }}>
                      Bienvenue !
                    </h2>
                    <p className="text-white/50 text-xs">Quelques infos pour vos commandes</p>
                  </div>
                </div>

                {/* Étapes visuelles */}
                <div className="flex items-center gap-2 mt-4">
                  {['Email', 'Code', 'Profil'].map((s, i) => (
                    <div key={s} className="flex items-center gap-2 flex-1">
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${
                        i < 2 ? 'bg-[#C19A6B] text-[#1A0F0A]' : 'bg-white/20 text-white'
                      }`}>
                        {i < 2 ? <Check size={10} /> : '3'}
                      </div>
                      <span className={`text-[10px] ${i < 2 ? 'text-white/50' : 'text-white/80 font-semibold'}`}>{s}</span>
                      {i < 2 && <div className="flex-1 h-px bg-white/15" />}
                    </div>
                  ))}
                </div>
              </div>

              <form onSubmit={handleSaveProfil} className="p-6 space-y-4">

                {/* Prénom */}
                <div>
                  <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                    <User size={11} />
                    Prénom <span className="text-red-400">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="Votre prénom"
                    value={prenom}
                    onChange={e => setPrenom(e.target.value)}
                    required autoFocus
                    className="w-full bg-black/30 border border-white/12 rounded-xl px-4 py-3 text-white placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
                  />
                  <p className="text-white/20 text-[10px] mt-1">
                    Apparaît sur votre commande pour faciliter le retrait
                  </p>
                </div>

                {/* Téléphone */}
                <div>
                  <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5 flex items-center gap-1.5">
                    <Phone size={11} />
                    Téléphone <span className="text-white/20">(optionnel)</span>
                  </label>
                  <input
                    type="tel"
                    placeholder="+33 6 12 34 56 78"
                    value={telephone}
                    onChange={e => setTelephone(e.target.value)}
                    className="w-full bg-black/30 border border-white/12 rounded-xl px-4 py-3 text-white placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
                  />
                </div>

                {/* Opt-in flash */}
                <button
                  type="button"
                  onClick={() => setOptinFlash(v => !v)}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    optinFlash
                      ? 'bg-yellow-400/10 border-yellow-400/25'
                      : 'bg-white/4 border-white/10'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
                    optinFlash ? 'bg-yellow-400/20' : 'bg-white/8'
                  }`}>
                    <Zap size={16} className={optinFlash ? 'text-yellow-400 fill-current' : 'text-white/25'} />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${optinFlash ? 'text-yellow-300' : 'text-white/50'}`}>
                      Alertes paniers anti-gaspi
                    </p>
                    <p className="text-white/25 text-xs">
                      Notification chaque soir quand les invendus sont disponibles
                    </p>
                  </div>
                  <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 ${
                    optinFlash ? 'bg-yellow-400 justify-end' : 'bg-white/15 justify-start'
                  }`}>
                    <div className="w-5 h-5 bg-white rounded-full shadow-sm" />
                  </div>
                </button>

                {/* RGPD */}
                <button
                  type="button"
                  onClick={() => setRgpdAccepted(v => !v)}
                  className={`w-full flex items-start gap-3 p-3.5 rounded-xl border text-left transition-all ${
                    rgpdAccepted
                      ? 'bg-green-500/8 border-green-500/20'
                      : 'bg-white/4 border-white/10 hover:bg-white/6'
                  }`}
                >
                  <div className={`w-5 h-5 rounded mt-0.5 flex-shrink-0 flex items-center justify-center transition-all ${
                    rgpdAccepted ? 'bg-green-500' : 'border-2 border-white/20'
                  }`}>
                    {rgpdAccepted && <Check size={10} className="text-white" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-white/60 text-xs leading-relaxed flex items-center gap-1 flex-wrap">
                      <Shield size={10} className="text-green-400 flex-shrink-0" />
                      J'accepte la{' '}
                      <a
                        href="/mentions-legales"
                        target="_blank"
                        className="text-[#C19A6B] hover:underline"
                        onClick={e => e.stopPropagation()}
                      >
                        politique de confidentialité
                      </a>
                      {' '}et le traitement de mes données pour la gestion des commandes.
                      <span className="text-white/25">(requis)</span>
                    </p>
                  </div>
                </button>

                {profilError && (
                  <p className="text-red-400 text-xs text-center bg-red-500/10 rounded-xl px-3 py-2">
                    {profilError}
                  </p>
                )}

                <button
                  type="submit"
                  disabled={savingProfil || !rgpdAccepted || !prenom.trim()}
                  className="w-full bg-[#C19A6B] text-[#1A0F0A] py-3.5 rounded-xl font-bold disabled:opacity-40 hover:bg-[#D4AE85] transition-colors flex items-center justify-center gap-2"
                >
                  {savingProfil
                    ? <><Loader2 size={16} className="animate-spin" /> Enregistrement…</>
                    : <>Finaliser ma commande <ChevronRight size={16} /></>
                  }
                </button>

                <p className="text-white/15 text-[10px] text-center">
                  Ces informations ne sont jamais partagées avec des tiers.
                </p>
              </form>
            </div>
          )}

        </motion.div>
      </div>
    </>
  );
}