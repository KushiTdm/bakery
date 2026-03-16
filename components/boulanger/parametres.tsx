'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Database, Key, CheckCircle, AlertCircle, Loader2,
  ExternalLink, Eye, EyeOff, Save, Info, Bell,
  MapPin, Clock, Zap, Plus, X, Phone, Mail, Building2,
} from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import { supabase } from '@/lib/supabase';
import PushNotificationToggle from './push-notification-toggle';

// ── Types profil complet ──────────────────────────────────────

interface ProfilComplet {
  id:            string;
  nom:           string;
  slug:          string;
  email_contact: string | null;
  plan:          string;
  actif:         boolean;
  adresse:       string | null;
  ville:         string | null;
  code_postal:   string | null;
  telephone:     string | null;
  flash_heure_debut: number;
  flash_heure_fin:   number;
  flash_remise_pct:  number;
  creneaux_retrait:  string[];
  hasAirtableKey:    boolean;
  hasAirtableBaseId: boolean;
}

// ── Composant Section ─────────────────────────────────────────

function Section({ title, icon: Icon, children }: {
  title:    string;
  icon:     React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white/5 border border-white/8 rounded-2xl p-5">
      <div className="flex items-center gap-2.5 mb-4">
        <Icon size={15} className="text-[#C19A6B]" />
        <p className="text-white/70 text-sm font-semibold">{title}</p>
      </div>
      {children}
    </div>
  );
}

// ── Composant champ texte ─────────────────────────────────────

function Field({
  label, value, onChange, placeholder, type = 'text', hint,
}: {
  label:       string;
  value:       string;
  onChange:    (v: string) => void;
  placeholder?: string;
  type?:       string;
  hint?:       string;
}) {
  return (
    <div>
      <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
      />
      {hint && <p className="text-white/20 text-xs mt-1 px-1">{hint}</p>}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────

export default function Parametres() {
  const { user, boulangerie } = useBoulanger();
  const [token, setToken] = useState<string | null>(null);

  // Profil complet (chargé depuis l'API)
  const [profil, setProfil] = useState<ProfilComplet | null>(null);
  const [loading, setLoading] = useState(true);

  // Section Airtable
  const [apiKey, setApiKey]         = useState('');
  const [baseId, setBaseId]         = useState('');
  const [showKey, setShowKey]       = useState(false);
  const [testing, setTesting]       = useState(false);
  const [testResult, setTestResult] = useState<'success' | 'error' | null>(null);
  const [testMessage, setTestMessage] = useState('');

  // Section Adresse
  const [adresse,    setAdresse]    = useState('');
  const [ville,      setVille]      = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [telephone,  setTelephone]  = useState('');

  // Section Flash
  const [flashDebut,  setFlashDebut]  = useState(18);
  const [flashFin,    setFlashFin]    = useState(20);
  const [flashRemise, setFlashRemise] = useState(40);

  // Section Créneaux
  const [creneaux,    setCreneaux]    = useState<string[]>(['08:00', '09:00', '10:00']);
  const [newCreneau,  setNewCreneau]  = useState('');
  const [creneauError, setCreneauError] = useState('');

  // États sauvegarde
  const [saving,   setSaving]   = useState(false);
  const [saved,    setSaved]    = useState<string | null>(null); // section sauvegardée

  // ── Chargement initial ───────────────────────────────────────

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    loadProfil();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadProfil() {
    setLoading(true);
    try {
      const res = await fetch('/api/boulanger/profil', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json() as ProfilComplet;
      setProfil(data);
      // Initialise les champs depuis le profil
      setAdresse(data.adresse ?? '');
      setVille(data.ville ?? '');
      setCodePostal(data.code_postal ?? '');
      setTelephone(data.telephone ?? '');
      setFlashDebut(data.flash_heure_debut ?? 18);
      setFlashFin(data.flash_heure_fin ?? 20);
      setFlashRemise(data.flash_remise_pct ?? 40);
      setCreneaux(data.creneaux_retrait ?? ['08:00', '09:00', '10:00']);
    } finally {
      setLoading(false);
    }
  }

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  // ── Sauvegarde générique ─────────────────────────────────────

  const saveSection = useCallback(async (section: string, payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const t = await getToken();
      if (!t) return;
      const res = await fetch('/api/boulanger/profil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSaved(section);
        setTimeout(() => setSaved(null), 3000);
        await loadProfil(); // Recharge le profil pour refléter les changements
      }
    } finally {
      setSaving(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Test Airtable ────────────────────────────────────────────

  const testConnection = async () => {
    if (!apiKey || !baseId) {
      setTestResult('error');
      setTestMessage("Renseignez d'abord la clé API et l'ID de base");
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const t = await getToken();
      if (!t) { setTestResult('error'); setTestMessage('Session expirée'); return; }
      const res = await fetch('/api/boulanger/airtable', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify({ apiKey, baseId }),
      });
      const data = await res.json() as { valid: boolean; error?: string };
      if (data.valid) {
        setTestResult('success');
        setTestMessage('Connexion réussie !');
      } else {
        setTestResult('error');
        setTestMessage(data.error ?? 'Clés invalides');
      }
    } catch {
      setTestResult('error');
      setTestMessage('Erreur réseau');
    } finally {
      setTesting(false);
    }
  };

  const saveAirtable = async () => {
    if (!apiKey || !baseId || testResult !== 'success') return;
    await saveSection('airtable', { airtable_api_key: apiKey, airtable_base_id: baseId });
    setApiKey('');
    setBaseId('');
    setTestResult(null);
  };

  // ── Gestion créneaux ─────────────────────────────────────────

  const addCreneau = () => {
    setCreneauError('');
    if (!/^\d{2}:\d{2}$/.test(newCreneau)) {
      setCreneauError('Format invalide (HH:MM)');
      return;
    }
    const [h, m] = newCreneau.split(':').map(Number);
    if (h > 23 || m > 59) {
      setCreneauError('Heure invalide');
      return;
    }
    if (creneaux.includes(newCreneau)) {
      setCreneauError('Ce créneau existe déjà');
      return;
    }
    setCreneaux(prev => [...prev, newCreneau].sort());
    setNewCreneau('');
  };

  const removeCreneau = (c: string) => {
    setCreneaux(prev => prev.filter(x => x !== c));
  };

  // ── Skeleton loader ──────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 pb-6">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-32 bg-white/5 border border-white/8 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

  // ── Rendu principal ──────────────────────────────────────────

  return (
    <div className="space-y-5 pb-6">
      <div>
        <p className="text-[#C19A6B] text-xs font-medium tracking-widest uppercase mb-1">
          Configuration
        </p>
        <h2 className="text-white text-2xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
          Paramètres
        </h2>
      </div>

      {/* ── Infos boulangerie ─────────────────────────────────── */}
      <Section title="Votre boulangerie" icon={Building2}>
        <div className="grid grid-cols-2 gap-3 mb-3">
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
      </Section>

      {/* ── Adresse ──────────────────────────────────────────── */}
      <Section title="Adresse & Contact" icon={MapPin}>
        <div className="space-y-3">
          <Field
            label="Adresse"
            value={adresse}
            onChange={setAdresse}
            placeholder="42 Rue de la Boulangerie"
            hint="Affichée sur la vitrine et les confirmations de commande"
          />
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field
                label="Ville"
                value={ville}
                onChange={setVille}
                placeholder="Paris"
              />
            </div>
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                Code postal
              </label>
              <input
                type="text"
                value={codePostal}
                onChange={e => setCodePostal(e.target.value.replace(/\D/g, '').slice(0, 5))}
                placeholder="75001"
                maxLength={5}
                className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
              />
            </div>
          </div>
          <Field
            label="Téléphone"
            value={telephone}
            onChange={setTelephone}
            placeholder="+33 1 42 86 95 22"
            type="tel"
          />

          <SaveButton
            onClick={() => saveSection('adresse', { adresse, ville, code_postal: codePostal || null, telephone: telephone || null })}
            saving={saving}
            saved={saved === 'adresse'}
          />
        </div>
      </Section>

      {/* ── Créneaux de retrait ───────────────────────────────── */}
      <Section title="Créneaux de retrait" icon={Clock}>
        <p className="text-white/35 text-xs mb-3 leading-relaxed">
          Heures proposées aux clients lors du Click & Collect. Au moins 1 créneau requis.
        </p>

        <div className="flex flex-wrap gap-2 mb-3">
          {creneaux.map(c => (
            <div
              key={c}
              className="flex items-center gap-1.5 bg-[#C19A6B]/15 border border-[#C19A6B]/25 rounded-xl px-3 py-1.5"
            >
              <span className="text-[#C19A6B] text-sm font-mono font-bold">{c}</span>
              <button
                onClick={() => removeCreneau(c)}
                disabled={creneaux.length <= 1}
                className="text-[#C19A6B]/50 hover:text-red-400 transition-colors disabled:opacity-20"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>

        {/* Ajout créneau */}
        <div className="flex gap-2 mb-2">
          <input
            type="time"
            value={newCreneau}
            onChange={e => setNewCreneau(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && addCreneau()}
            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-sm outline-none focus:border-[#C19A6B]/50 transition-colors"
          />
          <button
            onClick={addCreneau}
            className="flex items-center gap-1.5 bg-[#C19A6B]/15 border border-[#C19A6B]/25 text-[#C19A6B] px-3 py-2 rounded-xl text-sm font-medium hover:bg-[#C19A6B]/25 transition-colors"
          >
            <Plus size={14} /> Ajouter
          </button>
        </div>
        {creneauError && (
          <p className="text-red-400 text-xs mb-2">{creneauError}</p>
        )}

        <SaveButton
          onClick={() => saveSection('creneaux', { creneaux_retrait: creneaux })}
          saving={saving}
          saved={saved === 'creneaux'}
        />
      </Section>

      {/* ── Configuration Flash ───────────────────────────────── */}
      <Section title="Flash Invendus" icon={Zap}>
        <p className="text-white/35 text-xs mb-4 leading-relaxed">
          Paramètres de la vente flash du soir. Les modifications sont appliquées en temps réel sur la vitrine.
        </p>

        <div className="space-y-4">
          {/* Heures */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                Heure de début
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={14}
                  max={22}
                  value={flashDebut}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    if (v < flashFin) setFlashDebut(v);
                  }}
                  className="flex-1 accent-[#C19A6B]"
                />
                <span className="text-[#C19A6B] font-mono font-bold text-sm w-10 text-right">
                  {flashDebut}h
                </span>
              </div>
            </div>
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                Heure de fin
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={15}
                  max={23}
                  value={flashFin}
                  onChange={e => {
                    const v = parseInt(e.target.value);
                    if (v > flashDebut) setFlashFin(v);
                  }}
                  className="flex-1 accent-[#C19A6B]"
                />
                <span className="text-[#C19A6B] font-mono font-bold text-sm w-10 text-right">
                  {flashFin}h
                </span>
              </div>
            </div>
          </div>

          {/* Aperçu plage horaire */}
          <div className="bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <Zap size={14} className="text-[#C19A6B] flex-shrink-0" />
            <p className="text-[#C19A6B]/80 text-sm">
              Flash actif de <strong>{flashDebut}h</strong> à <strong>{flashFin}h</strong>
              {' '}· durée <strong>{flashFin - flashDebut}h</strong>
            </p>
          </div>

          {/* Remise */}
          <div>
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
              Remise appliquée — actuellement <span className="text-yellow-400 font-bold">{flashRemise}%</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={10}
                max={70}
                step={5}
                value={flashRemise}
                onChange={e => setFlashRemise(parseInt(e.target.value))}
                className="flex-1 accent-yellow-400"
              />
              <span className="text-yellow-400 font-mono font-bold text-lg w-12 text-right">
                −{flashRemise}%
              </span>
            </div>
            <div className="flex justify-between text-white/20 text-[10px] mt-1 px-1">
              <span>−10%</span>
              <span>Recommandé : 30–50%</span>
              <span>−70%</span>
            </div>
          </div>

          {/* Aperçu prix */}
          <div className="bg-white/4 border border-white/8 rounded-xl p-3">
            <p className="text-white/30 text-xs mb-2">Exemple avec une baguette à 1,30€</p>
            <div className="flex items-center gap-3">
              <span className="text-white/40 text-sm line-through">1,30€</span>
              <span className="text-yellow-400 font-bold">
                {(1.30 * (1 - flashRemise / 100)).toFixed(2)}€
              </span>
              <span className="bg-yellow-400/20 text-yellow-400 text-xs px-2 py-0.5 rounded-full">
                Économie {(1.30 * flashRemise / 100).toFixed(2)}€
              </span>
            </div>
          </div>

          <SaveButton
            onClick={() => saveSection('flash', {
              flash_heure_debut: flashDebut,
              flash_heure_fin:   flashFin,
              flash_remise_pct:  flashRemise,
            })}
            saving={saving}
            saved={saved === 'flash'}
          />
        </div>
      </Section>

      {/* ── Airtable ──────────────────────────────────────────── */}
      <Section title="Catalogue Airtable (optionnel)" icon={Key}>
        <div className="bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-xl p-3 mb-4 flex items-start gap-2">
          <Info size={13} className="text-[#C19A6B] flex-shrink-0 mt-0.5" />
          <p className="text-white/45 text-xs leading-relaxed">
            Connectez Airtable pour synchroniser votre catalogue externe.
            <a
              href="https://support.airtable.com/docs/creating-and-using-api-keys-and-access-tokens"
              target="_blank" rel="noopener noreferrer"
              className="text-[#C19A6B] ml-1 hover:underline inline-flex items-center gap-0.5"
            >
              Créer une clé API <ExternalLink size={10} />
            </a>
          </p>
        </div>

        {/* Status clés existantes */}
        {profil && (profil.hasAirtableKey || profil.hasAirtableBaseId) && (
          <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-xl px-3 py-2 mb-3">
            <CheckCircle size={13} className="text-green-400 flex-shrink-0" />
            <p className="text-green-400 text-xs">Clés Airtable configurées · Modifier pour mettre à jour</p>
          </div>
        )}

        <div className="space-y-3">
          <div className="relative">
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
              Clé API (Personal Access Token)
            </label>
            <div className="relative">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={e => { setApiKey(e.target.value); setTestResult(null); }}
                placeholder="patXXXXXXXXXXXXXX..."
                className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm font-mono placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors pr-10"
              />
              <button
                onClick={() => setShowKey(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/50"
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          <Field
            label="ID de la base Airtable"
            value={baseId}
            onChange={e => { setBaseId(e); setTestResult(null); }}
            placeholder="appXXXXXXXXXXXXXX"
            hint="Visible dans l'URL de votre base : airtable.com/appXXX/..."
          />

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

          <div className="grid grid-cols-2 gap-3">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={testConnection}
              disabled={testing || !apiKey || !baseId}
              className="flex items-center justify-center gap-2 bg-white/8 border border-white/12 text-white/70 py-3 rounded-xl text-sm font-medium hover:bg-white/12 transition-all disabled:opacity-40"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Database size={14} />}
              Tester
            </motion.button>

            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={saveAirtable}
              disabled={saving || !apiKey || !baseId || testResult !== 'success'}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-40 ${
                saved === 'airtable'
                  ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                  : 'bg-[#C19A6B] text-[#1A0F0A] hover:bg-[#D4AE85]'
              }`}
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> :
               saved === 'airtable' ? <><CheckCircle size={14} /> Sauvegardé</> :
               <><Save size={14} /> Sauvegarder</>}
            </motion.button>
          </div>
        </div>
      </Section>

      {/* ── Notifications Push ────────────────────────────────── */}
      <Section title="Notifications push" icon={Bell}>
        <PushNotificationToggle token={token} />
      </Section>
    </div>
  );
}

// ── Bouton sauvegarde réutilisable ────────────────────────────

function SaveButton({
  onClick, saving, saved,
}: {
  onClick: () => void;
  saving:  boolean;
  saved:   boolean;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      disabled={saving}
      className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 mt-2 ${
        saved
          ? 'bg-green-500/15 border border-green-500/25 text-green-400'
          : 'bg-[#C19A6B]/15 border border-[#C19A6B]/25 text-[#C19A6B] hover:bg-[#C19A6B]/25'
      }`}
    >
      {saving
        ? <><Loader2 size={14} className="animate-spin" /> Sauvegarde…</>
        : saved
          ? <><CheckCircle size={14} /> Sauvegardé</>
          : <><Save size={14} /> Sauvegarder</>
      }
    </motion.button>
  );
}