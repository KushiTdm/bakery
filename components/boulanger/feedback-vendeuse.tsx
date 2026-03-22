'use client';
// components/boulanger/feedback-vendeuse.tsx
// ─────────────────────────────────────────────────────────────
// Formulaire de retour fin de journée pour la vendeuse.
// Philosophie : rapide (< 2 min), structuré mais libre.
//
// Sections :
//   1. Humeur générale (emoji rapide)
//   2. Points forts / remarques clients positives
//   3. Problèmes ou observations
//   4. Commentaire libre (1 zone texte)
// Ce retour est transmis à Levain pour enrichir le rapport.
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Loader2, Check, Send } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

export interface FeedbackVendeuseData {
  humeur:            'super' | 'bien' | 'moyen' | 'difficile';
  points_positifs:   string[];
  problemes:         string[];
  commentaire_libre: string;
}

interface Props {
  onSubmit:      (data: FeedbackVendeuseData) => void;
  onClose:       () => void;
  isSubmitting?: boolean;
  prenomVendeur?: string;
}

// ── Config ────────────────────────────────────────────────────

const HUMEURS = [
  { id: 'super',    emoji: '🤩', label: 'Super journée !', color: 'text-yellow-300',  bg: 'bg-yellow-400/12 border-yellow-400/30' },
  { id: 'bien',     emoji: '😊', label: 'Bonne journée',    color: 'text-green-400',  bg: 'bg-green-400/12 border-green-400/30' },
  { id: 'moyen',    emoji: '😐', label: 'Journée moyenne',  color: 'text-amber-400',  bg: 'bg-amber-400/12 border-amber-400/30' },
  { id: 'difficile', emoji: '😓', label: 'Journée difficile', color: 'text-red-400', bg: 'bg-red-400/10 border-red-400/25' },
] as const;

const POINTS_POSITIFS_SUGGESTIONS = [
  'Clients satisfaits des produits',
  'Bons retours sur la baguette',
  'File d\'attente bien gérée',
  'Produits du jour très appréciés',
  'Bons retours sur les sandwichs',
  'Ambiance agréable en boutique',
];

const PROBLEMES_SUGGESTIONS = [
  'Rupture de stock trop tôt',
  'Certains produits trop cuits',
  'Problème de monnaie',
  'Client insatisfait',
  'Trop peu de sandwichs',
  'Produits manquants dans la vitrine',
  'Beaucoup de déchets ce soir',
];

// ── Composant chips sélectionnables ──────────────────────────

function ChipSelector({
  options,
  selected,
  onToggle,
  color,
}: {
  options:  string[];
  selected: string[];
  onToggle: (v: string) => void;
  color:    string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => {
        const isSelected = selected.includes(opt);
        return (
          <motion.button
            key={opt}
            whileTap={{ scale: 0.94 }}
            onClick={() => onToggle(opt)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition-all"
            style={{
              background: isSelected ? `${color}18` : 'rgba(255,255,255,0.04)',
              borderColor: isSelected ? `${color}40` : 'rgba(255,255,255,0.08)',
              color: isSelected ? color : 'rgba(255,255,255,0.45)',
            }}
          >
            {isSelected && <Check size={10} />}
            {opt}
          </motion.button>
        );
      })}
    </div>
  );
}

// ── Composant principal ───────────────────────────────────────

export default function FeedbackVendeuse({ onSubmit, onClose, isSubmitting = false, prenomVendeur }: Props) {
  const [humeur,          setHumeur]         = useState<FeedbackVendeuseData['humeur'] | null>(null);
  const [pointsPositifs,  setPointsPositifs] = useState<string[]>([]);
  const [problemes,       setProblemes]      = useState<string[]>([]);
  const [commentaire,     setCommentaire]    = useState('');
  const [autrePositif,    setAutrePositif]   = useState('');
  const [autreProbleme,   setAutreProbleme]  = useState('');

  const toggleChip = (arr: string[], setArr: (v: string[]) => void, val: string) => {
    setArr(arr.includes(val) ? arr.filter(x => x !== val) : [...arr, val]);
  };

  const addAutre = (arr: string[], setArr: (v: string[]) => void, val: string, setVal: (v: string) => void) => {
    const trimmed = val.trim();
    if (!trimmed || arr.includes(trimmed)) return;
    setArr([...arr, trimmed]);
    setVal('');
  };

  const handleSubmit = () => {
    if (!humeur) return;
    onSubmit({
      humeur,
      points_positifs:   pointsPositifs,
      problemes,
      commentaire_libre: commentaire.trim(),
    });
  };

  const canSubmit = humeur !== null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.88)', backdropFilter: 'blur(8px)' }}
    >
      <motion.div
        initial={{ y: 40, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 40, scale: 0.97 }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-sm bg-[#1A0F0A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Poignée */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 bg-white/12 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-2 pb-4 flex-shrink-0">
          <div>
            <p className="text-white/35 text-[10px] uppercase tracking-widest font-semibold">
              {prenomVendeur ? `Retour de ${prenomVendeur}` : 'Retour vendeuse'}
            </p>
            <h3 className="text-white font-bold text-lg mt-0.5" style={{ fontFamily: 'Playfair Display, serif' }}>
              Comment s'est passée la journée ?
            </h3>
            <p className="text-white/30 text-xs mt-1 leading-relaxed">
              Votre retour enrichit le rapport Levain du boulanger. 2 minutes max.
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors mt-1">
            <X size={15} />
          </button>
        </div>

        {/* Corps scrollable */}
        <div className="flex-1 overflow-y-auto px-5 pb-4 space-y-5">

          {/* ── Humeur ── */}
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2.5 font-semibold">
              En un mot, comment était la journée ?
            </p>
            <div className="grid grid-cols-2 gap-2">
              {HUMEURS.map(h => (
                <motion.button
                  key={h.id}
                  whileTap={{ scale: 0.93 }}
                  onClick={() => setHumeur(h.id)}
                  className={`flex flex-col items-center gap-1.5 py-3.5 rounded-2xl border transition-all ${
                    humeur === h.id ? h.bg : 'bg-white/4 border-white/8 hover:bg-white/6'
                  }`}
                >
                  <span className="text-2xl">{h.emoji}</span>
                  <span className={`text-xs font-semibold ${humeur === h.id ? h.color : 'text-white/45'}`}>
                    {h.label}
                  </span>
                </motion.button>
              ))}
            </div>
          </div>

          {/* ── Points positifs ── */}
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2 font-semibold">
              ✨ Ce qui a bien marché
            </p>
            <ChipSelector
              options={POINTS_POSITIFS_SUGGESTIONS}
              selected={pointsPositifs}
              onToggle={v => toggleChip(pointsPositifs, setPointsPositifs, v)}
              color="#4ADE80"
            />
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={autrePositif}
                onChange={e => setAutrePositif(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAutre(pointsPositifs, setPointsPositifs, autrePositif, setAutrePositif)}
                placeholder="Autre chose…"
                maxLength={80}
                className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-xs placeholder:text-white/20 outline-none focus:border-green-400/40 transition-colors"
              />
              <button
                onClick={() => addAutre(pointsPositifs, setPointsPositifs, autrePositif, setAutrePositif)}
                className="px-3 py-2 bg-green-400/12 border border-green-400/25 text-green-400 rounded-xl text-xs font-medium hover:bg-green-400/20 transition-colors"
              >
                + Ajouter
              </button>
            </div>
          </div>

          {/* ── Problèmes ── */}
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2 font-semibold">
              ⚠️ Points d'amélioration ou problèmes
            </p>
            <ChipSelector
              options={PROBLEMES_SUGGESTIONS}
              selected={problemes}
              onToggle={v => toggleChip(problemes, setProblemes, v)}
              color="#FBBF24"
            />
            <div className="flex gap-2 mt-2">
              <input
                type="text"
                value={autreProbleme}
                onChange={e => setAutreProbleme(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && addAutre(problemes, setProblemes, autreProbleme, setAutreProbleme)}
                placeholder="Autre chose…"
                maxLength={80}
                className="flex-1 bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-xs placeholder:text-white/20 outline-none focus:border-amber-400/40 transition-colors"
              />
              <button
                onClick={() => addAutre(problemes, setProblemes, autreProbleme, setAutreProbleme)}
                className="px-3 py-2 bg-amber-400/12 border border-amber-400/25 text-amber-400 rounded-xl text-xs font-medium hover:bg-amber-400/20 transition-colors"
              >
                + Ajouter
              </button>
            </div>
          </div>

          {/* ── Commentaire libre ── */}
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wider mb-2 font-semibold">
              💬 Message pour le boulanger <span className="text-white/20 normal-case">(optionnel)</span>
            </p>
            <textarea
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
              placeholder="Un détail à transmettre ? Une observation client ? Un produit manquant ?"
              rows={3}
              maxLength={400}
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors resize-none"
            />
            <p className="text-white/20 text-[10px] mt-1 text-right">{commentaire.length}/400</p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 border-t border-white/6 flex-shrink-0">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSubmit}
            disabled={!canSubmit || isSubmitting}
            className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all disabled:opacity-40"
            style={{
              background: canSubmit && !isSubmitting
                ? 'linear-gradient(135deg, rgba(193,154,107,0.3), rgba(193,154,107,0.15))'
                : 'rgba(255,255,255,0.05)',
              border: canSubmit && !isSubmitting ? '1px solid rgba(193,154,107,0.4)' : '1px solid rgba(255,255,255,0.06)',
              color: canSubmit && !isSubmitting ? '#C19A6B' : 'rgba(255,255,255,0.25)',
            }}
          >
            {isSubmitting
              ? <><Loader2 size={16} className="animate-spin" /> Envoi au boulanger…</>
              : <><Send size={15} /> Transmettre le retour</>
            }
          </motion.button>
          <p className="text-center text-white/20 text-[10px] mt-2">
            Ce retour sera inclus dans le rapport Levain de ce soir
          </p>
        </div>
      </motion.div>
    </motion.div>
  );
}