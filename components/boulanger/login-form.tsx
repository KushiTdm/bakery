// components/boulanger/login-form.tsx
// ─────────────────────────────────────────────────────────────
// Formulaire de connexion boulanger (remplace le PIN auth).
// Auth réelle via Supabase.
// ─────────────────────────────────────────────────────────────
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, Eye, EyeOff, LogIn, UserPlus, AlertCircle, Loader2 } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';

type FormMode = 'login' | 'register';

export default function LoginForm() {
  const { login, authError, authLoading } = useBoulanger();

  const [mode, setMode] = useState<FormMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nom, setNom] = useState('');
  const [slug, setSlug] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState('');

  const generateSlug = (name: string) =>
    name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  const handleNomChange = (val: string) => {
    setNom(val);
    setSlug(generateSlug(val));
  };

  const handleSubmit = async () => {
    setLocalError('');

    if (!email || !password) {
      setLocalError('Email et mot de passe requis');
      return;
    }
    if (password.length < 8) {
      setLocalError('Mot de passe : 8 caractères minimum');
      return;
    }
    if (mode === 'register' && (!nom || !slug)) {
      setLocalError('Nom de la boulangerie requis');
      return;
    }

    if (mode === 'register') {
      const res = await fetch('/api/boulanger/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', email, password, nom, slug }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLocalError(data.error ?? 'Erreur inscription');
        return;
      }
      // Après register, login automatique
    }

    const ok = await login(email, password);
    if (!ok && !authError) {
      setLocalError('Email ou mot de passe incorrect');
    }
  };

  const error = localError || authError;

  return (
    <div className="min-h-screen bg-[#1A0F0A] flex flex-col items-center justify-center px-6">
      {/* Grain overlay */}
      <div
        className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-[#C19A6B]/15 border border-[#C19A6B]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl">🥖</span>
          </div>
          <h1 className="text-white text-2xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
            L'Artisan Doré
          </h1>
          <p className="text-white/35 text-xs mt-1.5 tracking-widest uppercase font-medium">
            Espace Boulanger
          </p>
        </div>

        {/* Card */}
        <div className="bg-white/5 border border-white/8 rounded-3xl p-6">

          {/* Tabs login / register */}
          <div className="grid grid-cols-2 bg-white/5 rounded-xl p-1 mb-6">
            {(['login', 'register'] as FormMode[]).map(m => (
              <button
                key={m}
                onClick={() => { setMode(m); setLocalError(''); }}
                className={`py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === m
                    ? 'bg-[#C19A6B] text-[#1A0F0A]'
                    : 'text-white/40 hover:text-white/70'
                }`}
              >
                {m === 'login' ? 'Connexion' : 'Créer un compte'}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {/* Nom boulangerie (register uniquement) */}
            <AnimatePresence>
              {mode === 'register' && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3"
                >
                  <div>
                    <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                      Nom de la boulangerie
                    </label>
                    <input
                      type="text"
                      value={nom}
                      onChange={e => handleNomChange(e.target.value)}
                      placeholder="L'Artisan Doré"
                      className="w-full bg-white/8 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/25 outline-none focus:border-[#C19A6B]/50 transition-colors"
                    />
                  </div>
                  {slug && (
                    <p className="text-white/25 text-xs px-1">
                      Identifiant : <span className="text-[#C19A6B]/70 font-mono">{slug}</span>
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                Email
              </label>
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="contact@votreboulangerie.fr"
                  className="w-full bg-white/8 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-white text-sm placeholder:text-white/25 outline-none focus:border-[#C19A6B]/50 transition-colors"
                />
              </div>
            </div>

            {/* Mot de passe */}
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                Mot de passe
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/25" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="••••••••"
                  className="w-full bg-white/8 border border-white/10 rounded-xl pl-10 pr-12 py-3 text-white text-sm placeholder:text-white/25 outline-none focus:border-[#C19A6B]/50 transition-colors"
                />
                <button
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {mode === 'register' && (
                <p className="text-white/20 text-xs mt-1 px-1">Minimum 8 caractères</p>
              )}
            </div>

            {/* Erreur */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-3"
                >
                  <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                  <p className="text-red-400 text-sm">{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleSubmit}
              disabled={authLoading}
              className="w-full bg-[#C19A6B] text-[#1A0F0A] py-3.5 rounded-xl font-bold text-sm hover:bg-[#D4AE85] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {authLoading ? (
                <Loader2 size={16} className="animate-spin" />
              ) : mode === 'login' ? (
                <><LogIn size={16} /> Se connecter</>
              ) : (
                <><UserPlus size={16} /> Créer mon espace</>
              )}
            </motion.button>
          </div>
        </div>

        {/* Lien site client */}
        <p className="text-center text-white/20 text-xs mt-6">
          <a href="/" className="hover:text-white/40 transition-colors">
            ← Retour au site client
          </a>
        </p>
      </motion.div>
    </div>
  );
}