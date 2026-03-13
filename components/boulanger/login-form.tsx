'use client';

// components/auth/login-form.tsx
// CORRECTIF : lecture du paramètre ?redirect= après authentification
//
// AVANT : après le login, toujours redirect vers /boulanger
// APRÈS : redirect vers l'URL demandée (ou /boulanger par défaut)

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';

export function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail]     = useState('');
  const [step, setStep]       = useState<'email' | 'otp'>('email');
  const [otp, setOtp]         = useState('');
  const [error, setError]     = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  // ← CORRECTIF : lecture du redirect param
  const redirectTo = searchParams.get('redirect') ?? '/boulanger';

  async function handleSendOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const { error } = await supabase.auth.signInWithOtp({
        email,
        options: { shouldCreateUser: false },
      });

      if (error) {
        setError(error.message);
        return;
      }
      setStep('otp');
    });
  }

  async function handleVerifyOTP(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token: otp,
        type: 'email',
      });

      if (error) {
        setError('Code invalide ou expiré. Réessayez.');
        return;
      }

      // ← CORRECTIF : redirige vers l'URL d'origine, pas toujours /boulanger
      router.replace(redirectTo);
      router.refresh();
    });
  }

  if (step === 'otp') {
    return (
      <form onSubmit={handleVerifyOTP} className="space-y-4">
        <p className="text-sm text-gray-600">
          Code envoyé à <strong>{email}</strong>
        </p>
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={6}
          placeholder="Code à 6 chiffres"
          value={otp}
          onChange={e => setOtp(e.target.value)}
          required
          autoFocus
          className="w-full rounded-lg border px-4 py-3 text-center text-2xl tracking-widest"
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={isPending || otp.length < 6}
          className="w-full rounded-lg bg-amber-600 py-3 text-white disabled:opacity-50"
        >
          {isPending ? 'Vérification…' : 'Valider'}
        </button>
        <button
          type="button"
          onClick={() => { setStep('email'); setOtp(''); setError(null); }}
          className="w-full text-sm text-gray-500 underline"
        >
          Changer d'adresse email
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSendOTP} className="space-y-4">
      <input
        type="email"
        placeholder="votre@email.com"
        value={email}
        onChange={e => setEmail(e.target.value)}
        required
        autoFocus
        className="w-full rounded-lg border px-4 py-3"
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-lg bg-amber-600 py-3 text-white disabled:opacity-50"
      >
        {isPending ? 'Envoi…' : 'Recevoir mon code'}
      </button>
    </form>
  );
}