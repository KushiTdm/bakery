'use client';
// app/boulanger/rejoindre/page.tsx
// ─────────────────────────────────────────────────────────────
// Page d'acceptation d'invitation à l'équipe boulanger.
//
// Flow :
//   1. Page chargée avec ?token=UUID
//   2. Vérification token (GET /api/boulanger/rejoindre?token=xxx)
//   3. Si non authentifié → formulaire login/register
//   4. Si authentifié → bouton "Rejoindre"
//   5. POST /api/boulanger/rejoindre → redirection vers /boulanger
// ─────────────────────────────────────────────────────────────

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/lib/supabase';
import { ROLE_LABELS } from '@/lib/types';
import { Loader2, CheckCircle2, XCircle, UserPlus, Eye, EyeOff } from 'lucide-react';

interface InviteInfo {
  email:           string;
  role:            'gerant' | 'employe';
  expiresAt:       string;
  boulangerieNom:  string;
  boulangerieSlug: string;
}

type PageState = 'loading' | 'invalid' | 'expired' | 'ready' | 'authenticating' | 'joining' | 'success' | 'error';

function RejoindreContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const token        = searchParams.get('token');

  const [state,       setState]      = useState<PageState>('loading');
  const [inviteInfo,  setInviteInfo] = useState<InviteInfo | null>(null);
  const [errorMsg,    setErrorMsg]   = useState('');
  const [user,        setUser]       = useState<{ email: string } | null>(null);

  // Auth form
  const [authStep,    setAuthStep]   = useState<'email' | 'password'>('email');
  const [email,       setEmail]      = useState('');
  const [password,    setPassword]   = useState('');
  const [showPwd,     setShowPwd]    = useState(false);
  const [authError,   setAuthError]  = useState('');
  const [isNewUser,   setIsNewUser]  = useState(false);

  // 1. Vérifier le token au chargement
  useEffect(() => {
    if (!token) { setState('invalid'); return; }

    async function checkToken() {
      try {
        const res = await fetch(`/api/boulanger/rejoindre?token=${token}`);
        const data = await res.json() as { valid?: boolean; invite?: InviteInfo; error?: string };

        if (!res.ok || !data.valid) {
          if (res.status === 410) setState('expired');
          else setState('invalid');
          setErrorMsg(data.error ?? 'Invitation invalide');
          return;
        }

        setInviteInfo(data.invite!);

        // Vérifier si déjà connecté
        const { data: { user: currentUser } } = await supabase.auth.getUser();
        if (currentUser) {
          setUser({ email: currentUser.email ?? '' });
        }

        setState('ready');
      } catch {
        setState('invalid');
        setErrorMsg('Erreur de vérification');
      }
    }

    checkToken();
  }, [token]);

  // 2. Authentifier l'utilisateur
  async function handleAuth(e: React.FormEvent) {
    e.preventDefault();
    setAuthError('');
    setState('authenticating');

    try {
      if (isNewUser) {
        // Création de compte
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) { setAuthError(error.message); setState('ready'); return; }
        if (data.user) setUser({ email: data.user.email ?? email });
      } else {
        // Connexion
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          if (error.message.toLowerCase().includes('invalid')) {
            setAuthError('Email ou mot de passe incorrect.');
          } else {
            setAuthError(error.message);
          }
          setState('ready');
          return;
        }
        if (data.user) setUser({ email: data.user.email ?? email });
      }
      setState('ready');
    } catch {
      setAuthError('Erreur inattendue');
      setState('ready');
    }
  }

  // 3. Accepter l'invitation
  async function handleJoin() {
    if (!user) return;
    setState('joining');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setState('ready');
        setErrorMsg('Session expirée, reconnectez-vous');
        return;
      }

      const res = await fetch('/api/boulanger/rejoindre', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ token }),
      });

      const data = await res.json() as { success?: boolean; role?: string; boulangerieNom?: string; error?: string };

      if (!res.ok || !data.success) {
        setErrorMsg(data.error ?? 'Erreur lors de l\'acceptation');
        setState('error');
        return;
      }

      setState('success');

      // Rediriger vers l'espace boulanger après 2 secondes
      setTimeout(() => router.push('/boulanger'), 2000);

    } catch {
      setErrorMsg('Erreur réseau');
      setState('error');
    }
  }

  // ── Rendu ────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <span className="text-5xl block mb-3">🥖</span>
          <h1 className="text-white text-xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
            BakeryOS
          </h1>
          <p className="text-white/40 text-xs mt-1 tracking-widest uppercase">
            Invitation équipe
          </p>
        </div>

        <AnimatePresence mode="wait">

          {/* Chargement */}
          {state === 'loading' && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="text-center py-12"
            >
              <Loader2 size={28} className="text-[#C19A6B]/60 animate-spin mx-auto" />
              <p className="text-white/40 text-sm mt-3">Vérification de l'invitation…</p>
            </motion.div>
          )}

          {/* Token invalide */}
          {(state === 'invalid' || state === 'expired') && (
            <motion.div key="invalid" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center"
            >
              <XCircle size={36} className="text-red-400 mx-auto mb-3" />
              <p className="text-white font-semibold mb-2">
                {state === 'expired' ? 'Invitation expirée' : 'Invitation invalide'}
              </p>
              <p className="text-white/50 text-sm">{errorMsg}</p>
              <a href="/" className="block mt-5 text-[#C19A6B] text-sm hover:underline">
                Retour à l'accueil
              </a>
            </motion.div>
          )}

          {/* Prêt : affiche l'info + formulaire auth ou bouton rejoindre */}
          {(state === 'ready' || state === 'authenticating' || state === 'joining') && inviteInfo && (
            <motion.div key="ready" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              {/* Card invitation */}
              <div className="bg-white/6 border border-white/10 rounded-2xl p-5">
                <p className="text-white/40 text-xs uppercase tracking-widest mb-3">Vous êtes invité(e) à</p>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-[#C19A6B]/15 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0">
                    🥖
                  </div>
                  <div>
                    <p className="text-white font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
                      {inviteInfo.boulangerieNom}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        inviteInfo.role === 'gerant'
                          ? 'bg-blue-400/15 text-blue-300'
                          : 'bg-[#C19A6B]/15 text-[#C19A6B]'
                      }`}>
                        {ROLE_LABELS[inviteInfo.role]}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-white/30 border-t border-white/8 pt-3">
                  Invitation pour : <span className="text-white/50">{inviteInfo.email}</span>
                </div>
              </div>

              {/* Erreur */}
              {authError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2.5">
                  <p className="text-red-400 text-sm">{authError}</p>
                </div>
              )}

              {/* Utilisateur déjà connecté → bouton rejoindre */}
              {user ? (
                <div className="space-y-3">
                  <div className="bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3 text-xs text-green-300">
                    Connecté en tant que <strong>{user.email}</strong>
                  </div>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={handleJoin}
                    disabled={state === 'joining'}
                    className="w-full bg-[#C19A6B] text-[#1A0F0A] py-4 rounded-2xl font-bold text-sm hover:bg-[#D4AE85] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {state === 'joining'
                      ? <><Loader2 size={16} className="animate-spin" /> Acceptation…</>
                      : <><UserPlus size={16} /> Rejoindre l'équipe</>
                    }
                  </motion.button>
                  <button
                    onClick={async () => { await supabase.auth.signOut(); setUser(null); }}
                    className="w-full text-white/30 text-xs hover:text-white/50 transition-colors"
                  >
                    Pas votre compte ? Se déconnecter
                  </button>
                </div>
              ) : (
                /* Formulaire auth */
                <form onSubmit={handleAuth} className="space-y-3">
                  <div className="flex gap-2">
                    <button type="button"
                      onClick={() => setIsNewUser(false)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${
                        !isNewUser ? 'bg-[#C19A6B]/15 border-[#C19A6B]/30 text-[#C19A6B]' : 'bg-white/5 border-white/10 text-white/40'
                      }`}
                    >
                      J'ai un compte
                    </button>
                    <button type="button"
                      onClick={() => setIsNewUser(true)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all border ${
                        isNewUser ? 'bg-[#C19A6B]/15 border-[#C19A6B]/30 text-[#C19A6B]' : 'bg-white/5 border-white/10 text-white/40'
                      }`}
                    >
                      Créer un compte
                    </button>
                  </div>

                  <input
                    type="email"
                    placeholder="Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    defaultValue={inviteInfo.email}
                    required
                    className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 text-white placeholder:text-white/25 outline-none focus:border-[#C19A6B]/60 transition-colors text-sm"
                  />

                  <div className="relative">
                    <input
                      type={showPwd ? 'text' : 'password'}
                      placeholder={isNewUser ? 'Créer un mot de passe (8 caractères min.)' : 'Mot de passe'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      required
                      minLength={isNewUser ? 8 : undefined}
                      className="w-full bg-black/30 border border-white/15 rounded-xl px-4 py-3 pr-11 text-white placeholder:text-white/25 outline-none focus:border-[#C19A6B]/60 transition-colors text-sm"
                    />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50"
                    >
                      {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={state === 'authenticating'}
                    className="w-full bg-[#C19A6B] text-[#1A0F0A] py-3.5 rounded-xl font-bold text-sm hover:bg-[#D4AE85] transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {state === 'authenticating'
                      ? <><Loader2 size={16} className="animate-spin" /> {isNewUser ? 'Création…' : 'Connexion…'}</>
                      : isNewUser ? 'Créer mon compte' : 'Me connecter'
                    }
                  </button>
                </form>
              )}
            </motion.div>
          )}

          {/* Succès */}
          {state === 'success' && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              className="bg-green-500/10 border border-green-500/20 rounded-2xl p-8 text-center"
            >
              <CheckCircle2 size={48} className="text-green-400 mx-auto mb-4" />
              <p className="text-white font-bold text-lg mb-2" style={{ fontFamily: 'Playfair Display, serif' }}>
                Bienvenue dans l'équipe !
              </p>
              <p className="text-white/50 text-sm">
                Vous allez être redirigé vers l'espace boulanger…
              </p>
              <Loader2 size={16} className="text-green-400/60 animate-spin mx-auto mt-4" />
            </motion.div>
          )}

          {/* Erreur acceptation */}
          {state === 'error' && (
            <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="bg-red-500/10 border border-red-500/20 rounded-2xl p-6 text-center"
            >
              <XCircle size={36} className="text-red-400 mx-auto mb-3" />
              <p className="text-white font-semibold mb-2">Impossible de rejoindre</p>
              <p className="text-white/50 text-sm">{errorMsg}</p>
              <button onClick={() => setState('ready')} className="mt-4 text-[#C19A6B] text-sm hover:underline">
                Réessayer
              </button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

export default function RejoindrePageWrapper() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center">
        <Loader2 size={24} className="text-[#C19A6B]/50 animate-spin" />
      </div>
    }>
      <RejoindreContent />
    </Suspense>
  );
}