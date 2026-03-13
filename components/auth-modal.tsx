'use client';

// components/auth-modal.tsx
// ─────────────────────────────────────────────────────────────
// Modal de connexion client (landing / click & collect).
// Authentification via Supabase Magic Link / OTP.
//
// CORRECTIF : Suppression de l'appel au faux login() de cart-context.
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, useTransition } from 'react';
import { supabase } from '@/lib/supabase';

interface AuthModalProps {
  isOpen:   boolean;
  onClose:  () => void;
  onSuccess?: (email: string) => void;
}

export default function AuthModal({ isOpen, onClose, onSuccess }: AuthModalProps) {
  const [email, setEmail]     = useState('');
  const [step, setStep]       = useState<'email' | 'otp'>('email');
  const [otp, setOtp]         = useState('');
  const [error, setError]     = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // CORRECTIF : écoute la session Supabase directement, sans faux login()
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) {
        // Notifie le parent avec l'email réel Supabase (optionnel)
        onSuccess?.(session.user.email);
        onClose();
      }
    });
    return () => subscription.unsubscribe();
  }, [onClose, onSuccess]);

  // Réinitialiser quand on ferme
  useEffect(() => {
    if (!isOpen) {
      setTimeout(() => { setStep('email'); setOtp(''); setError(null); }, 300);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: {
          shouldCreateUser: true, // Les clients peuvent s'inscrire
        },
      });
      if (error) { setError(error.message); return; }
      setStep('otp');
    });
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.verifyOtp({
        email, token: otp, type: 'email',
      });
      if (error) { setError('Code invalide ou expiré.'); return; }
      // onAuthStateChange ci-dessus va déclencher onSuccess + onClose
    });
  }

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-x-4 top-1/2 -translate-y-1/2 z-50 max-w-sm mx-auto">
        <div className="bg-[#1A0F0A] border border-white/12 rounded-2xl p-6 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-white font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
                {step === 'otp' ? 'Vérifiez votre email' : 'Votre commande'}
              </h2>
              <p className="text-white/35 text-xs mt-0.5">
                {step === 'otp' ? `Code envoyé à ${email}` : 'Connectez-vous pour finaliser'}
              </p>
            </div>
            <button onClick={onClose} className="text-white/25 hover:text-white/50 transition-colors text-xl">
              ×
            </button>
          </div>

          {/* Formulaires */}
          {step === 'otp' ? (
            <form onSubmit={handleVerifyOTP} className="space-y-4">
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={e => setOtp(e.target.value)}
                required
                autoFocus
                className="w-full bg-black/30 border border-white/12 rounded-xl px-4 py-3 text-white text-center text-2xl tracking-[0.35em] font-mono outline-none focus:border-[#C19A6B]/50 transition-colors"
              />
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}
              <button
                type="submit"
                disabled={isPending || otp.length < 6}
                className="w-full bg-[#C19A6B] text-[#1A0F0A] py-3 rounded-xl font-bold disabled:opacity-50 hover:bg-[#D4AE85] transition-colors"
              >
                {isPending ? 'Vérification…' : 'Valider et commander'}
              </button>
              <button
                type="button"
                onClick={() => { setStep('email'); setOtp(''); setError(null); }}
                className="w-full text-white/25 text-xs hover:text-white/40 transition-colors"
              >
                ← Changer d'adresse
              </button>
            </form>
          ) : (
            <form onSubmit={handleSendOTP} className="space-y-4">
              <input
                type="email"
                placeholder="votre@email.com"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                autoFocus
                className="w-full bg-black/30 border border-white/12 rounded-xl px-4 py-3 text-white placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
              />
              {error && <p className="text-red-400 text-xs text-center">{error}</p>}
              <button
                type="submit"
                disabled={isPending}
                className="w-full bg-[#C19A6B] text-[#1A0F0A] py-3 rounded-xl font-bold disabled:opacity-50 hover:bg-[#D4AE85] transition-colors"
              >
                {isPending ? 'Envoi…' : 'Continuer →'}
              </button>
              <p className="text-white/18 text-xs text-center">
                Un code à 6 chiffres vous sera envoyé
              </p>
            </form>
          )}
        </div>
      </div>
    </>
  );
}