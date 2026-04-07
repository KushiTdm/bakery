'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  CheckCircle, Loader2, Save, Image as ImageIcon,
  Clock, Plus, Trash2, BookOpen, Upload,
} from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import { supabase } from '@/lib/supabase';

// ── Types ────────────────────────────────────────────────────

interface Horaire {
  day:   string;
  hours: string;
}

// ── Sous-composants réutilisables ────────────────────────────

function Section({ title, icon: Icon, children }: {
  title: string;
  icon: React.ElementType;
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

function Field({
  label, value, onChange, placeholder, maxLength, multiline, hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  maxLength?: number;
  multiline?: boolean;
  hint?: string;
}) {
  const charCount = value.length;
  const Component = multiline ? 'textarea' : 'input';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-white/40 text-xs uppercase tracking-wider">{label}</label>
        {maxLength && (
          <span className={`text-xs ${charCount > maxLength * 0.9 ? 'text-amber-400' : 'text-white/20'}`}>
            {charCount}/{maxLength}
          </span>
        )}
      </div>
      <Component
        value={value}
        onChange={e => onChange(maxLength ? e.target.value.slice(0, maxLength) : e.target.value)}
        placeholder={placeholder}
        maxLength={maxLength}
        rows={multiline ? 4 : undefined}
        className={`w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors ${multiline ? 'resize-none' : ''}`}
      />
      {hint && <p className="text-white/20 text-xs mt-1 px-1">{hint}</p>}
    </div>
  );
}

function SaveButton({ onClick, saving, saved }: {
  onClick: () => void;
  saving: boolean;
  saved: boolean;
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

// ── Upload image ─────────────────────────────────────────────

function ImageUpload({
  label, currentUrl, type, token, onUploaded,
}: {
  label: string;
  currentUrl: string | null;
  type: 'hero' | 'about';
  token: string | null;
  onUploaded: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError]         = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    if (!token) return;
    setUploading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      const res = await fetch('/api/boulanger/vitrine/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Erreur upload');
        return;
      }
      onUploaded(data.image_url);
    } catch {
      setError('Erreur réseau');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <label className="text-white/40 text-xs uppercase tracking-wider block mb-2">{label}</label>

      {currentUrl && (
        <div className="relative rounded-xl overflow-hidden mb-3">
          <img
            src={currentUrl}
            alt={label}
            className="w-full h-40 object-cover rounded-xl"
          />
          <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
            <button
              onClick={() => fileRef.current?.click()}
              className="bg-white/20 backdrop-blur-sm text-white text-xs font-medium px-4 py-2 rounded-lg"
            >
              Changer l'image
            </button>
          </div>
        </div>
      )}

      {!currentUrl && (
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="w-full h-32 border-2 border-dashed border-white/15 rounded-xl flex flex-col items-center justify-center gap-2 text-white/30 hover:text-white/50 hover:border-white/25 transition-colors"
        >
          {uploading
            ? <Loader2 size={20} className="animate-spin" />
            : <>
                <Upload size={20} />
                <span className="text-xs">Cliquez pour ajouter une image</span>
                <span className="text-[10px] text-white/15">JPG, PNG, WebP · 5 MB max</span>
              </>
          }
        </button>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0];
          if (f) handleUpload(f);
          e.target.value = '';
        }}
      />

      {error && (
        <p className="text-red-400 text-xs mt-2">{error}</p>
      )}
    </div>
  );
}

// ── Composant principal ──────────────────────────────────────

const DEFAULT_HORAIRES: Horaire[] = [
  { day: 'Lundi — Vendredi', hours: '6h30 – 20h00' },
  { day: 'Samedi',           hours: '7h00 – 20h00' },
  { day: 'Dimanche',         hours: '7h00 – 13h00' },
];

export default function VitrinEditor() {
  const { userRole } = useBoulanger();
  const [token, setToken]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Champs éditables
  const [histoire, setHistoire] = useState('');
  const [heroUrl, setHeroUrl]   = useState<string | null>(null);

  // Horaires
  const [horaires,     setHoraires]     = useState<Horaire[]>(DEFAULT_HORAIRES);
  const [newDay,       setNewDay]       = useState('');
  const [newHours,     setNewHours]     = useState('');
  const [horaireError, setHoraireError] = useState('');

  // Sauvegarde
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
    });
  }, []);

  useEffect(() => {
    if (!token) return;
    loadVitrine();
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadVitrine() {
    setLoading(true);
    try {
      const res = await fetch('/api/boulanger/profil', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setHistoire(data.vitrine_histoire ?? '');
      setHeroUrl(data.vitrine_hero_image_url ?? null);
      setHoraires(data.vitrine_horaires ?? DEFAULT_HORAIRES);
    } finally {
      setLoading(false);
    }
  }

  const saveSection = useCallback(async (section: string, payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const t = session?.access_token;
      if (!t) return;
      const res = await fetch('/api/boulanger/profil', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${t}` },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        setSaved(section);
        setTimeout(() => setSaved(null), 3000);
      }
    } finally {
      setSaving(false);
    }
  }, []);

  const addHoraire = () => {
    setHoraireError('');
    if (!newDay.trim() || !newHours.trim()) {
      setHoraireError('Remplissez le jour et les horaires');
      return;
    }
    if (horaires.length >= 10) {
      setHoraireError('Maximum 10 lignes');
      return;
    }
    setHoraires(prev => [...prev, { day: newDay.trim(), hours: newHours.trim() }]);
    setNewDay('');
    setNewHours('');
  };

  const removeHoraire = (index: number) => {
    setHoraires(prev => prev.filter((_, i) => i !== index));
  };

  // Accès owner uniquement
  if (userRole !== 'owner') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ImageIcon size={32} className="text-white/15 mb-4" />
        <p className="text-white/40 text-sm font-medium">Accès réservé au propriétaire</p>
        <p className="text-white/20 text-xs mt-1">Seul le propriétaire peut personnaliser la vitrine.</p>
      </div>
    );
  }

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
          Personnalisation
        </p>
        <h2 className="text-white text-2xl font-bold" style={{ fontFamily: 'Playfair Display, serif' }}>
          Vitrine publique
        </h2>
        <p className="text-white/30 text-xs mt-1">
          Personnalisez la page d'accueil visible par vos clients.
        </p>
      </div>

      {/* ── Image de fond ────────────────────────────────────── */}
      <Section title="Image de fond" icon={ImageIcon}>
        <div className="space-y-3">
          <p className="text-white/35 text-xs leading-relaxed">
            Photo principale affichée en plein écran sur votre page d'accueil.
          </p>
          <ImageUpload
            label="Image hero"
            currentUrl={heroUrl}
            type="hero"
            token={token}
            onUploaded={(url) => { setHeroUrl(url); }}
          />
        </div>
      </Section>

      {/* ── Notre histoire ───────────────────────────────────── */}
      <Section title="Notre histoire" icon={BookOpen}>
        <div className="space-y-3">
          <Field
            label="Texte de présentation"
            value={histoire}
            onChange={setHistoire}
            placeholder="Présentez votre boulangerie en quelques mots..."
            maxLength={400}
            multiline
            hint="Texte affiché dans la section 'Notre histoire' (optionnel)"
          />
          <SaveButton
            onClick={() => saveSection('histoire', {
              vitrine_histoire: histoire || null,
            })}
            saving={saving}
            saved={saved === 'histoire'}
          />
        </div>
      </Section>

      {/* ── Horaires d'ouverture ─────────────────────────────── */}
      <Section title="Horaires d'ouverture" icon={Clock}>
        <p className="text-white/35 text-xs mb-3 leading-relaxed">
          Horaires affichés dans le pied de page de votre vitrine.
        </p>

        <div className="space-y-2 mb-4">
          {horaires.map((h, i) => (
            <div
              key={i}
              className="flex items-center gap-2 bg-black/20 rounded-xl px-3 py-2"
            >
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{h.day}</p>
                <p className="text-white/50 text-xs">{h.hours}</p>
              </div>
              <button
                onClick={() => removeHoraire(i)}
                className="text-white/20 hover:text-red-400 transition-colors flex-shrink-0"
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-2 mb-2">
          <input
            type="text"
            value={newDay}
            onChange={e => setNewDay(e.target.value)}
            placeholder="Jour (ex: Lundi — Vendredi)"
            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
          />
          <input
            type="text"
            value={newHours}
            onChange={e => setNewHours(e.target.value)}
            placeholder="Horaires (ex: 6h30 – 20h00)"
            onKeyDown={e => e.key === 'Enter' && addHoraire()}
            className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
          />
          <button
            onClick={addHoraire}
            className="flex items-center gap-1.5 bg-[#C19A6B]/15 border border-[#C19A6B]/25 text-[#C19A6B] px-3 py-2 rounded-xl text-sm font-medium hover:bg-[#C19A6B]/25 transition-colors flex-shrink-0"
          >
            <Plus size={14} />
          </button>
        </div>
        {horaireError && <p className="text-red-400 text-xs mb-2">{horaireError}</p>}

        <SaveButton
          onClick={() => saveSection('horaires', {
            vitrine_horaires: horaires,
          })}
          saving={saving}
          saved={saved === 'horaires'}
        />
      </Section>
    </div>
  );
}
