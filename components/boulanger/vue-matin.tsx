'use client';
// components/boulanger/vue-matin.tsx
// UX boutique : gros boutons tactiles + bouton Valider production

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Sparkles, TrendingUp, ChevronRight, Loader2, CheckCircle2 } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import type { StockEntry, ProductionSuggestion } from '@/context/boulanger-context';

type Confidence = 'high' | 'medium' | 'low';

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  high:   'text-green-400',
  medium: 'text-amber-400',
  low:    'text-white/30',
};
const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high:   'Fiable',
  medium: 'Probable',
  low:    'Estimé',
};

// ─── Ligne produit ────────────────────────────────────────────
// Gros boutons tactiles — utilisable d'une main au comptoir

function ProduitRow({
  stock,
  suggestion,
  onIncrement,
  onDecrement,
  onApplySuggestion,
  isFirst,
}: {
  stock:              StockEntry;
  suggestion?:        ProductionSuggestion;
  onIncrement:        (id: string) => void;
  onDecrement:        (id: string) => void;
  onApplySuggestion:  (id: string) => void;
  isFirst:            boolean;
}) {
  const hasSuggestion =
    suggestion !== undefined &&
    suggestion.suggestedQty !== stock.production &&
    suggestion.dataPoints > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5 last:border-0"
      {...(isFirst ? { 'data-tour': 'matin-produit-row' } : {})}
    >
      {/* Emoji + nom */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">{stock.emoji}</span>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">{stock.name}</p>
            <p className="text-white/35 text-xs mt-0.5">{stock.prixVente.toFixed(2)} €/pièce</p>
          </div>
        </div>

        {/* Suggestion ML */}
        {hasSuggestion && suggestion && (
          <button
            onClick={() => onApplySuggestion(stock.id)}
            className="mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-[#C19A6B]/12 border border-[#C19A6B]/20 hover:bg-[#C19A6B]/22 active:scale-95 transition-all"
          >
            <Sparkles size={10} className="text-[#C19A6B]/70" />
            <span className="text-[10px] text-[#C19A6B]/80 font-medium">
              Suggéré : {suggestion.suggestedQty}
            </span>
            <span className={`text-[9px] ${CONFIDENCE_COLORS[suggestion.confidence]}`}>
              · {CONFIDENCE_LABELS[suggestion.confidence]}
            </span>
          </button>
        )}
      </div>

      {/* Contrôles — gros boutons tactiles */}
      <div className="flex items-center gap-0 flex-shrink-0">
        {/* Bouton − */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onPointerDown={() => onDecrement(stock.id)}
          disabled={stock.production === 0}
          className={`
            w-14 h-14 rounded-2xl flex items-center justify-center
            text-white text-xl font-bold select-none touch-manipulation
            transition-all active:scale-90
            ${stock.production === 0
              ? 'bg-white/5 border border-white/8 opacity-30 cursor-not-allowed'
              : 'bg-white/10 border border-white/12 hover:bg-white/16 active:bg-white/20'
            }
          `}
          aria-label={`Diminuer ${stock.name}`}
        >
          <Minus size={20} strokeWidth={2.5} />
        </motion.button>

        {/* Valeur */}
        <motion.div
          key={stock.production}
          initial={{ scale: 1.25, color: '#C19A6B' }}
          animate={{ scale: 1, color: '#FFFFFF' }}
          transition={{ duration: 0.2 }}
          className="w-16 text-center font-bold text-2xl tabular-nums mx-1 select-none"
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {stock.production}
        </motion.div>

        {/* Bouton + */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onPointerDown={() => onIncrement(stock.id)}
          className="
            w-14 h-14 rounded-2xl flex items-center justify-center
            bg-[#C19A6B]/20 border border-[#C19A6B]/30
            hover:bg-[#C19A6B]/30 active:bg-[#C19A6B]/40
            text-[#C19A6B] select-none touch-manipulation
            transition-all active:scale-90
          "
          aria-label={`Augmenter ${stock.name}`}
        >
          <Plus size={20} strokeWidth={2.5} />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Vue Matin ────────────────────────────────────────────────

export default function VueMatin() {
  const {
    todayStocks,
    productionSuggestions,
    updateProduction,
    syncStatus,
    authLoading,
  } = useBoulanger();

  const [validated, setValidated] = useState(false);

  const handleIncrement = (id: string) => {
    const s = todayStocks.find(x => x.id === id);
    if (s) updateProduction(id, s.production + 1);
  };
  const handleDecrement = (id: string) => {
    const s = todayStocks.find(x => x.id === id);
    if (s && s.production > 0) updateProduction(id, s.production - 1);
  };
  const handleApplySuggestion = (id: string) => {
    const sug = productionSuggestions.find(s => s.id === id);
    if (sug) updateProduction(id, sug.suggestedQty);
  };
  const handleApplyAll = () => {
    productionSuggestions.forEach(s => {
      if (s.dataPoints > 0) updateProduction(s.id, s.suggestedQty);
    });
  };

  const handleValider = () => {
    setValidated(true);
    setTimeout(() => setValidated(false), 4000);
  };

  const caEstime     = todayStocks.reduce((acc, s) => acc + s.production * s.prixVente, 0);
  const totalPieces  = todayStocks.reduce((acc, s) => acc + s.production, 0);
  const hasSuggestions = productionSuggestions.some(
    s => s.dataPoints > 0 && s.suggestedQty !== todayStocks.find(t => t.id === s.id)?.production
  );

  const jourSemaine = new Date().toLocaleDateString('fr-FR', { weekday: 'long' });
  const dateFr      = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin" />
      </div>
    );
  }

  if (todayStocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-5xl mb-4">🥖</span>
        <p className="text-white/50 font-medium">Aucun produit configuré</p>
        <p className="text-white/25 text-sm mt-1">
          Ajoutez vos produits dans <span className="text-[#C19A6B]">Plus → Produits</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div data-tour="matin-header" className="pt-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium capitalize">
              {jourSemaine} {dateFr}
            </p>
            <h1
              className="text-white text-2xl font-bold mt-1 leading-tight"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Production du matin
            </h1>
          </div>
          <div className="text-right">
            <p className="text-[#C19A6B] text-lg font-bold tabular-nums">
              {caEstime.toFixed(0)} €
            </p>
            <p className="text-white/30 text-[10px]">CA estimé</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/8">
            <TrendingUp size={11} className="text-[#C19A6B]/70" />
            <span className="text-[11px] text-white/50 tabular-nums">{totalPieces} pièces</span>
          </div>
          {syncStatus === 'saving' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5">
              <Loader2 size={10} className="text-[#C19A6B]/50 animate-spin" />
              <span className="text-[10px] text-white/30">Sync…</span>
            </div>
          )}
          {syncStatus === 'saved' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10">
              <span className="text-[10px] text-green-400">Sauvegardé</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Suggestions ML (Tout appliquer) ── */}
      <AnimatePresence>
        {hasSuggestions && (
          <motion.button
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onClick={handleApplyAll}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all"
            style={{
              background: 'linear-gradient(135deg, rgba(193,154,107,0.12) 0%, rgba(232,201,154,0.06) 100%)',
              borderColor: 'rgba(193,154,107,0.2)',
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles size={14} className="text-[#C19A6B]/80" />
              <span className="text-[13px] font-semibold text-[#C19A6B]/90">
                Appliquer les suggestions ML
              </span>
            </div>
            <ChevronRight size={14} className="text-[#C19A6B]/50" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Pas encore d'historique ── */}
      {productionSuggestions.length > 0 && productionSuggestions.every(s => s.dataPoints === 0) && (
        <div className="bg-white/4 border border-white/8 rounded-xl px-4 py-3 flex items-start gap-2">
          <Sparkles size={13} className="text-[#C19A6B]/50 flex-shrink-0 mt-0.5" />
          <p className="text-white/30 text-xs leading-relaxed">
            Les suggestions apparaîtront après quelques clôtures journalières.
          </p>
        </div>
      )}

      {/* ── Liste produits ── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.035) 0%, rgba(255,255,255,0.01) 100%)',
          borderColor: 'rgba(255,255,255,0.07)',
        }}
      >
        {todayStocks.map((stock, index) => {
          const suggestion = productionSuggestions.find(s => s.id === stock.id);
          return (
            <ProduitRow
              key={stock.id}
              stock={stock}
              suggestion={suggestion}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
              onApplySuggestion={handleApplySuggestion}
              isFirst={index === 0}
            />
          );
        })}
      </div>

      {/* ── Bouton Valider production ── */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleValider}
        disabled={totalPieces === 0}
        className={`
          w-full py-4 rounded-2xl flex items-center justify-center gap-2.5
          font-bold text-base transition-all duration-300 select-none touch-manipulation
          disabled:opacity-30 disabled:cursor-not-allowed
        `}
        style={
          validated
            ? { background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: 'rgb(74,222,128)' }
            : { background: 'linear-gradient(135deg, rgba(193,154,107,0.25) 0%, rgba(193,154,107,0.12) 100%)', border: '1px solid rgba(193,154,107,0.35)', color: '#C19A6B' }
        }
      >
        {validated ? (
          <><CheckCircle2 size={20} /> Production validée ✓</>
        ) : (
          <><CheckCircle2 size={20} /> Valider la production ({totalPieces} pièces)</>
        )}
      </motion.button>

      <p className="text-center text-white/18 text-[10px] pb-2">
        La saisie est sauvegardée en continu · Le bouton confirme que la fournée est terminée
      </p>
    </div>
  );
}