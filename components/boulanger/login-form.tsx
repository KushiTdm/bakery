'use client';

// components/boulanger/login-form.tsx
// Auth email + password pour l'espace boulanger.
// Pas d'OTP → pas de limite d'emails Supabase (2/h plan gratuit).
// Un lien "mot de passe oublié" envoie 1 seul email de reset, pas à chaque login.

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { Loader2, Eye, EyeOff, KeyRound } from 'lucide-react';

type Step = 'login' | 'forgot' | 'forgot_sent';

export default function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();

  const [step, setStep]                 = useState<Step>('login');
  const [email, setEmail]               = useState('');
  const [password, setPassword]         = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [isPending, startTransition]    = useTransition();

  const redirectTo = searchParams.get('redirect') ?? '/boulanger';

  // ── Connexion email + password ────────────────────────────────────────

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        if (error.message.toLowerCase().includes('invalid login')) {
          setError('Email ou mot de passe incorrect.');
        } else if (error.message.toLowerCase().includes('email not confirmed')) {
          setError('Email non confirmé. Vérifiez votre boîte mail.');
        } else if (error.status === 429) {
          setError('Trop de tentatives. Attendez quelques minutes.');
        } else {
          setError(error.message);
        }
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    });
  }

  // ── Mot de passe oublié ───────────────────────────────────────────────

  async function handleForgotPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError('Saisissez votre adresse email.');
      return;
    }
    startTransition(async () => {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        setError(error.message);
        return;
      }
      setStep('forgot_sent');
    });
  }

  // ── Écran : lien de reset envoyé ──────────────────────────────────────

  if (step === 'forgot_sent') {
    return (
      <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white/6 border border-white/10 rounded-2xl p-8 text-center">
          <span className="text-4xl block mb-4">📬</span>
          <h2 className="text-white font-bold text-lg mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
            Email envoyé
          </h2>
          <p className="text-white/50 text-sm leading-relaxed mb-6">
            Un lien de réinitialisation a été envoyé à{' '}
            <strong className="text-white">{email}</strong>.
            Pensez à vérifier les spams.
          </p>
          <button
            onClick={() => { setStep('login'); setError(null); }}
            className="text-[#C19A6B] text-sm hover:underline"
          >
            ← Retour à la connexion
          </button>
        </div>
      </div>
    );
  }

  // ── Écran : mot de passe oublié ───────────────────────────────────────

  if (step === 'forgot') {
    return (
      <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center px-4">
        <div className="w-full max-w-sm bg-white/6 border border-white/10 rounded-2xl p-8">
          <div className="text-center mb-8">
            <span className="text-4xl block mb-3">🔑</span>
            <h1 className="text-white text-xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
              Mot de passe oublié
            </h1>
            <p className="text-white/40 text-xs mt-1">
              Un lien de réinitialisation vous sera envoyé
            </p>
          </div>

          <form onSubmit={handleForgotPassword} className="space-y-4">
            <input
              type="email"
              placeholder="votre@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/25 outline-none focus:border-[#C19A6B]/60 transition-colors"
            />
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
                <p className="text-red-400 text-sm text-center">{error}</p>
              </div>
            )}
            <button
              type="submit"
              disabled={isPending}
              className="w-full bg-[#C19A6B] text-[#1A0F0A] py-3 rounded-xl font-bold disabled:opacity-50 hover:bg-[#D4AE85] transition-colors flex items-center justify-center gap-2"
            >
              {isPending
                ? <><Loader2 size={16} className="animate-spin" /> Envoi…</>
                : 'Envoyer le lien'
              }
            </button>
            <button
              type="button"
              onClick={() => { setStep('login'); setError(null); }}
              className="w-full text-white/35 text-sm hover:text-white/60 transition-colors"
            >
              ← Retour à la connexion
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ── Écran : connexion principal ───────────────────────────────────────

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

        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            placeholder="votre@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/25 outline-none focus:border-[#C19A6B]/60 transition-colors"
          />

          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              placeholder="Mot de passe"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 pr-11 text-white placeholder:text-white/25 outline-none focus:border-[#C19A6B]/60 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">
              <p className="text-red-400 text-sm text-center">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="w-full bg-[#C19A6B] text-[#1A0F0A] py-3 rounded-xl font-bold disabled:opacity-50 hover:bg-[#D4AE85] transition-colors flex items-center justify-center gap-2"
          >
            {isPending
              ? <><Loader2 size={16} className="animate-spin" /> Connexion…</>
              : 'Se connecter'
            }
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={() => { setStep('forgot'); setError(null); }}
              className="text-white/30 text-xs hover:text-[#C19A6B]/70 transition-colors flex items-center gap-1.5 mx-auto"
            >
              <KeyRound size={11} />
              Mot de passe oublié ?
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}