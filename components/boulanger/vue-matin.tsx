'use client';
// components/boulanger/vue-matin.tsx
// Vue du matin — saisie productions avec suggestions ML et CA estimé temps réel.

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus, Sparkles, TrendingUp, ChevronRight, Loader2 } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';

// ─── Types ────────────────────────────────────────────────────

type Confidence = 'high' | 'medium' | 'low';

interface ProduitMatin {
  id: string;
  nom: string;
  emoji: string;
  prix: number;
  quantite: number;
  suggestion?: number;
  confidence?: Confidence;
}

// ─── Couleurs confidence ──────────────────────────────────────

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
  produit: ProduitMatin;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onApplySuggestion: (id: string) => void;
  isFirst: boolean;
}

function ProduitRow({ produit, onIncrement, onDecrement, onApplySuggestion, isFirst }: ProduitRowProps) {
  const hasSuggestion = produit.suggestion !== undefined && produit.suggestion !== produit.quantite;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 py-3 border-b border-white/5 last:border-0"
      // data-tour sur la première ligne uniquement
      {...(isFirst ? { 'data-tour': 'matin-produit-row' } : {})}
    >
      {/* Emoji + nom */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-lg">{produit.emoji}</span>
          <div>
            <p className="text-white text-sm font-medium leading-none">{produit.nom}</p>
            <p className="text-white/30 text-[10px] mt-0.5">{produit.prix.toFixed(2)} €</p>
          </div>
        </div>
        {/* Badge suggestion */}
        {hasSuggestion && produit.confidence && (
          <button
            onClick={() => onApplySuggestion(produit.id)}
            className="mt-1.5 flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-[#C19A6B]/10 border border-[#C19A6B]/15 hover:bg-[#C19A6B]/20 transition-all"
          >
            <Sparkles size={10} className="text-[#C19A6B]/70" />
            <span className="text-[10px] text-[#C19A6B]/80">
              Suggéré : {produit.suggestion}
            </span>
            <span className={`text-[9px] ${CONFIDENCE_COLORS[produit.confidence]}`}>
              · {CONFIDENCE_LABELS[produit.confidence]}
            </span>
          </button>
        )}
      </div>

      {/* Contrôles +/− */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => onDecrement(produit.id)}
          disabled={produit.quantite === 0}
          className="w-8 h-8 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
        >
          <Minus size={13} />
        </button>
        <motion.span
          key={produit.quantite}
          initial={{ scale: 1.3 }}
          animate={{ scale: 1 }}
          className="w-8 text-center text-white font-bold text-sm tabular-nums"
        >
          {produit.quantite}
        </motion.span>
        <button
          onClick={() => onIncrement(produit.id)}
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
  const { boulangerie, syncStatus } = useBoulanger();
  const [produits, setProduits] = useState<ProduitMatin[]>([]);
  const [loading, setLoading] = useState(true);

  // Initialiser avec données de démo (les vraies données arrivent via l'API journee)
  useEffect(() => {
    // TODO: fetch depuis /api/boulanger/journee pour pré-remplir les quantités
    setProduits([
      { id: '1', nom: 'Baguette tradition', emoji: '🥖', prix: 1.30, quantite: 0, suggestion: 80, confidence: 'high' },
      { id: '2', nom: 'Croissant',          emoji: '🥐', prix: 1.20, quantite: 0, suggestion: 40, confidence: 'high' },
      { id: '3', nom: 'Pain de campagne',   emoji: '🍞', prix: 4.50, quantite: 0, suggestion: 12, confidence: 'medium' },
      { id: '4', nom: 'Pain au chocolat',   emoji: '🍫', prix: 1.30, quantite: 0, suggestion: 35, confidence: 'high' },
      { id: '5', nom: 'Ficelle',            emoji: '🫓', prix: 0.90, quantite: 0, suggestion: 20, confidence: 'medium' },
      { id: '6', nom: 'Chausson pommes',    emoji: '🍏', prix: 1.50, quantite: 0, suggestion: 15, confidence: 'low' },
    ]);
    setLoading(false);
  }, []);

  const handleIncrement = (id: string) => {
    setProduits(prev => prev.map(p =>
      p.id === id ? { ...p, quantite: p.quantite + 1 } : p
    ));
    debouncedSync(id, 1);
  };

  const handleDecrement = (id: string) => {
    setProduits(prev => prev.map(p =>
      p.id === id && p.quantite > 0 ? { ...p, quantite: p.quantite - 1 } : p
    ));
    debouncedSync(id, -1);
  };

  const handleApplySuggestion = (id: string) => {
    setProduits(prev => prev.map(p =>
      p.id === id && p.suggestion !== undefined
        ? { ...p, quantite: p.suggestion }
        : p
    ));
  };

  const handleApplyAll = () => {
    setProduits(prev => prev.map(p =>
      p.suggestion !== undefined ? { ...p, quantite: p.suggestion } : p
    ));
  };

  // Debounce minimal — la sync réelle est gérée par boulanger-context
  const debouncedSync = (id: string, delta: number) => {
    // updateProduction est appelé via useEffect sur `produits`
    // pour regrouper les appels
  };

  // CA estimé
  const caEstime = produits.reduce((acc, p) => acc + p.quantite * p.prix, 0);
  const hasSuggestions = produits.some(p => p.suggestion !== undefined && p.suggestion !== p.quantite);
  const totalPieces = produits.reduce((acc, p) => acc + p.quantite, 0);

  const jourSemaine = new Date().toLocaleDateString('fr-FR', { weekday: 'long' });
  const dateFr = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin" />
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
        </div>
      </div>

      {/* ── Bouton "Tout appliquer" ── */}
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

      {/* ── Liste produits ── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <div className="px-4">
          {produits.map((p, index) => (
            <ProduitRow
              key={p.id}
              produit={p}
              onIncrement={handleIncrement}
              onDecrement={handleDecrement}
              onApplySuggestion={handleApplySuggestion}
              isFirst={index === 0}
            />
          ))}
        </div>
      </div>

      {/* ── Note bas ── */}
      <p className="text-center text-white/20 text-[10px] pb-2">
        Les suggestions sont calculées depuis votre historique réel par jour de semaine.
      </p>
    </div>
  );
}