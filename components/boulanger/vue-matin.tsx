'use client';
// components/boulanger/vue-matin.tsx
// Vue du matin — saisie productions avec suggestions ML et CA estimé temps réel.
// Connectée au BoulangerContext : todayStocks, productionSuggestions, updateProduction.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Sparkles, TrendingUp, ChevronRight, Loader2 } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import type { StockEntry, ProductionSuggestion } from '@/context/boulanger-context';

// ─── Couleurs confidence ──────────────────────────────────────

type Confidence = 'high' | 'medium' | 'low';

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  high:   'text-green-400',
  medium: 'text-amber-400',
  low:    'text-white/30',
};

const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high:   'Fiable',
  medium: 'Probable',
  low:    'Incertain',
};

// ─── Composant ligne produit ──────────────────────────────────

interface ProduitRowProps {
  stock:      StockEntry;
  suggestion: ProductionSuggestion | undefined;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onApplySuggestion: (id: string) => void;
  isFirst: boolean;
}

function ProduitRow({ stock, suggestion, onIncrement, onDecrement, onApplySuggestion, isFirst }: ProduitRowProps) {
  const hasSuggestion =
    suggestion !== undefined &&
    suggestion.suggestedQty !== stock.production &&
    suggestion.dataPoints > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0"
      {...(isFirst ? { 'data-tour': 'matin-produit-row' } : {})}
    >
      {/* Emoji + nom */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{stock.emoji}</span>
          <div>
            <p className="text-white text-sm font-medium leading-none">{stock.name}</p>
            <p className="text-white/30 text-[10px] mt-0.5">{stock.prixVente.toFixed(2)} €</p>
          </div>
        </div>
        {/* Badge suggestion */}
        {hasSuggestion && suggestion && (
          <button
            onClick={() => onApplySuggestion(stock.id)}
            className="mt-1.5 flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#C19A6B]/10 border border-[#C19A6B]/15 hover:bg-[#C19A6B]/20 transition-all"
          >
            <Sparkles size={10} className="text-[#C19A6B]/70" />
            <span className="text-[10px] text-[#C19A6B]/80">
              Suggéré : {suggestion.suggestedQty}
            </span>
            <span className={`text-[9px] ${CONFIDENCE_COLORS[suggestion.confidence]}`}>
              · {CONFIDENCE_LABELS[suggestion.confidence]}
            </span>
          </button>
        )}
      </div>

      {/* Contrôles +/− */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onDecrement(stock.id)}
          disabled={stock.production === 0}
          className="w-8 h-8 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
        >
          <Minus size={13} />
        </button>
        <motion.span
          key={stock.production}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          className="w-8 text-center text-white font-bold text-sm tabular-nums"
        >
          {stock.production}
        </motion.span>
        <button
          onClick={() => onIncrement(stock.id)}
          className="w-8 h-8 rounded-xl bg-[#C19A6B]/15 border border-[#C19A6B]/20 flex items-center justify-center text-[#C19A6B] hover:bg-[#C19A6B]/25 transition-all"
        >
          <Plus size={13} />
        </button>
      </div>
    </motion.div>
  );
}

// ─── Vue Matin principale ─────────────────────────────────────

export default function VueMatin() {
  const {
    todayStocks,
    productionSuggestions,
    updateProduction,
    syncStatus,
    authLoading,
  } = useBoulanger();

  const handleIncrement = (id: string) => {
    const stock = todayStocks.find(s => s.id === id);
    if (stock) updateProduction(id, stock.production + 1);
  };

  const handleDecrement = (id: string) => {
    const stock = todayStocks.find(s => s.id === id);
    if (stock && stock.production > 0) updateProduction(id, stock.production - 1);
  };

  const handleApplySuggestion = (id: string) => {
    const suggestion = productionSuggestions.find(s => s.id === id);
    if (suggestion) updateProduction(id, suggestion.suggestedQty);
  };

  const handleApplyAll = () => {
    productionSuggestions.forEach(s => {
      if (s.dataPoints > 0) updateProduction(s.id, s.suggestedQty);
    });
  };

  // CA estimé temps réel
  const caEstime = todayStocks.reduce((acc, s) => acc + s.production * s.prixVente, 0);
  const totalPieces = todayStocks.reduce((acc, s) => acc + s.production, 0);

  const hasSuggestions = productionSuggestions.some(
    s => s.dataPoints > 0 && s.suggestedQty !== todayStocks.find(t => t.id === s.id)?.production
  );

  const jourSemaine = new Date().toLocaleDateString('fr-FR', { weekday: 'long' });
  const dateFr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin" />
      </div>
    );
  }

  // État vide : aucun stock chargé (pas encore de produits créés)
  if (todayStocks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-5xl mb-4">🥖</span>
        <p className="text-white/50 font-medium">Aucun produit configuré</p>
        <p className="text-white/25 text-sm mt-1">
          Ajoutez vos produits dans l'onglet <span className="text-[#C19A6B]">Produits</span> pour commencer
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
            <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium">
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
              {caEstime.toFixed(2)} €
            </p>
            <p className="text-white/30 text-[10px]">CA estimé</p>
          </div>
        </div>

        {/* Pill KPIs */}
        <div className="flex items-center gap-2 mt-3">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/8">
            <TrendingUp size={11} className="text-[#C19A6B]/70" />
            <span className="text-[11px] text-white/50 tabular-nums">{totalPieces} pièces</span>
          </div>
          {syncStatus === 'saving' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5">
              <Loader2 size={10} className="text-[#C19A6B]/50 animate-spin" />
              <span className="text-[10px] text-white/30">Sync...</span>
            </div>
          )}
          {syncStatus === 'saved' && (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10">
              <span className="text-[10px] text-green-400">Sauvegardé</span>
            </div>
          )}
        </div>
      </div>

      {/* ── Bouton "Tout appliquer" les suggestions ── */}
      <AnimatePresence>
        {hasSuggestions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <button
              onClick={handleApplyAll}
              className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all"
              style={{
                background: 'linear-gradient(135deg, rgba(193,154,107,0.12) 0%, rgba(232,201,154,0.06) 100%)',
                borderColor: 'rgba(193,154,107,0.2)',
              }}
            >
              <div className="flex items-center gap-2">
                <Sparkles size={15} className="text-[#C19A6B]/80" />
                <span className="text-[13px] font-semibold text-[#C19A6B]/90">
                  Appliquer toutes les suggestions ML
                </span>
              </div>
              <ChevronRight size={15} className="text-[#C19A6B]/50" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Note si pas encore d'historique ── */}
      {productionSuggestions.length > 0 && productionSuggestions.every(s => s.dataPoints === 0) && (
        <div className="bg-white/4 border border-white/8 rounded-xl px-4 py-3 flex items-start gap-2">
          <Sparkles size={13} className="text-[#C19A6B]/50 flex-shrink-0 mt-0.5" />
          <p className="text-white/30 text-xs leading-relaxed">
            Les suggestions ML apparaîtront après quelques clôtures de journée.
          </p>
        </div>
      )}

      {/* ── Liste produits ── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <div className="px-4">
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
      </div>

      {/* ── Note bas ── */}
      <p className="text-center text-white/20 text-[10px] pb-2">
        Les suggestions sont calculées depuis votre historique réel par jour de semaine.
      </p>
    </div>
  );
}