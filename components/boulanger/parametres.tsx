// components/boulanger/parametres.tsx
// ─────────────────────────────────────────────────────────────
// CORRECTIONS :
//   - testConnection() ne fait plus de fetch Airtable direct depuis le browser
//     (clé API visible dans DevTools / Network tab)
//   - Passe par PATCH /api/boulanger/airtable (proxy serveur sécurisé)
//   - Bouton "Sauvegarder" désactivé tant que le test n'a pas réussi
//   - Champ clé API vidé après sauvegarde réussie
// ─────────────────────────────────────────────────────────────
'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Key, CheckCircle, AlertCircle, Loader2,
  ExternalLink, Eye, EyeOff, Save, Info, Bell
} from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import { supabase } from '@/lib/supabase';
import PushNotificationToggle from './push-notification-toggle';

export default function Parametres() {
  const { user, boulangerie } = useBoulanger();

  // Token pour les notifications push
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: { data: { session: { access_token: string } | null } }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  const [apiKey, setApiKey]       = useState('');
  const [baseId, setBaseId]       = useState('');
  const [showKey, setShowKey]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [testing, setTesting]     = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState('');
  const [saved, setSaved]         = useState(false);

  // ── Récupère le token Supabase courant ────────────────────
  const getToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  // ── Test via proxy serveur (clé jamais exposée au browser) ─
  const testConnection = async () => {
    if (!apiKey || !baseId) {
      setTestResult('error');
      setTestMessage('Renseignez d\'abord la clé API et l\'ID de base');
      return;
    }
    setTesting(true);
    setTestResult(null);

    try {
      const token = await getToken();
      if (!token) {
        setTestResult('error');
        setTestMessage('Session expirée — reconnectez-vous');
        return;
      }

      // Le test passe par PATCH /api/boulanger/airtable
      // La clé n'apparaît jamais dans les DevTools côté réseau client
      const res = await fetch('/api/boulanger/airtable', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ apiKey, baseId }),
      });

      const data = await res.json();

      if (data.valid) {
        setTestResult('success');
        setTestMessage('Connexion réussie ! Clés valides.');
      } else {
        setTestResult('error');
        setTestMessage(data.error ?? 'Clés invalides');
      }
    } catch {
      setTestResult('error');
      setTestMessage('Erreur réseau — vérifiez votre connexion');
    } finally {
      setTesting(false);
    }
  };

  // ── Sauvegarde en base Supabase (chiffrement côté serveur) ─
  const saveCredentials = async () => {
    if (!apiKey || !baseId || testResult !== 'success') return;
    setSaving(true);
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/boulanger/profil', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          airtable_api_key: apiKey,
          airtable_base_id: baseId,
        }),
      });

      if (res.ok) {
        setSaved(true);
        setApiKey('');       // Vide les champs après sauvegarde (sécurité)
        setBaseId('');
        setTestResult(null);
        setTimeout(() => setSaved(false), 3000);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-6">
      <div>
        <p className="text-[#C19A6B] text-xs font-medium tracking-widest uppercase mb-1">
          Configuration
        </p>
        <h2 className="text-white text-2xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
          Paramètres
        </h2>
      </div>

      {/* Info boulangerie */}
      <div className="bg-white/5 border border-white/8 rounded-2xl p-5 space-y-3">
        <div className="flex items-center gap-2.5 mb-3">
          <Database size={15} className="text-[#C19A6B]" />
          <p className="text-white/70 text-sm font-semibold">Votre boulangerie</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-black/20 rounded-xl p-3">
            <p className="text-white/30 text-xs mb-1">Nom</p>
            <p className="text-white text-sm font-medium">{boulangerie?.nom ?? '—'}</p>
          </div>
          <div className="bg-black/20 rounded-xl p-3">
            <p className="text-white/30 text-xs mb-1">Plan</p>
            <p className="text-[#C19A6B] text-sm font-medium capitalize">{boulangerie?.plan ?? '—'}</p>
          </div>
          <div className="bg-black/20 rounded-xl p-3 col-span-2">
            <p className="text-white/30 text-xs mb-1">Email</p>
            <p className="text-white text-sm font-mono">{user?.email ?? '—'}</p>
          </div>
        </div>
      </div>

      {/* Configuration Airtable */}
      <div className="bg-white/5 border border-white/8 rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Key size={15} className="text-[#C19A6B]" />
          <p className="text-white/70 text-sm font-semibold">Catalogue Airtable</p>
        </div>

        <div className="bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-xl p-4 mb-5 flex items-start gap-3">
          <Info size={14} className="text-[#C19A6B] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[#C19A6B] text-xs font-semibold mb-1">Comment ça fonctionne ?</p>
            <p className="text-white/45 text-xs leading-relaxed">
              Votre catalogue (noms, prix, photos) est géré depuis Airtable.
              Vos clés sont transmises et stockées de façon sécurisée — jamais exposées dans le navigateur.
            </p>
            <a
              href="https://support.airtable.com/docs/creating-and-using-api-keys-and-access-tokens"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[#C19A6B] text-xs mt-2 hover:underline"
            >
              Comment créer une clé API Airtable <ExternalLink size={10} />
            </a>
          </div>
        </div>

        <div className="space-y-4">
          {/* Clé API */}
          <div>
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
              Clé API (Personal Access Token)
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setTestResult(null); }}
                placeholder="patXXXXXXXXXXXXXX..."
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors pr-10"
              />
              <button
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50 transition-colors"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Base ID */}
          <div>
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
              ID de la base Airtable
            </label>
            <input
              type="text"
              value={baseId}
              onChange={e => { setBaseId(e.target.value); setTestResult(null); }}
              placeholder="appXXXXXXXXXXXXXX"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm font-mono placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
            />
            <p className="text-white/20 text-xs mt-1 px-1">
              Visible dans l'URL de votre base : airtable.com/<span className="text-[#C19A6B]/50">appXXX</span>/...
            </p>
          </div>

          {/* Résultat test */}
          <AnimatePresence>
            {testResult && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className={`flex items-center gap-2.5 rounded-xl px-3.5 py-3 ${
                  testResult === 'success'
                    ? 'bg-green-500/10 border border-green-500/20'
                    : 'bg-red-500/10 border border-red-500/20'
                }`}
              >
                {testResult === 'success'
                  ? <CheckCircle size={14} className="text-green-400 flex-shrink-0" />
                  : <AlertCircle size={14} className="text-red-400 flex-shrink-0" />
                }
                <p className={`text-sm ${testResult === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {testMessage}
                </p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Boutons */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={testConnection}
              disabled={testing || !apiKey || !baseId}
              className="flex items-center justify-center gap-2 bg-white/8 border border-white/12 text-white/70 py-3 rounded-xl text-sm font-medium hover:bg-white/12 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
              Tester
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={saveCredentials}
              disabled={saving || !apiKey || !baseId || testResult !== 'success'}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                saved
                  ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                  : 'bg-[#C19A6B] text-[#1A0F0A] hover:bg-[#D4AE85]'
              }`}
            >
              {saving ? (
                <Loader2 size={14} className="animate-spin" />
              ) : saved ? (
                <><CheckCircle size={14} /> Sauvegardé</>
              ) : (
                <><Save size={14} /> Sauvegarder</>
              )}
            </motion.button>
          </div>

          {testResult !== 'success' && apiKey && baseId && (
            <p className="text-white/25 text-xs text-center">
              Testez la connexion avant de sauvegarder
            </p>
          )}
        </div>
      </div>

      {/* Notifications Push */}
      <div className="bg-white/5 border border-white/8 rounded-2xl p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <Bell size={15} className="text-[#C19A6B]" />
          <p className="text-white/70 text-sm font-semibold">Notifications push</p>
        </div>
        <PushNotificationToggle token={token} />
      </div>
    </div>
  );
}
