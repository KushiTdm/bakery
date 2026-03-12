'use client'
// app/reset-password/page.tsx
// Gère le callback de reset password Supabase
// URL reçue : /reset-password#access_token=xxx&type=recovery

import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

export default function ResetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [status, setStatus] = useState<'loading' | 'ready' | 'success' | 'error'>('loading')
  const [message, setMessage] = useState('')

  useEffect(() => {
    // Supabase met le token dans le hash de l'URL (#access_token=...&type=recovery)
    const hash = window.location.hash
    if (hash.includes('type=recovery') && hash.includes('access_token')) {
      setStatus('ready')
    } else {
      setStatus('error')
      setMessage('Lien invalide ou expiré. Demande un nouveau lien de réinitialisation.')
    }
  }, [])

  const handleSubmit = async () => {
    if (password.length < 8) {
      setMessage('Le mot de passe doit faire au moins 8 caractères.')
      return
    }
    if (password !== confirm) {
      setMessage('Les mots de passe ne correspondent pas.')
      return
    }

    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      )

      // Supabase lit automatiquement le token dans le hash
      const { error } = await supabase.auth.updateUser({ password })

      if (error) {
        setStatus('error')
        setMessage(error.message)
      } else {
        setStatus('success')
        setMessage('Mot de passe mis à jour ! Tu peux te connecter.')
      }
    } catch {
      setStatus('error')
      setMessage('Une erreur est survenue.')
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="text-4xl mb-2">🥖</div>
          <h1 className="text-2xl font-bold text-stone-800">L'Artisan Doré</h1>
          <p className="text-stone-500 text-sm mt-1">Nouveau mot de passe</p>
        </div>

        {status === 'loading' && (
          <div className="text-center text-stone-400 py-8">
            <div className="w-8 h-8 border-2 border-amber-400 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            Vérification du lien...
          </div>
        )}

        {status === 'ready' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Nouveau mot de passe
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="8 caractères minimum"
                className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-stone-700 mb-1">
                Confirmer le mot de passe
              </label>
              <input
                type="password"
                value={confirm}
                onChange={e => setConfirm(e.target.value)}
                placeholder="Répète le mot de passe"
                className="w-full border border-stone-200 rounded-xl px-4 py-3 text-stone-800 focus:outline-none focus:ring-2 focus:ring-amber-400"
                onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              />
            </div>

            {message && (
              <p className="text-red-500 text-sm bg-red-50 rounded-lg px-3 py-2">{message}</p>
            )}

            <button
              onClick={handleSubmit}
              className="w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl transition-colors"
            >
              Mettre à jour le mot de passe
            </button>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center space-y-4">
            <div className="text-5xl">✅</div>
            <p className="text-stone-700 font-medium">{message}</p>
            <a
              href="/boulanger"
              className="block w-full bg-amber-500 hover:bg-amber-600 text-white font-semibold py-3 rounded-xl transition-colors text-center"
            >
              Aller à l'espace boulanger
            </a>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center space-y-4">
            <div className="text-5xl">❌</div>
            <p className="text-stone-600">{message}</p>
            <a
              href="/boulanger"
              className="block text-amber-600 hover:underline text-sm"
            >
              Retour à la connexion
            </a>
          </div>
        )}
      </div>
    </div>
  )
}