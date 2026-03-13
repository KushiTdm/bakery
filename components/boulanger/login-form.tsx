'use client';

// components/boulanger/login-form.tsx
// CORRECTIF BUG C : export named → export default
// CORRECTIF BUG E : style adapté à l'app (dark theme)

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export default function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail]     = useState('');
  const [step, setStep]       = useState<'email' | 'otp'>('email');
  const [otp, setOtp]         = useState('');
  const [error, setError]     = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // CORRECTIF BUG B (redirect après login)
  const redirectTo = searchParams.get('redirect') ?? '/boulanger';

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
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
      if (error) { setError('Code invalide ou expiré. Réessayez.'); return; }
      router.replace(redirectTo);
      router.refresh();
    });
  }

  return (
    <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white/6 border border-white/10 rounded-2xl p-8">
        <div className="text-center mb-8">
          <span className="text-4xl block mb-3">🥖</span>
          <h1 className="text-white text-xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
            L'Artisan Doré
          </h1>
          <p className="text-white/40 text-xs mt-1 tracking-widest uppercase">Espace Boulanger</p>
        </div>

        {step === 'otp' ? (
          <form onSubmit={handleVerifyOTP} className="space-y-4">
            <p className="text-white/60 text-sm text-center">
              Code envoyé à <strong className="text-white">{email}</strong>
            </p>
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
              className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-white text-center text-3xl tracking-[0.4em] font-mono outline-none focus:border-[#C19A6B]/60 transition-colors"
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={isPending || otp.length < 6}
              className="w-full bg-[#C19A6B] text-[#1A0F0A] py-3 rounded-xl font-bold disabled:opacity-50 hover:bg-[#D4AE85] transition-colors"
            >
              {isPending ? 'Vérification…' : 'Valider le code'}
            </button>
            <button
              type="button"
              onClick={() => { setStep('email'); setOtp(''); setError(null); }}
              className="w-full text-white/35 text-sm hover:text-white/60 transition-colors"
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
              className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/25 outline-none focus:border-[#C19A6B]/60 transition-colors"
            />
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-[#C19A6B] text-[#1A0F0A] py-3 rounded-xl font-bold disabled:opacity-50 hover:bg-[#D4AE85] transition-colors"
            >
              {isPending ? 'Envoi…' : 'Recevoir mon code'}
            </button>
            <p className="text-white/20 text-xs text-center">Un code à 6 chiffres vous sera envoyé par email</p>
          </form>
        )}
      </div>
    </div>
  );
}