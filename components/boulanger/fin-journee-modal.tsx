'use client';
// components/boulanger/fin-journee-modal.tsx
// ─────────────────────────────────────────────────────────────
// Retour vendeur de fin de journée.
// Philosophie : ULTRA RAPIDE — 30 secondes max.
//   1. Un emoji pour résumer la journée (3 choix)
//   2. Un champ texte optionnel (1 ligne max)
//   3. Toggle "événement spécial demain" — si oui, description courte
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, Loader2, Check, CalendarDays } from 'lucide-react';

export interface FinJourneeData {
  humeur:           'bien' | 'moyen' | 'difficile';
  commentaire:      string;
  hasEvenement:     boolean;
  evenementDesc:    string;
  evenementImpact:  'hausse' | 'baisse' | null;
}

interface Props {
  onSubmit:     (data: FinJourneeData) => void;
  onClose:      () => void;
  isSubmitting?: boolean;
}

const HUMEURS = [
  { id: 'bien'      as const, emoji: '😊', label: 'Bonne journée',    color: 'text-green-400',  bg: 'bg-green-400/12 border-green-400/30' },
  { id: 'moyen'     as const, emoji: '😐', label: 'Journée correcte', color: 'text-amber-400',  bg: 'bg-amber-400/12 border-amber-400/30' },
  { id: 'difficile' as const, emoji: '😞', label: 'Journée difficile', color: 'text-red-400',   bg: 'bg-red-400/10 border-red-400/25' },
] as const;

export default function FinJourneeModal({ onSubmit, onClose, isSubmitting = false }: Props) {
  const [humeur,        setHumeur]        = useState<FinJourneeData['humeur'] | null>(null);
  const [commentaire,   setCommentaire]   = useState('');
  const [hasEvenement,  setHasEvenement]  = useState(false);
  const [evenDesc,      setEvenDesc]      = useState('');
  const [evenImpact,    setEvenImpact]    = useState<'hausse' | 'baisse' | null>(null);

  const canSubmit = humeur !== null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)' }}
    >
      <motion.div
        initial={{ y: 40, scale: 0.97 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 40, scale: 0.97 }}
        transition={{ type: 'spring', damping: 30, stiffness: 320 }}
        className="w-full max-w-sm bg-[#1A0F0A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Poignée */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-white/12 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-start justify-between px-5 pt-2 pb-4">
          <div>
            <p className="text-white/35 text-[10px] uppercase tracking-widest font-semibold">Fin de journée</p>
            <h3 className="text-white font-bold text-lg mt-0.5" style={{ fontFamily: 'Playfair Display, serif' }}>
              Comment ça s'est passé ?
            </h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors mt-1">
            <X size={15} />
          </button>
        </div>

        <div className="px-5 pb-5 space-y-5">

          {/* ── Humeur (3 gros boutons) ── */}
          <div className="grid grid-cols-3 gap-2.5">
            {HUMEURS.map(h => (
              <motion.button
                key={h.id}
                whileTap={{ scale: 0.92 }}
                onClick={() => setHumeur(h.id)}
                className={`flex flex-col items-center gap-2 py-4 rounded-2xl border transition-all ${
                  humeur === h.id ? h.bg : 'bg-white/4 border-white/8 hover:bg-white/7'
                }`}
              >
                <span className="text-3xl">{h.emoji}</span>
                <span className={`text-[10px] font-semibold leading-tight text-center ${humeur === h.id ? h.color : 'text-white/40'}`}>
                  {h.label}
                </span>
              </motion.button>
            ))}
          </div>

          {/* ── Commentaire libre (1 ligne optionnelle) ── */}
          <div>
            <input
              type="text"
              maxLength={120}
              value={commentaire}
              onChange={e => setCommentaire(e.target.value)}
              placeholder="Un détail à transmettre au boulanger ? (optionnel)"
              className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
            />
          </div>

          {/* ── Événement demain ── */}
          <div className="rounded-2xl border overflow-hidden"
            style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.07)' }}>

            <button
              onClick={() => { setHasEvenement(v => !v); if (hasEvenement) { setEvenDesc(''); setEvenImpact(null); } }}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/3 transition-colors"
            >
              <div className={`w-8 h-8 rounded-xl flex items-center justify-center transition-all ${hasEvenement ? 'bg-[#C19A6B]/20' : 'bg-white/6'}`}>
                <CalendarDays size={14} className={hasEvenement ? 'text-[#C19A6B]' : 'text-white/30'} />
              </div>
              <div className="flex-1">
                <p className={`text-sm font-medium ${hasEvenement ? 'text-[#C19A6B]' : 'text-white/60'}`}>
                  Événement spécial demain ?
                </p>
                <p className="text-white/25 text-[10px]">Marché, fête, match, braderie...</p>
              </div>
              <div className={`w-10 h-5.5 rounded-full flex items-center transition-all px-0.5 ${hasEvenement ? 'bg-[#C19A6B] justify-end' : 'bg-white/10 justify-start'}`}>
                <div className="w-4.5 h-4 bg-white rounded-full shadow-sm" />
              </div>
            </button>

            <AnimatePresence>
              {hasEvenement && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden border-t border-white/6"
                >
                  <div className="px-4 py-3 space-y-3">
                    <input
                      type="text"
                      maxLength={100}
                      value={evenDesc}
                      onChange={e => setEvenDesc(e.target.value)}
                      placeholder="Ex: Marché de Noël devant la boulangerie"
                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
                    />
                    {/* Impact estimé */}
                    <div className="flex gap-2">
                      {([
                        { id: 'hausse' as const, label: 'Plus de monde', emoji: '📈' },
                        { id: 'baisse' as const, label: 'Moins de monde', emoji: '📉' },
                      ]).map(opt => (
                        <button
                          key={opt.id}
                          onClick={() => setEvenImpact(p => p === opt.id ? null : opt.id)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-medium border transition-all ${
                            evenImpact === opt.id
                              ? opt.id === 'hausse' ? 'bg-green-400/12 border-green-400/28 text-green-300' : 'bg-red-400/10 border-red-400/25 text-red-300'
                              : 'bg-white/4 border-white/8 text-white/40 hover:bg-white/7'
                          }`}
                        >
                          <span>{opt.emoji}</span> {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* ── Bouton clôturer ── */}
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (!canSubmit || isSubmitting) return;
              onSubmit({
                humeur:          humeur!,
                commentaire:     commentaire.trim(),
                hasEvenement,
                evenementDesc:   evenDesc.trim(),
                evenementImpact: hasEvenement ? evenImpact : null,
              });
            }}
            disabled={!canSubmit || isSubmitting}
            className="w-full py-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2.5 transition-all disabled:opacity-40"
            style={{
              background: canSubmit && !isSubmitting
                ? 'linear-gradient(135deg, rgba(193,154,107,0.35), rgba(193,154,107,0.18))'
                : 'rgba(255,255,255,0.05)',
              border: canSubmit && !isSubmitting ? '1px solid rgba(193,154,107,0.4)' : '1px solid rgba(255,255,255,0.06)',
              color: canSubmit && !isSubmitting ? '#C19A6B' : 'rgba(255,255,255,0.25)',
            }}
          >
            {isSubmitting
              ? <><Loader2 size={16} className="animate-spin" /> Clôture en cours…</>
              : <><Check size={16} /> Clôturer & générer le rapport</>
            }
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}