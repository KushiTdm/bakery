'use client';
// components/boulanger/wizard-pre-rapport.tsx
// ─────────────────────────────────────────────────────────────
// Wizard en 3 étapes que seul l'owner (ou gérant) voit avant
// de déclencher la génération du rapport Levain.
//
// Étape 1 : Consignes pour le boulanger (production, recettes, …)
// Étape 2 : Consignes pour la vendeuse (service, produits à mettre en avant, …)
// Étape 3 : Événement demain (marché, fête, match, …) qui peut influencer la fréquentation
// ─────────────────────────────────────────────────────────────

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChefHat, ShoppingBag, Calendar, ChevronRight,
  ChevronLeft, Sparkles, X, Check, ArrowUp, ArrowDown, Minus,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────

export interface WizardPreRapportData {
  consignes_boulanger:  string;
  consignes_vendeuse:   string;
  evenement_demain:     string;
  evenement_impact:     'hausse' | 'baisse' | 'neutre' | null;
  evenement_pct:        number;
}

interface Props {
  onValider:  (data: WizardPreRapportData) => void;
  onAnnuler:  () => void;
}

// ── Étapes ────────────────────────────────────────────────────

const ETAPES = [
  {
    id:    'boulanger',
    icon:  ChefHat,
    label: 'Consignes boulanger',
    color: '#C19A6B',
    bg:    'rgba(193,154,107,0.12)',
  },
  {
    id:    'vendeuse',
    icon:  ShoppingBag,
    label: 'Consignes vendeuse',
    color: '#6FA8EA',
    bg:    'rgba(111,168,234,0.10)',
  },
  {
    id:    'evenement',
    icon:  Calendar,
    label: 'Événement demain',
    color: '#B882D6',
    bg:    'rgba(184,130,214,0.10)',
  },
] as const;

// ── Impacts ───────────────────────────────────────────────────

const IMPACTS = [
  { id: 'hausse',  label: 'Plus de monde',     emoji: '📈', color: 'text-green-400',  bg: 'bg-green-400/12 border-green-400/28' },
  { id: 'neutre',  label: 'Impact neutre',      emoji: '➡️', color: 'text-white/50',   bg: 'bg-white/6 border-white/12' },
  { id: 'baisse',  label: 'Moins de monde',     emoji: '📉', color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/25' },
] as const;

// ── Composant ─────────────────────────────────────────────────

export default function WizardPreRapport({ onValider, onAnnuler }: Props) {
  const [etape, setEtape] = useState(0);
  const [data, setData]   = useState<WizardPreRapportData>({
    consignes_boulanger: '',
    consignes_vendeuse:  '',
    evenement_demain:    '',
    evenement_impact:    null,
    evenement_pct:       0,
  });

  const current = ETAPES[etape];
  const Icon    = current.icon;
  const isLast  = etape === ETAPES.length - 1;
  const isFirst = etape === 0;

  const handleNext = () => {
    if (isLast) {
      onValider(data);
    } else {
      setEtape(v => v + 1);
    }
  };

  const handleSkip = () => {
    if (isLast) {
      onValider(data);
    } else {
      setEtape(v => v + 1);
    }
  };

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
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="w-full max-w-sm bg-[#1A0F0A] border border-white/10 rounded-3xl overflow-hidden shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Poignée */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-white/12 rounded-full" />
        </div>

        {/* Barre de progression */}
        <div className="flex gap-1.5 px-5 py-3">
          {ETAPES.map((e, i) => (
            <div
              key={e.id}
              className="flex-1 h-1 rounded-full transition-all duration-300"
              style={{
                background: i <= etape ? current.color : 'rgba(255,255,255,0.08)',
              }}
            />
          ))}
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl flex items-center justify-center" style={{ background: current.bg }}>
              <Icon size={18} style={{ color: current.color }} />
            </div>
            <div>
              <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold">
                Étape {etape + 1} / {ETAPES.length}
              </p>
              <p className="text-white font-bold text-sm leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
                {current.label}
              </p>
            </div>
          </div>
          <button
            onClick={onAnnuler}
            className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
          >
            <X size={14} />
          </button>
        </div>

        {/* Contenu par étape */}
        <AnimatePresence mode="wait">
          <motion.div
            key={etape}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.18 }}
            className="px-5 pb-5 space-y-4"
          >
            {/* ── Étape 1 : Consignes boulanger ── */}
            {etape === 0 && (
              <>
                <p className="text-white/50 text-xs leading-relaxed">
                  Ces consignes seront transmises au boulanger dans le rapport Levain de demain matin.
                  Laissez vide si aucune consigne particulière.
                </p>
                <div>
                  <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                    Message pour le boulanger
                  </label>
                  <textarea
                    value={data.consignes_boulanger}
                    onChange={e => setData(p => ({ ...p, consignes_boulanger: e.target.value }))}
                    placeholder="Ex: Préparer 20 baguettes supplémentaires le matin, tester la nouvelle recette de pain de seigle…"
                    rows={4}
                    maxLength={500}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors resize-none"
                  />
                  <p className="text-white/20 text-[10px] mt-1 text-right">{data.consignes_boulanger.length}/500</p>
                </div>
              </>
            )}

            {/* ── Étape 2 : Consignes vendeuse ── */}
            {etape === 1 && (
              <>
                <p className="text-white/50 text-xs leading-relaxed">
                  Ces consignes seront transmises à la vendeuse dans son briefing de la journée.
                </p>
                <div>
                  <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                    Message pour la vendeuse
                  </label>
                  <textarea
                    value={data.consignes_vendeuse}
                    onChange={e => setData(p => ({ ...p, consignes_vendeuse: e.target.value }))}
                    placeholder="Ex: Mettre en avant les tartes aux fraises, proposer le sandwich du jour en premier, fermeture à 19h demain…"
                    rows={4}
                    maxLength={500}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors resize-none"
                  />
                  <p className="text-white/20 text-[10px] mt-1 text-right">{data.consignes_vendeuse.length}/500</p>
                </div>
              </>
            )}

            {/* ── Étape 3 : Événement demain ── */}
            {etape === 2 && (
              <>
                <p className="text-white/50 text-xs leading-relaxed">
                  Y a-t-il un événement demain à proximité qui pourrait influencer la fréquentation ?
                </p>
                <div>
                  <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                    Description de l'événement <span className="text-white/20 normal-case">(optionnel)</span>
                  </label>
                  <input
                    type="text"
                    value={data.evenement_demain}
                    onChange={e => setData(p => ({ ...p, evenement_demain: e.target.value }))}
                    placeholder="Ex: Marché de Noël, match de foot, brocante, fête de quartier…"
                    maxLength={150}
                    className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-3 text-white text-sm placeholder:text-white/20 outline-none focus:border-[#C19A6B]/50 transition-colors"
                  />
                </div>

                {data.evenement_demain && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
                    <div>
                      <label className="text-white/40 text-xs uppercase tracking-wider block mb-2">Impact estimé sur la fréquentation</label>
                      <div className="grid grid-cols-3 gap-2">
                        {IMPACTS.map(imp => (
                          <button
                            key={imp.id}
                            onClick={() => setData(p => ({ ...p, evenement_impact: imp.id === 'neutre' ? 'neutre' : imp.id }))}
                            className={`flex flex-col items-center gap-1.5 py-2.5 rounded-xl border transition-all text-xs font-medium ${
                              data.evenement_impact === imp.id ? imp.bg : 'bg-white/4 border-white/8 text-white/40'
                            }`}
                          >
                            <span className="text-lg">{imp.emoji}</span>
                            <span className={data.evenement_impact === imp.id ? imp.color : ''}>{imp.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {data.evenement_impact && data.evenement_impact !== 'neutre' && (
                      <div>
                        <label className="text-white/40 text-xs uppercase tracking-wider block mb-1.5">
                          Variation estimée : <span style={{ color: data.evenement_impact === 'hausse' ? '#4ADE80' : '#F87171' }}>
                            {data.evenement_impact === 'hausse' ? '+' : '-'}{data.evenement_pct}%
                          </span>
                        </label>
                        <input
                          type="range" min={5} max={50} step={5}
                          value={data.evenement_pct}
                          onChange={e => setData(p => ({ ...p, evenement_pct: parseInt(e.target.value) }))}
                          className="w-full"
                          style={{ accentColor: data.evenement_impact === 'hausse' ? '#4ADE80' : '#F87171' }}
                        />
                        <div className="flex justify-between text-white/20 text-[10px] px-1">
                          <span>5%</span><span>Faible impact</span><span>50%</span>
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}
              </>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Footer */}
        <div className="px-5 pb-5 flex gap-2.5">
          {!isFirst && (
            <button
              onClick={() => setEtape(v => v - 1)}
              className="flex items-center gap-1.5 px-4 py-3 rounded-xl bg-white/6 border border-white/10 text-white/50 text-sm hover:bg-white/10 transition-colors"
            >
              <ChevronLeft size={15} />
              Retour
            </button>
          )}
          <button
            onClick={handleSkip}
            className="px-4 py-3 rounded-xl text-white/30 text-sm hover:text-white/50 transition-colors"
          >
            Passer
          </button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleNext}
            className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all"
            style={{
              background: isLast ? 'linear-gradient(135deg, rgba(139,92,246,0.3), rgba(193,154,107,0.2))' : `${current.bg}`,
              border: `1px solid ${current.color}40`,
              color: current.color,
            }}
          >
            {isLast
              ? <><Sparkles size={15} /> Générer le rapport Levain</>
              : <>{current.label === ETAPES[etape + 1]?.label ? 'Suivant' : 'Continuer'} <ChevronRight size={15} /></>
            }
          </motion.button>
        </div>
      </motion.div>
    </motion.div>
  );
}