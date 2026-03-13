'use client';

// components/auth-modal.tsx
// ─────────────────────────────────────────────────────────────
// Auth via Supabase Magic Link (signInWithOtp)
// Firebase supprimé complètement.
//
// Flux :
//   1. L'utilisateur saisit son email → signInWithOtp()
//   2. Supabase envoie un email avec un lien /auth/callback?code=...
//   3. Le middleware @supabase/ssr intercepte le lien et crée la session
//   4. Redirection vers la page d'origine
//
// Prérequis :
//   - NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY dans .env.local
//   - Route /app/auth/callback/route.ts créée (voir commentaire en bas)
//   - Dans Supabase Dashboard > Auth > URL Configuration :
//       Site URL     : https://ton-domaine.fr
//       Redirect URL : https://ton-domaine.fr/auth/callback
// ─────────────────────────────────────────────────────────────

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Mail, Shield, ChevronRight, RotateCcw, Inbox } from 'lucide-react';
import { createBrowserClient } from '@supabase/ssr';
import { useCart } from '@/context/cart-context';

type Step = 'email' | 'sent' | 'success';

export default function AuthModal() {
  const { isAuthOpen, setIsAuthOpen, login, pendingProduct, addItem, setPendingProduct } = useCart();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const [step, setStep]       = useState<Step>('email');
  const [email, setEmail]     = useState('');
  const [error, setError]     = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthOpen) { setStep('email'); setEmail(''); setError(''); }
  }, [isAuthOpen]);

  // Écoute le retour Magic Link : Supabase met à jour la session automatiquement
  // via le middleware @supabase/ssr. On écoute onAuthStateChange pour réagir
  // côté client (ex. mettre à jour le panier).
  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setStep('success');
        setTimeout(() => {
          login(session.user.email ?? '');
          if (pendingProduct) { addItem(pendingProduct); setPendingProduct(null); }
          setIsAuthOpen(false);
        }, 1500);
      }
    });
    return () => subscription.unsubscribe();
  }, [pendingProduct]);

  const sendMagicLink = async () => {
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError('Adresse email invalide'); return;
    }
    setLoading(true); setError('');
    try {
      const { error: supabaseError } = await supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (supabaseError) throw supabaseError;
      setStep('sent');
    } catch (err: any) {
      setError(err?.message ?? "Erreur lors de l'envoi. Réessayez.");
    }
    setLoading(false);
  };

  // Connexion dev rapide — visible uniquement en NODE_ENV=development
  const handleDevLogin = () => {
    if (!email) { setError("Entrez votre email d'abord"); return; }
    setStep('success');
    setTimeout(() => {
      login(email);
      if (pendingProduct) { addItem(pendingProduct); setPendingProduct(null); }
      setIsAuthOpen(false);
    }, 1500);
  };

  const handleClose = () => { setIsAuthOpen(false); setPendingProduct(null); };

  return (
    <AnimatePresence>
      {isAuthOpen && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={handleClose} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60]" />

          <motion.div initial={{ opacity: 0, scale: 0.92, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: 20 }} transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-0 z-[70] flex items-center justify-center px-4">

            <div className="bg-[#FDFBF7] rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

              <div className="bg-[#2C1810] px-6 pt-8 pb-10 relative overflow-hidden">
                <div className="absolute inset-0 opacity-10"
                  style={{ backgroundImage: 'radial-gradient(circle at 80% 20%, #C19A6B 0%, transparent 50%)' }} />
                <button onClick={handleClose} className="absolute top-4 right-4 text-white/60 hover:text-white transition-colors">
                  <X size={20} />
                </button>
                <div className="relative">
                  <div className="w-12 h-12 bg-[#C19A6B]/20 rounded-xl flex items-center justify-center mb-4">
                    {step === 'sent'    ? <Inbox  size={24} className="text-[#C19A6B]" />
                    : step === 'success' ? <Shield size={24} className="text-[#C19A6B]" />
                    :                     <Mail   size={24} className="text-[#C19A6B]" />}
                  </div>
                  <h2 className="text-white font-bold text-xl mb-1" style={{ fontFamily: 'Playfair Display, serif' }}>
                    {step === 'email'   && 'Connexion'}
                    {step === 'sent'    && 'Email envoyé !'}
                    {step === 'success' && 'Bienvenue !'}
                  </h2>
                  <p className="text-white/60 text-sm">
                    {step === 'email'   && 'Entrez votre adresse email'}
                    {step === 'sent'    && `Vérifiez votre boîte : ${email}`}
                    {step === 'success' && 'Connexion réussie'}
                  </p>
                </div>
              </div>

              <div className="px-6 py-6 -mt-4">
                <div className="bg-white rounded-xl p-5 shadow-sm">
                  <AnimatePresence mode="wait">

                    {step === 'email' && (
                      <motion.div key="email" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                        <div>
                          <label className="text-xs font-medium text-[#2C1810]/60 uppercase tracking-wider mb-2 block">Adresse email</label>
                          <div className="flex items-center border-2 border-[#E8E0D5] rounded-xl overflow-hidden focus-within:border-[#C19A6B] transition-colors">
                            <div className="px-3 py-3 bg-[#F5F0E8] border-r border-[#E8E0D5]">
                              <Mail size={16} className="text-[#2C1810]/40" />
                            </div>
                            <input type="email" value={email}
                              onChange={e => { setEmail(e.target.value); setError(''); }}
                              onKeyDown={e => e.key === 'Enter' && sendMagicLink()}
                              placeholder="vous@exemple.fr"
                              className="flex-1 px-3 py-3 bg-transparent text-[#2C1810] text-sm outline-none" autoFocus />
                          </div>
                        </div>
                        {error && <p className="text-red-500 text-xs">{error}</p>}
                        <p className="text-[#2C1810]/40 text-xs leading-relaxed">
                          Un lien de connexion vous sera envoyé. Aucun mot de passe requis.
                        </p>
                        <button onClick={sendMagicLink} disabled={loading}
                          className="w-full bg-[#C19A6B] hover:bg-[#8B4513] text-white py-3 rounded-xl font-medium text-sm transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-50">
                          {loading
                            ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            : <>Recevoir le lien <ChevronRight size={16} /></>}
                        </button>

                        {process.env.NODE_ENV === 'development' && (
                          <button onClick={handleDevLogin}
                            className="w-full border border-dashed border-[#2C1810]/20 text-[#2C1810]/40 hover:text-[#2C1810]/70 py-2 rounded-xl text-xs transition-colors">
                            Connexion dev rapide
                          </button>
                        )}
                      </motion.div>
                    )}

                    {step === 'sent' && (
                      <motion.div key="sent" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">
                        <div className="text-center py-2">
                          <motion.div animate={{ y: [0, -6, 0] }} transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                            className="w-16 h-16 bg-[#C19A6B]/10 rounded-2xl flex items-center justify-center mx-auto mb-3">
                            <Inbox size={32} className="text-[#C19A6B]" />
                          </motion.div>
                          <p className="text-[#2C1810] font-semibold text-sm">Consultez votre boîte mail</p>
                          <p className="text-[#2C1810]/50 text-xs mt-1 leading-relaxed">
                            Cliquez sur le lien pour vous connecter. Il expire dans <strong>1 heure</strong>.
                          </p>
                        </div>
                        <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700 space-y-1">
                          <p className="font-medium">Vous ne trouvez pas l'email ?</p>
                          <p>→ Vérifiez vos spams</p>
                          <p>→ Expéditeur : <span className="font-mono">noreply@supabase.io</span> (ou ton domaine custom)</p>
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <button onClick={() => setStep('email')} className="text-[#2C1810]/40 hover:text-[#2C1810] transition-colors">
                            ← Changer d'email
                          </button>
                          <button onClick={sendMagicLink} className="text-[#C19A6B] hover:text-[#8B4513] transition-colors flex items-center gap-1">
                            <RotateCcw size={12} /> Renvoyer
                          </button>
                        </div>
                      </motion.div>
                    )}

                    {step === 'success' && (
                      <motion.div key="success" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} className="text-center py-4">
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 15, delay: 0.1 }}
                          className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                          <Shield size={32} className="text-green-600" />
                        </motion.div>
                        <p className="text-[#2C1810] font-semibold">Connexion réussie !</p>
                        <p className="text-[#2C1810]/50 text-sm mt-1">
                          {pendingProduct ? 'Ajout au panier en cours...' : 'Bienvenue !'}
                        </p>
                      </motion.div>
                    )}

                  </AnimatePresence>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
