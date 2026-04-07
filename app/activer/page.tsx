'use client'
// app/activer/page.tsx
// Activation de compte post-inscription landing page.
// URL reçue : /activer#access_token=xxx&type=recovery
// Le token Supabase dans le hash établit une session,
// puis l'utilisateur choisit son mot de passe.
// Après activation, redirection vers le sous-domaine de la boulangerie.

import { useState, useEffect, useRef } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN || 'sauvemie.fr'

function getSupabase(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export default function ActiverPage() {
  const supabaseRef = useRef<SupabaseClient>(getSupabase())
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')
  const [bakerySlug, setBakerySlug] = useState<string | null>(null)

  useEffect(() => {
    const supabase = supabaseRef.current

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        setStatus('ready')

        // Récupérer le slug depuis la table boulangeries
        try {
          const { data: bakery } = await supabase
            .from('boulangeries')
            .select('slug')
            .eq('user_id', session.user.id)
            .single()

          if (bakery?.slug) {
            setBakerySlug(bakery.slug)
          }
        } catch (err) {
          console.warn('[activer] Impossible de récupérer le slug:', err)
        }
      }
    })

    // Si après 5s aucun événement PASSWORD_RECOVERY n'a été reçu → lien invalide
    const timeout = setTimeout(() => {
      setStatus(prev => {
        if (prev === 'loading') {
          setMessage('Lien invalide ou expiré. Utilisez "Mot de passe oublié" depuis la page de connexion pour en recevoir un nouveau.')
          return 'error'
        }
        return prev
      })
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const validatePassword = (pwd: string): string | null => {
    if (pwd.length < 8) return 'Le mot de passe doit faire au moins 8 caractères.'
    if (!/[A-Z]/.test(pwd)) return 'Le mot de passe doit contenir au moins une majuscule.'
    if (!/[a-z]/.test(pwd)) return 'Le mot de passe doit contenir au moins une minuscule.'
    if (!/[0-9]/.test(pwd)) return 'Le mot de passe doit contenir au moins un chiffre.'
    return null
  }

  const handleSubmit = async () => {
    const validationError = validatePassword(password)
    if (validationError) {
      setMessage(validationError)
      return
    }
    if (password !== confirm) {
      setMessage('Les mots de passe ne correspondent pas.')
      return
    }

    try {
      const { error } = await supabaseRef.current.auth.updateUser({ password })

      if (error) {
        setStatus('error')
        setMessage(error.message)
      } else {
        setStatus('success')
        const redirectUrl = bakerySlug
          ? `https://${bakerySlug}.${ROOT_DOMAIN}/boulanger`
          : '/boulanger'
        setTimeout(() => window.location.href = redirectUrl, 2000)
      }
    } catch {
      setStatus('error')
      setMessage('Une erreur est survenue.')
    }
  }

  const dashboardUrl = bakerySlug
    ? `https://${bakerySlug}.${ROOT_DOMAIN}/boulanger`
    : '/boulanger'

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: '#1A0F0A' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-10">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 text-3xl"
            style={{ background: 'rgba(193,154,107,0.15)', border: '1px solid rgba(193,154,107,0.2)' }}>
            🥖
          </div>
          <h1 className="text-2xl font-bold text-white" style={{ fontFamily: 'Playfair Display, serif' }}>
            Activez votre compte
          </h1>
          <p className="text-white/40 text-sm mt-2">
            Choisissez un mot de passe pour accéder à votre tableau de bord
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl p-6" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>

          {status === 'loading' && (
            <div className="text-center py-8">
              <div className="w-8 h-8 border-2 border-[#C19A6B] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-white/40 text-sm">Vérification du lien...</p>
            </div>
          )}

          {status === 'ready' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">
                  Mot de passe
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setMessage('') }}
                  placeholder="8 caractères min, 1 majuscule, 1 chiffre"
                  className="w-full rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-[#C19A6B]"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/60 mb-1.5">
                  Confirmer le mot de passe
                </label>
                <input
                  type="password"
                  value={confirm}
                  onChange={e => { setConfirm(e.target.value); setMessage('') }}
                  placeholder="Répétez le mot de passe"
                  className="w-full rounded-xl px-4 py-3 text-white placeholder-white/20 focus:outline-none focus:ring-2 focus:ring-[#C19A6B]"
                  style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                  onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                />
              </div>

              {message && (
                <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-3 py-2">{message}</p>
              )}

              <button
                onClick={handleSubmit}
                className="w-full font-semibold py-3 rounded-xl transition-all text-sm"
                style={{ background: '#C19A6B', color: '#1A0F0A' }}
              >
                Activer mon compte
              </button>
            </div>
          )}

          {status === 'success' && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto text-2xl"
                style={{ background: 'rgba(34,197,94,0.15)' }}>
                ✓
              </div>
              <div>
                <p className="text-white font-semibold text-lg" style={{ fontFamily: 'Playfair Display, serif' }}>
                  Compte activé !
                </p>
                <p className="text-white/40 text-sm mt-1">
                  Redirection vers votre tableau de bord...
                </p>
              </div>
              <a
                href={dashboardUrl}
                className="inline-block px-6 py-3 rounded-xl font-semibold text-sm transition-all"
                style={{ background: '#C19A6B', color: '#1A0F0A' }}
              >
                Accéder maintenant
              </a>
            </div>
          )}

          {status === 'error' && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto text-2xl"
                style={{ background: 'rgba(239,68,68,0.15)' }}>
                ✕
              </div>
              <p className="text-white/60 text-sm leading-relaxed">{message}</p>
              <a
                href="/boulanger"
                className="inline-block text-[#C19A6B] hover:underline text-sm"
              >
                Aller à la page de connexion
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
