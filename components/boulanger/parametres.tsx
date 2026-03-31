'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CheckCircle, Loader2, Save, Bell,
  MapPin, Clock, Zap, Plus, X, Building2,
  Download, Shield, AlertTriangle, Globe,
} from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import { supabase } from '@/lib/supabase';
import PushNotificationToggle from './push-notification-toggle';

// ── Types profil ──────────────────────────────────────────────

const TIMEZONES: { label: string; value: string }[] = [
  { label: 'Paris (UTC+1/+2)',         value: 'Europe/Paris' },
  { label: 'Londres (UTC+0/+1)',        value: 'Europe/London' },
  { label: 'Berlin (UTC+1/+2)',         value: 'Europe/Berlin' },
  { label: 'Madrid (UTC+1/+2)',         value: 'Europe/Madrid' },
  { label: 'Rome (UTC+1/+2)',           value: 'Europe/Rome' },
  { label: 'New York (UTC-5/-4)',       value: 'America/New_York' },
  { label: 'Chicago (UTC-6/-5)',        value: 'America/Chicago' },
  { label: 'Denver (UTC-7/-6)',         value: 'America/Denver' },
  { label: 'Los Angeles (UTC-8/-7)',    value: 'America/Los_Angeles' },
  { label: 'Bogotá (UTC-5)',            value: 'America/Bogota' },
  { label: 'Lima (UTC-5)',              value: 'America/Lima' },
  { label: 'Santiago (UTC-4/-3)',       value: 'America/Santiago' },
  { label: 'São Paulo (UTC-3)',         value: 'America/Sao_Paulo' },
  { label: 'Buenos Aires (UTC-3)',      value: 'America/Buenos_Aires' },
  { label: 'Mexico City (UTC-6/-5)',    value: 'America/Mexico_City' },
  { label: 'Montréal (UTC-5/-4)',       value: 'America/Montreal' },
  { label: 'Toronto (UTC-5/-4)',        value: 'America/Toronto' },
  { label: 'Vancouver (UTC-8/-7)',      value: 'America/Vancouver' },
  { label: 'Casablanca (UTC+1)',        value: 'Africa/Casablanca' },
  { label: 'Tunis (UTC+1)',             value: 'Africa/Tunis' },
  { label: 'Abidjan (UTC+0)',           value: 'Africa/Abidjan' },
  { label: 'Dubai (UTC+4)',             value: 'Asia/Dubai' },
  { label: 'Beyrouth (UTC+2/+3)',       value: 'Asia/Beirut' },
  { label: 'Tokyo (UTC+9)',             value: 'Asia/Tokyo' },
  { label: 'Shanghai (UTC+8)',          value: 'Asia/Shanghai' },
  { label: 'Singapour (UTC+8)',         value: 'Asia/Singapore' },
  { label: 'Sydney (UTC+10/+11)',       value: 'Australia/Sydney' },
  { label: 'Auckland (UTC+12/+13)',     value: 'Pacific/Auckland' },
];

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
  timezone:          string;
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
  label:        string;
  value:        string;
  onChange:     (v: string) => void;
  placeholder?: string;
  type?:        string;
  hint?:        string;
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

// ── Bouton sauvegarde ─────────────────────────────────────────

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

// ── Section Export RGPD ───────────────────────────────────────

function ExportRgpd({ token }: { token: string | null }) {
  const [exporting,     setExporting]     = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError,   setExportError]   = useState('');

  async function handleExport() {
    if (!token) return;
    setExporting(true);
    setExportError('');
    setExportSuccess(false);

    try {
      const res = await fetch('/api/boulanger/export', {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setExportError(data.error ?? 'Erreur lors de l\'export');
        return;
      }

      // Téléchargement automatique via Blob
      const blob       = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const filenameMatch = disposition.match(/filename="([^"]+)"/);
      const filename      = filenameMatch?.[1] ?? 'bakeryos-export.json';

      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href     = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);

      setExportSuccess(true);
      setTimeout(() => setExportSuccess(false), 5000);
    } catch {
      setExportError('Erreur réseau — réessayez');
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-white/35 text-xs leading-relaxed">
        Téléchargez l'intégralité de vos données BakeryOS au format JSON (Art. 20 RGPD — droit à la portabilité).
        L'export inclut votre boulangerie, produits, journées, stocks, commandes et rapports IA des 90 derniers jours.
      </p>

      {/* Info accès */}
      <div className="flex items-start gap-3 bg-[#C19A6B]/8 border border-[#C19A6B]/15 rounded-xl px-4 py-3">
        <Shield size={13} className="text-[#C19A6B]/70 flex-shrink-0 mt-0.5" />
        <p className="text-[#C19A6B]/70 text-xs leading-relaxed">
          Réservé au propriétaire du compte. Chaque export est tracé dans les logs d'audit.
        </p>
      </div>

      {/* Feedback erreur */}
      {exportError && (
        <div className="flex items-start gap-2.5 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          <AlertTriangle size={13} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-400 text-xs">{exportError}</p>
        </div>
      )}

      {/* Feedback succès */}
      <AnimatePresence>
        {exportSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex items-center gap-2.5 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3"
          >
            <CheckCircle size={13} className="text-green-400 flex-shrink-0" />
            <p className="text-green-400 text-xs">Export téléchargé avec succès.</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bouton export */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleExport}
        disabled={exporting || !token}
        className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all disabled:opacity-50 ${
          exportSuccess
            ? 'bg-green-500/15 border border-green-500/25 text-green-400'
            : 'bg-white/6 border border-white/12 text-white/70 hover:bg-white/10 hover:text-white'
        }`}
      >
        {exporting
          ? <><Loader2 size={14} className="animate-spin" /> Export en cours…</>
          : exportSuccess
            ? <><CheckCircle size={14} /> Export téléchargé</>
            : <><Download size={14} /> Télécharger mes données (JSON)</>
        }
      </motion.button>
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────

export default function Parametres() {
  const { user, boulangerie, userRole } = useBoulanger();
  const [token, setToken]     = useState<string | null>(null);
  const [profil, setProfil]   = useState<ProfilComplet | null>(null);
  const [loading, setLoading] = useState(true);

  // Section Adresse
  const [adresse,    setAdresse]    = useState('');
  const [ville,      setVille]      = useState('');
  const [codePostal, setCodePostal] = useState('');
  const [telephone,  setTelephone]  = useState('');

  // Section Timezone
  const [timezone, setTimezone] = useState('Europe/Paris');

  // Section Flash
  const [flashDebut,  setFlashDebut]  = useState(18);
  const [flashFin,    setFlashFin]    = useState(20);
  const [flashRemise, setFlashRemise] = useState(40);

  // Section Créneaux
  const [creneaux,     setCreneaux]     = useState<string[]>(['08:00', '09:00', '10:00']);
  const [newCreneau,   setNewCreneau]   = useState('');
  const [creneauError, setCreneauError] = useState('');

  // États sauvegarde
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState<string | null>(null);

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
      setAdresse(data.adresse ?? '');
      setVille(data.ville ?? '');
      setCodePostal(data.code_postal ?? '');
      setTelephone(data.telephone ?? '');
      setFlashDebut(data.flash_heure_debut ?? 18);
      setFlashFin(data.flash_heure_fin ?? 20);
      setFlashRemise(data.flash_remise_pct ?? 40);
      setCreneaux(data.creneaux_retrait ?? ['08:00', '09:00', '10:00']);
      setTimezone(data.timezone ?? 'Europe/Paris');
    } finally {
      setLoading(false);
    }
  }

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

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
        await loadProfil();
      }
    } finally {
      setSaving(false);
    }
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

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

  if (loading) {
    return (
      <div className="space-y-4 pb-6">
        {[1, 2, 3].map(i => (
          <div key={i} className="h-32 bg-white/5 border border-white/8 rounded-2xl animate-pulse" />
        ))}
      </div>
    );
  }

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
              <Field label="Ville" value={ville} onChange={setVille} placeholder="Paris" />
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

      {/* ── Timezone ─────────────────────────────────────────── */}
      <Section title="Fuseau horaire" icon={Globe}>
        <p className="text-white/35 text-xs mb-3 leading-relaxed">
          Définit le "aujourd'hui" utilisé pour les commandes, stocks et rapports.
          Changez-le si vous gérez votre boulangerie depuis un autre pays.
        </p>
        <div className="space-y-3">
          <div>
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
              Fuseau horaire de la boulangerie
            </label>
            <select
              value={timezone}
              onChange={e => setTimezone(e.target.value)}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm outline-none focus:border-[#C19A6B]/50 transition-colors appearance-none"
            >
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>{tz.label}</option>
              ))}
            </select>
          </div>
          <div className="bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-xl px-4 py-3">
            <p className="text-[#C19A6B]/80 text-xs">
              Heure locale actuelle :{' '}
              <strong>
                {new Date().toLocaleTimeString('fr-FR', { timeZone: timezone, hour: '2-digit', minute: '2-digit' })}
              </strong>
              {' '}· Date :{' '}
              <strong>
                {new Intl.DateTimeFormat('fr-FR', { timeZone: timezone, day: '2-digit', month: 'long' }).format(new Date())}
              </strong>
            </p>
          </div>
          <SaveButton
            onClick={() => saveSection('timezone', { timezone })}
            saving={saving}
            saved={saved === 'timezone'}
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
        {creneauError && <p className="text-red-400 text-xs mb-2">{creneauError}</p>}
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
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                Heure de début
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={14} max={22} value={flashDebut}
                  onChange={e => { const v = parseInt(e.target.value); if (v < flashFin) setFlashDebut(v); }}
                  className="flex-1 accent-[#C19A6B]"
                />
                <span className="text-[#C19A6B] font-mono font-bold text-sm w-10 text-right">{flashDebut}h</span>
              </div>
            </div>
            <div>
              <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                Heure de fin
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="range" min={15} max={23} value={flashFin}
                  onChange={e => { const v = parseInt(e.target.value); if (v > flashDebut) setFlashFin(v); }}
                  className="flex-1 accent-[#C19A6B]"
                />
                <span className="text-[#C19A6B] font-mono font-bold text-sm w-10 text-right">{flashFin}h</span>
              </div>
            </div>
          </div>
          <div className="bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-xl px-4 py-3 flex items-center gap-3">
            <Zap size={14} className="text-[#C19A6B] flex-shrink-0" />
            <p className="text-[#C19A6B]/80 text-sm">
              Flash actif de <strong>{flashDebut}h</strong> à <strong>{flashFin}h</strong>
              {' '}· durée <strong>{flashFin - flashDebut}h</strong>
            </p>
          </div>
          <div>
            <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
              Remise — actuellement <span className="text-yellow-400 font-bold">{flashRemise}%</span>
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range" min={10} max={70} step={5} value={flashRemise}
                onChange={e => setFlashRemise(parseInt(e.target.value))}
                className="flex-1 accent-yellow-400"
              />
              <span className="text-yellow-400 font-mono font-bold text-lg w-12 text-right">−{flashRemise}%</span>
            </div>
            <div className="flex justify-between text-white/20 text-[10px] mt-1 px-1">
              <span>−10%</span>
              <span>Recommandé : 30–50%</span>
              <span>−70%</span>
            </div>
          </div>
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

      {/* ── Notifications Push ────────────────────────────────── */}
      <Section title="Notifications push" icon={Bell}>
        <PushNotificationToggle token={token} />
      </Section>

      {/* ── Export RGPD — owner uniquement ───────────────────── */}
      {userRole === 'owner' && (
        <Section title="Données & Confidentialité" icon={Shield}>
          <ExportRgpd token={token} />
        </Section>
      )}
    </div>
  );
}