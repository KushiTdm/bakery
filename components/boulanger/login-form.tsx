'use client'

// components/boulanger/login-form.tsx
// Supprimé : bouton "Simuler la connexion (dev uniquement)"
// Le bouton était rendu sans garde → visible en production.
// Solution : suppression pure et simple. Le dev peut passer par
// Supabase Dashboard > Authentication > Users pour créer un compte test.

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail, Lock, Eye, EyeOff, LogIn, UserPlus,
  AlertCircle, Loader2, KeyRound, CheckCircle2, ArrowLeft,
} from 'lucide-react'
import { useBoulanger } from '@/context/boulanger-context'
import { supabase } from '@/lib/supabase'

type FormMode = 'login' | 'register' | 'forgot'

export default function LoginForm() {
  const { login, authError, authLoading } = useBoulanger()
  const searchParams = useSearchParams()

  const [mode, setMode]               = useState<FormMode>('login')
  const [email, setEmail]             = useState('')
  const [password, setPassword]       = useState('')
  const [nom, setNom]                 = useState('')
  const [slug, setSlug]               = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError]   = useState('')
  const [resetSent, setResetSent]     = useState(false)
  const [resetLoading, setResetLoading] = useState(false)

  // Message si le middleware a détecté une session expirée
  useEffect(() => {
    if (searchParams?.get('expired') === '1') {
      setLocalError('Votre session a expiré. Veuillez vous reconnecter.')
    }
  }, [searchParams])

  const generateSlug = (name: string) =>
    name.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

  const handleNomChange = (val: string) => {
    setNom(val)
    setSlug(generateSlug(val))
  }

  const switchMode = (m: FormMode) => {
    setMode(m)
    setLocalError('')
    setResetSent(false)
  }

  const handleSubmit = async () => {
    setLocalError('')

    if (!email || !password) {
      setLocalError('Email et mot de passe requis')
      return
    }
    if (password.length < 8) {
      setLocalError('Mot de passe : 8 caractères minimum')
      return
    }
    if (mode === 'register' && (!nom || !slug)) {
      setLocalError('Nom de la boulangerie requis')
      return
    }

    if (mode === 'register') {
      const res = await fetch('/api/boulanger/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'register', email, password, nom, slug }),
      })
      const data = await res.json()
      if (!res.ok) {
        setLocalError(data.error ?? 'Erreur lors de l\'inscription')
        return
      }
    }

    const ok = await login(email, password)
    if (!ok && !authError) setLocalError('Email ou mot de passe incorrect')
  }

  const handleForgotPassword = async () => {
    setLocalError('')
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setLocalError('Entrez une adresse email valide')
      return
    }
    setResetLoading(true)
    try {
      const redirectTo = `${window.location.origin}/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo })
      if (error) setLocalError(error.message)
      else setResetSent(true)
    } catch {
      setLocalError("Erreur lors de l'envoi. Réessayez.")
    }
    setResetLoading(false)
  }

  const error = localError || authError

  // ── Styles ───────────────────────────────────────────────────────────────────
  const inputBase = [
    'w-full rounded-xl py-3 text-sm outline-none transition-colors',
    'border border-white/15 bg-[#2A1A12] text-white placeholder:text-white/35',
    'focus:border-[#C19A6B]/60 focus:bg-[#321E14]',
  ].join(' ')

  // ── Mode mot de passe oublié ─────────────────────────────────────────────────
  if (mode === 'forgot') {
    return (
      <PageShell>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
          <div className="text-center mb-8">
            <IconBox><KeyRound size={28} className="text-[#C19A6B]" /></IconBox>
            <h1 className="text-white text-xl font-bold font-playfair">Mot de passe oublié</h1>
            <p className="text-white/35 text-xs mt-1.5">Un lien vous sera envoyé par email</p>
          </div>

          <Card>
            {resetSent ? (
              <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                className="text-center py-4 space-y-3">
                <CheckCircle2 size={40} className="text-green-400 mx-auto" />
                <p className="text-white font-semibold">Email envoyé !</p>
                <p className="text-white/40 text-sm">
                  Vérifiez <span className="text-[#C19A6B]">{email}</span>.
                  Le lien expire dans 1 heure.
                </p>
              </motion.div>
            ) : (
              <>
                <Field label="Email">
                  <div className="relative">
                    <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                    <input
                      type="email" value={email} autoFocus
                      onChange={e => { setEmail(e.target.value); setLocalError('') }}
                      onKeyDown={e => e.key === 'Enter' && handleForgotPassword()}
                      placeholder="contact@votreboulangerie.fr"
                      autoComplete="email"
                      className={`${inputBase} pl-10 pr-4`}
                    />
                  </div>
                </Field>

                <AnimatePresence>{error && <ErrorBox message={error} />}</AnimatePresence>

                <PrimaryButton onClick={handleForgotPassword} loading={resetLoading}>
                  <KeyRound size={16} /> Envoyer le lien
                </PrimaryButton>
              </>
            )}

            <button onClick={() => switchMode('login')}
              className="w-full flex items-center justify-center gap-2 text-white/30 hover:text-white/60 text-sm transition-colors pt-2">
              <ArrowLeft size={14} /> Retour à la connexion
            </button>
          </Card>
        </motion.div>
        <AutofillStyle />
      </PageShell>
    )
  }

  // ── Mode login / register ────────────────────────────────────────────────────
  return (
    <PageShell>
      <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }} className="w-full max-w-sm">

        <div className="text-center mb-8">
          <IconBox><span className="text-3xl">🥖</span></IconBox>
          <h1 className="text-white text-2xl font-bold font-playfair">BakeryOS</h1>
          <p className="text-white/35 text-xs mt-1.5 tracking-widest uppercase font-medium">Espace Boulanger</p>
        </div>

        <Card>
          {/* Toggle */}
          <div className="grid grid-cols-2 bg-white/5 rounded-xl p-1 mb-6">
            {(['login', 'register'] as FormMode[]).map(m => (
              <button key={m} onClick={() => switchMode(m)}
                className={`py-2 rounded-lg text-sm font-medium transition-all ${
                  mode === m ? 'bg-[#C19A6B] text-[#1A0F0A]' : 'text-white/40 hover:text-white/70'
                }`}>
                {m === 'login' ? 'Connexion' : 'Créer un compte'}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {/* Nom boulangerie (register uniquement) */}
            <AnimatePresence>
              {mode === 'register' && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }} className="space-y-3 overflow-hidden">
                  <Field label="Nom de la boulangerie">
                    <input type="text" value={nom}
                      onChange={e => handleNomChange(e.target.value)}
                      placeholder="L'Artisan Doré"
                      className={`${inputBase} px-4`}
                    />
                  </Field>
                  {slug && (
                    <p className="text-white/25 text-xs px-1">
                      Identifiant : <span className="text-[#C19A6B]/70 font-mono">{slug}</span>
                    </p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Email */}
            <Field label="Email">
              <div className="relative">
                <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                <input type="email" value={email}
                  onChange={e => { setEmail(e.target.value); setLocalError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="contact@votreboulangerie.fr"
                  autoComplete="email"
                  className={`${inputBase} pl-10 pr-4`}
                />
              </div>
            </Field>

            {/* Mot de passe */}
            <Field label="Mot de passe">
              <div className="relative">
                <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setLocalError('') }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  className={`${inputBase} pl-10 pr-12`}
                />
                <button type="button" onClick={() => setShowPassword(v => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60 transition-colors">
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {mode === 'register' && (
                <p className="text-white/20 text-xs mt-1 px-1">Minimum 8 caractères</p>
              )}
            </Field>

            <AnimatePresence>{error && <ErrorBox message={error} />}</AnimatePresence>

            <PrimaryButton onClick={handleSubmit} loading={authLoading}>
              {mode === 'login'
                ? <><LogIn size={16} /> Se connecter</>
                : <><UserPlus size={16} /> Créer mon espace</>
              }
            </PrimaryButton>

            {mode === 'login' && (
              <button onClick={() => switchMode('forgot')}
                className="w-full text-center text-white/25 hover:text-[#C19A6B]/70 text-xs transition-colors pt-1">
                Mot de passe oublié ?
              </button>
            )}
          </div>
        </Card>

        <p className="text-center text-white/20 text-xs mt-6">
          <a href="/" className="hover:text-white/40 transition-colors">← Retour au site client</a>
        </p>
      </motion.div>
      <AutofillStyle />
    </PageShell>
  )
}

// ── Composants locaux ────────────────────────────────────────────────────────

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#1A0F0A] flex flex-col items-center justify-center px-6">
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
      />
      {children}
    </div>
  )
}

function IconBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-16 h-16 bg-[#C19A6B]/15 border border-[#C19A6B]/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
      {children}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-white/5 border border-white/8 rounded-3xl p-6 space-y-4">
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">{label}</label>
      {children}
    </div>
  )
}

function PrimaryButton({
  children, onClick, loading,
}: {
  children: React.ReactNode
  onClick: () => void
  loading: boolean
}) {
  return (
    <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
      onClick={onClick} disabled={loading}
      className="w-full bg-[#C19A6B] text-[#1A0F0A] py-3.5 rounded-xl font-bold text-sm hover:bg-[#D4AE85] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
      {loading ? <Loader2 size={16} className="animate-spin" /> : children}
    </motion.button>
  )
}

function ErrorBox({ message }: { message: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="flex items-center gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-3.5 py-3">
      <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
      <p className="text-red-400 text-sm">{message}</p>
    </motion.div>
  )
}

function AutofillStyle() {
  return (
    <style>{`
      input:-webkit-autofill,input:-webkit-autofill:hover,
      input:-webkit-autofill:focus,input:-webkit-autofill:active {
        -webkit-text-fill-color:#fff!important;
        -webkit-box-shadow:0 0 0 1000px #2A1A12 inset!important;
        caret-color:white;
      }
    `}</style>
  )
}