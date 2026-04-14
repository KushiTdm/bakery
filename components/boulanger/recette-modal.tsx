'use client';

// components/boulanger/recette-modal.tsx
// ─────────────────────────────────────────────────────────────
// Modal d'édition de recette MP pour un produit.
// Permet au boulanger de définir les ingrédients par unité produite.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X, Save, Loader2, CheckCircle, AlertTriangle,
  RotateCcw, FlaskConical, Info,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { RecipeStatus } from '@/app/api/boulanger/recettes/route';

// ── Types ─────────────────────────────────────────────────────

interface RecetteProduit {
  farine_g:            number;
  beurre_g:            number;
  oeufs_n:             number;
  sucre_g:             number;
  sel_g:               number;
  levure_boulangere_g: number;
  levain_g:            number;
  eau_ml:              number;
  lait_ml:             number;
  chocolat_g:          number;
  huile_ml:            number;
  creme_g:             number;
  source?:             'manual' | 'auto' | 'default';
}

interface RecetteModalProps {
  produitId:    string;
  produitNom:   string;
  produitEmoji: string;
  status:       RecipeStatus;
  recette:      RecetteProduit | null;
  onClose:      () => void;
  onSaved:      () => void;
}

// ── Définition des ingrédients ────────────────────────────────

interface IngredientDef {
  key:    keyof Omit<RecetteProduit, 'source'>;
  label:  string;
  unit:   string;
  emoji:  string;
  hint?:  string;
  step?:  string;
}

const INGREDIENTS: IngredientDef[] = [
  { key: 'farine_g',            label: 'Farine',              unit: 'g',  emoji: '🌾' },
  { key: 'beurre_g',            label: 'Beurre',              unit: 'g',  emoji: '🧈' },
  { key: 'oeufs_n',             label: 'Œufs',                unit: 'nb', emoji: '🥚', hint: '0,3 = tiers d\'œuf', step: '0.1' },
  { key: 'sucre_g',             label: 'Sucre',               unit: 'g',  emoji: '🍬' },
  { key: 'sel_g',               label: 'Sel',                 unit: 'g',  emoji: '🧂' },
  { key: 'levure_boulangere_g', label: 'Levure boulangère',   unit: 'g',  emoji: '🍄', hint: 'Fraîche, pas chimique' },
  { key: 'levain_g',            label: 'Levain',              unit: 'g',  emoji: '🫙', hint: 'Levain naturel actif' },
  { key: 'eau_ml',              label: 'Eau',                 unit: 'ml', emoji: '💧' },
  { key: 'lait_ml',             label: 'Lait',                unit: 'ml', emoji: '🥛' },
  { key: 'chocolat_g',          label: 'Chocolat',            unit: 'g',  emoji: '🍫' },
  { key: 'huile_ml',            label: 'Huile',               unit: 'ml', emoji: '🫒' },
  { key: 'creme_g',             label: 'Crème',               unit: 'g',  emoji: '🍦' },
];

const EMPTY_RECETTE: RecetteProduit = {
  farine_g: 0, beurre_g: 0, oeufs_n: 0, sucre_g: 0,
  sel_g: 0, levure_boulangere_g: 0, levain_g: 0,
  eau_ml: 0, lait_ml: 0, chocolat_g: 0, huile_ml: 0, creme_g: 0,
};

// ── Helpers ───────────────────────────────────────────────────

const STATUS_LABELS: Record<RecipeStatus, { label: string; color: string }> = {
  specific:  { label: 'Recette personnalisée',     color: 'text-green-400' },
  template:  { label: 'Modèle auto (similaire)',   color: 'text-amber-400' },
  categorie: { label: 'Estimation par catégorie',  color: 'text-orange-400' },
};

// ── Composant ─────────────────────────────────────────────────

export default function RecetteModal({
  produitId, produitNom, produitEmoji,
  status, recette, onClose, onSaved,
}: RecetteModalProps) {
  const [form,      setForm]      = useState<RecetteProduit>(recette ? { ...EMPTY_RECETTE, ...recette } : EMPTY_RECETTE);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [resetting, setResetting] = useState(false);
  const [error,     setError]     = useState('');

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const setField = (key: keyof Omit<RecetteProduit, 'source'>, value: number) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  // Sauvegarde la recette personnalisée
  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const token = await getToken();
      if (!token) { setError('Session expirée'); return; }

      const res = await fetch('/api/boulanger/recettes', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({ produit_id: produitId, ...form }),
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Erreur lors de la sauvegarde');
        return;
      }

      setSaved(true);
      setTimeout(() => { setSaved(false); onSaved(); onClose(); }, 1400);
    } finally {
      setSaving(false);
    }
  };

  // Supprime la recette personnalisée (retour au modèle ou catégorie)
  const handleReset = async () => {
    if (status !== 'specific') return;
    setResetting(true);
    setError('');
    try {
      const token = await getToken();
      if (!token) { setError('Session expirée'); return; }

      const res = await fetch(`/api/boulanger/recettes?produit_id=${produitId}`, {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const data = await res.json() as { error?: string };
        setError(data.error ?? 'Erreur lors de la suppression');
        return;
      }

      onSaved();
      onClose();
    } finally {
      setResetting(false);
    }
  };

  const statusInfo = STATUS_LABELS[status];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center"
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Panel */}
      <motion.div
        initial={{ y: '100%', opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 32, stiffness: 300 }}
        className="relative z-10 w-full max-w-lg mx-auto sm:rounded-3xl rounded-t-3xl overflow-hidden flex flex-col"
        style={{
          background:  '#130B06',
          border:      '1px solid rgba(193,154,107,0.15)',
          maxHeight:   '90dvh',
        }}
      >
        {/* ── Header ────────────────────────────────────────── */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-white/6 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0"
            style={{ background: 'rgba(193,154,107,0.10)', border: '1px solid rgba(193,154,107,0.15)' }}>
            {produitEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm truncate">{produitNom}</p>
            <p className={`text-[10px] font-medium mt-0.5 ${statusInfo.color}`}>
              {statusInfo.label}
            </p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
            style={{ background: 'rgba(255,255,255,0.05)' }}
          >
            <X size={14} />
          </button>
        </div>

        {/* ── Corps scrollable ───────────────────────────────── */}
        <div className="overflow-y-auto flex-1 min-h-0 p-5 space-y-4">

          {/* Disclaimer légal */}
          <div className="flex items-start gap-3 rounded-xl px-4 py-3"
            style={{ background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.18)' }}>
            <FlaskConical size={13} className="text-amber-400/70 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400/90 text-[11px] font-semibold mb-0.5">
                Estimation expérimentale — usage indicatif uniquement
              </p>
              <p className="text-amber-400/55 text-[10px] leading-relaxed">
                Ces calculs de matières premières sont fournis à titre purement informatif.
                Ils ne constituent ni un conseil professionnel, ni une évaluation certifiée.
                Sauve Mie ne saurait être tenu responsable des décisions d'approvisionnement
                prises sur leur base. Référez-vous toujours à vos propres recettes et fournisseurs.
              </p>
            </div>
          </div>

          {/* Info statut */}
          {status !== 'specific' && (
            <div className="flex items-start gap-2.5 rounded-xl px-4 py-3"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}>
              <Info size={12} className="text-white/30 flex-shrink-0 mt-0.5" />
              <p className="text-white/40 text-[11px] leading-relaxed">
                {status === 'template'
                  ? 'Valeurs pré-remplies depuis un modèle similaire dans notre base. Adaptez-les à votre production réelle.'
                  : 'Aucun modèle trouvé pour ce produit — valeurs initialisées à zéro. Saisissez vos ingrédients par unité.'}
              </p>
            </div>
          )}

          {/* Grille ingrédients */}
          <div>
            <p className="text-white/30 text-[10px] uppercase tracking-widest font-semibold mb-3 px-0.5">
              Quantités par unité produite
            </p>
            <div className="grid grid-cols-2 gap-2">
              {INGREDIENTS.map(({ key, label, unit, emoji, hint, step }) => {
                const value = form[key] as number;
                const active = value > 0;
                return (
                  <div
                    key={key}
                    className="rounded-xl p-3 transition-all"
                    style={{
                      background:   active ? 'rgba(193,154,107,0.06)' : 'rgba(255,255,255,0.03)',
                      border:       `1px solid ${active ? 'rgba(193,154,107,0.22)' : 'rgba(255,255,255,0.07)'}`,
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <span className="text-sm">{emoji}</span>
                      <span className="text-white/55 text-[11px] font-medium">{label}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        step={step ?? '1'}
                        value={value === 0 ? '' : value}
                        placeholder="0"
                        onChange={e => setField(key, parseFloat(e.target.value) || 0)}
                        className="flex-1 w-0 rounded-lg px-2 py-1.5 text-white text-sm font-mono outline-none text-right transition-colors"
                        style={{
                          background:   'rgba(0,0,0,0.35)',
                          border:       `1px solid ${active ? 'rgba(193,154,107,0.35)' : 'rgba(255,255,255,0.10)'}`,
                        }}
                        onFocus={e => { e.currentTarget.style.borderColor = 'rgba(193,154,107,0.55)'; }}
                        onBlur={e => { e.currentTarget.style.borderColor = active ? 'rgba(193,154,107,0.35)' : 'rgba(255,255,255,0.10)'; }}
                      />
                      <span className="text-white/25 text-[10px] flex-shrink-0 w-5 text-right font-mono">
                        {unit}
                      </span>
                    </div>
                    {hint && (
                      <p className="text-white/20 text-[9px] mt-1.5 leading-tight">{hint}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Erreur */}
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="flex items-center gap-2 rounded-xl px-4 py-3"
                style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.20)' }}
              >
                <AlertTriangle size={13} className="text-red-400 flex-shrink-0" />
                <p className="text-red-400 text-xs">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ── Footer ────────────────────────────────────────── */}
        <div className="flex gap-2.5 px-5 py-4 border-t border-white/6 flex-shrink-0">
          {/* Bouton réinitialiser — visible seulement si recette perso existante */}
          {status === 'specific' && (
            <button
              onClick={handleReset}
              disabled={resetting || saving}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border text-sm transition-all disabled:opacity-40"
              style={{
                borderColor: 'rgba(255,255,255,0.10)',
                color:       'rgba(255,255,255,0.35)',
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = 'rgba(239,68,68,0.30)';
                e.currentTarget.style.color = 'rgba(239,68,68,0.90)';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = 'rgba(255,255,255,0.10)';
                e.currentTarget.style.color = 'rgba(255,255,255,0.35)';
              }}
            >
              {resetting
                ? <Loader2 size={13} className="animate-spin" />
                : <RotateCcw size={13} />
              }
              Réinitialiser
            </button>
          )}

          {/* Bouton sauvegarder */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSave}
            disabled={saving || saved}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
            style={{
              background:  saved
                ? 'rgba(34,197,94,0.12)'
                : 'rgba(193,154,107,0.13)',
              border:      saved
                ? '1px solid rgba(34,197,94,0.25)'
                : '1px solid rgba(193,154,107,0.25)',
              color:       saved ? '#4ADE80' : '#C19A6B',
            }}
          >
            {saving
              ? <><Loader2 size={14} className="animate-spin" /> Sauvegarde…</>
              : saved
                ? <><CheckCircle size={14} /> Recette enregistrée</>
                : <><Save size={14} /> Enregistrer la recette</>
            }
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}
