'use client';
// components/boulanger/vue-matin.tsx
// ─────────────────────────────────────────────────────────────
// Multi-fournées + séparation par catégorie
// ✅ Feature report inter-journées : affichage des invendus J-1
//    pour les produits avec duree_conservation > 1 jour
// ─────────────────────────────────────────────────────────────

import { useState, useMemo, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Minus, Sparkles, TrendingUp, ChevronRight,
  Loader2, CheckCircle2, ChevronDown, ChevronUp, Package,
  Brain, Clock, AlertCircle,
} from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import { supabase } from '@/lib/supabase';
import type { StockEntry, ProductionSuggestion } from '@/lib/types';

// ── Types ─────────────────────────────────────────────────────

type Confidence = 'high' | 'medium' | 'low';

interface LevainForecast {
  produit_id:        string;
  quantite_suggeree: number;
  quantite_base:     number;
  variation_pct:     number;
  raison:            string;
}

const CONFIDENCE_COLORS: Record<Confidence, string> = {
  high:   'text-green-400',
  medium: 'text-amber-400',
  low:    'text-white/30',
};
const CONFIDENCE_LABELS: Record<Confidence, string> = {
  high:   'Levain IA',
  medium: 'Probable',
  low:    'Estimé',
};

// ── Config catégories ─────────────────────────────────────────

const CATEGORY_CONFIG: Record<string, {
  label: string; emoji: string; color: string; bg: string; border: string;
}> = {
  boulangerie: {
    label: 'Pains & Boulangerie', emoji: '🥖',
    color: '#C19A6B', bg: 'rgba(193,154,107,0.08)', border: 'rgba(193,154,107,0.18)',
  },
  viennoiserie: {
    label: 'Viennoiseries', emoji: '🥐',
    color: '#F5A623', bg: 'rgba(245,166,35,0.07)', border: 'rgba(245,166,35,0.18)',
  },
  patisserie: {
    label: 'Pâtisseries', emoji: '🎂',
    color: '#E879A0', bg: 'rgba(232,121,160,0.07)', border: 'rgba(232,121,160,0.18)',
  },
  sandwichs: {
    label: 'Sandwichs & Snacking', emoji: '🥪',
    color: '#5CC994', bg: 'rgba(92,201,148,0.07)', border: 'rgba(92,201,148,0.18)',
  },
};

const CATEGORY_ORDER = ['boulangerie', 'viennoiserie', 'patisserie', 'sandwichs'];

// ── Composant : badge report J-1 ──────────────────────────────

function ReportVeilleBadge({
  quantite,
  onAjuster,
}: {
  quantite:  number;
  onAjuster: (delta: number) => void;
}) {
  return (
    <div className="mt-1.5 flex items-center gap-2">
      <div className="flex items-center gap-1.5 bg-orange-500/10 border border-orange-500/20 rounded-xl px-2.5 py-1.5">
        <Clock size={10} className="text-orange-400 flex-shrink-0" />
        <span className="text-orange-300 text-[10px] font-medium">
          Report J-1 :
        </span>
        <div className="flex items-center gap-1">
          <button
            onPointerDown={() => onAjuster(-1)}
            disabled={quantite <= 0}
            className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center disabled:opacity-30 touch-manipulation"
          >
            <Minus size={9} className="text-white" />
          </button>
          <motion.span
            key={quantite}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            className="text-orange-300 text-[11px] font-bold font-mono w-5 text-center tabular-nums"
          >
            {quantite}
          </motion.span>
          <button
            onPointerDown={() => onAjuster(+1)}
            className="w-5 h-5 rounded-md bg-white/10 flex items-center justify-center touch-manipulation"
          >
            <Plus size={9} className="text-white" />
          </button>
        </div>
        <span className="text-orange-300/60 text-[9px]">unité{quantite > 1 ? 's' : ''} de la veille</span>
      </div>
    </div>
  );
}

// ── Composant : ligne produit ─────────────────────────────────

function ProduitRow({
  stock,
  suggestion,
  isAISuggestion,
  onIncrement,
  onDecrement,
  onApplySuggestion,
  onAjusterReport,
  isFirst,
  categoryColor,
}: {
  stock:              StockEntry;
  suggestion?:        ProductionSuggestion;
  isAISuggestion?:    boolean;
  onIncrement:        (id: string) => void;
  onDecrement:        (id: string) => void;
  onApplySuggestion:  (id: string) => void;
  onAjusterReport:    (id: string, delta: number) => void;
  isFirst:            boolean;
  categoryColor:      string;
}) {
  const hasSuggestion =
    suggestion !== undefined &&
    suggestion.suggestedQty !== stock.production &&
    suggestion.dataPoints > 0;

  const hasReport = (stock.reportVeille ?? 0) > 0;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-start gap-3 px-4 py-3.5 border-b border-white/5 last:border-0"
      {...(isFirst ? { 'data-tour': 'matin-produit-row' } : {})}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="text-2xl leading-none">{stock.emoji}</span>
          <div>
            <p className="text-white text-sm font-semibold leading-tight">{stock.name}</p>
            <p className="text-white/35 text-xs mt-0.5">{stock.prixVente.toFixed(2)} €/pièce</p>
          </div>
        </div>

        {/* Badge report J-1 — visible uniquement si des unités sont reportées */}
        {hasReport && (
          <ReportVeilleBadge
            quantite={stock.reportVeille ?? 0}
            onAjuster={delta => onAjusterReport(stock.id, delta)}
          />
        )}

        {/* Suggestion de production (Levain IA ou historique) */}
        {hasSuggestion && suggestion && (
          <button
            onClick={() => onApplySuggestion(stock.id)}
            className={`mt-2 flex items-center gap-1.5 px-2.5 py-1 rounded-xl border transition-all active:scale-95 ${
              isAISuggestion
                ? 'bg-purple-500/12 border-purple-500/25 hover:bg-purple-500/22'
                : 'bg-[#C19A6B]/12 border-[#C19A6B]/20 hover:bg-[#C19A6B]/22'
            }`}
          >
            {isAISuggestion
              ? <Brain size={10} className="text-purple-400/80" />
              : <Sparkles size={10} className="text-[#C19A6B]/70" />
            }
            <span className={`text-[10px] font-medium ${isAISuggestion ? 'text-purple-300/80' : 'text-[#C19A6B]/80'}`}>
              Suggéré : {suggestion.suggestedQty}
            </span>
            {!isAISuggestion && (
              <span className={`text-[9px] ${CONFIDENCE_COLORS[suggestion.confidence]}`}>
                · {CONFIDENCE_LABELS[suggestion.confidence]}
              </span>
            )}
            {suggestion.changePercent !== 0 && (
              <span className={`text-[9px] font-mono ${suggestion.changePercent > 0 ? 'text-green-400/70' : 'text-red-400/70'}`}>
                {suggestion.changePercent > 0 ? '+' : ''}{suggestion.changePercent}%
              </span>
            )}
          </button>
        )}
      </div>

      {/* Contrôles production fraîche */}
      <div className="flex items-center gap-0 flex-shrink-0 mt-1">
        <motion.button
          whileTap={{ scale: 0.88 }}
          onPointerDown={() => onDecrement(stock.id)}
          disabled={stock.production === 0}
          className={`w-12 h-12 rounded-2xl flex items-center justify-center select-none touch-manipulation transition-all ${
            stock.production === 0
              ? 'bg-white/5 border border-white/8 opacity-30 cursor-not-allowed'
              : 'bg-white/10 border border-white/12 hover:bg-white/16'
          }`}
          aria-label={`Diminuer ${stock.name}`}
        >
          <Minus size={18} strokeWidth={2.5} className="text-white" />
        </motion.button>

        <div className="w-14 text-center mx-1">
          <motion.div
            key={stock.production}
            initial={{ scale: 1.25 }}
            animate={{ scale: 1 }}
            transition={{ duration: 0.2 }}
            className="font-bold text-2xl tabular-nums select-none text-white"
          >
            {stock.production}
          </motion.div>
          {/* Total disponible si report */}
          {hasReport && (
            <p className="text-orange-400/60 text-[9px] leading-none mt-0.5 tabular-nums">
              +{stock.reportVeille} = {stock.production + (stock.reportVeille ?? 0)}
            </p>
          )}
        </div>

        <motion.button
          whileTap={{ scale: 0.88 }}
          onPointerDown={() => onIncrement(stock.id)}
          className="w-12 h-12 rounded-2xl flex items-center justify-center select-none touch-manipulation transition-all active:scale-90"
          style={{
            background: `${categoryColor}20`,
            border:     `1px solid ${categoryColor}40`,
            color:      categoryColor,
          }}
          aria-label={`Augmenter ${stock.name}`}
        >
          <Plus size={18} strokeWidth={2.5} />
        </motion.button>
      </div>
    </motion.div>
  );
}

// ── Composant : section catégorie ─────────────────────────────

function CategorieSection({
  category, stocks, suggestions, aiSuggestionsMap,
  onIncrement, onDecrement, onApplySuggestion, onAjusterReport,
}: {
  category:          string;
  stocks:            StockEntry[];
  suggestions:       ProductionSuggestion[];
  aiSuggestionsMap:  Map<string, ProductionSuggestion> | null;
  onIncrement:       (id: string) => void;
  onDecrement:       (id: string) => void;
  onApplySuggestion: (id: string) => void;
  onAjusterReport:   (id: string, delta: number) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const cfg = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.boulangerie;

  // Total dispo = production fraîche + reports
  const totalPieces  = stocks.reduce((s, p) => s + p.production, 0);
  const totalReporte = stocks.reduce((s, p) => s + (p.reportVeille ?? 0), 0);
  const totalDispo   = totalPieces + totalReporte;
  const totalCA      = stocks.reduce((s, p) => s + (p.production + (p.reportVeille ?? 0)) * p.prixVente, 0);

  if (stocks.length === 0) return null;

  return (
    <div className="rounded-2xl overflow-hidden border mb-4" style={{ background: cfg.bg, borderColor: cfg.border }}>
      <button
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 border-b text-left"
        style={{ borderColor: cfg.border }}
      >
        <span className="text-xl flex-shrink-0">{cfg.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold" style={{ color: cfg.color }}>{cfg.label}</p>
            {totalReporte > 0 && (
              <span className="text-[9px] bg-orange-500/20 text-orange-400 border border-orange-500/25 px-1.5 py-0.5 rounded-full">
                +{totalReporte} J-1
              </span>
            )}
          </div>
          <p className="text-white/35 text-xs mt-0.5">
            {totalDispo} pièce{totalDispo > 1 ? 's' : ''} disponibles · {totalCA.toFixed(0)} € CA estimé
          </p>
        </div>
        {collapsed
          ? <ChevronDown size={14} style={{ color: cfg.color }} />
          : <ChevronUp   size={14} style={{ color: cfg.color }} />
        }
      </button>

      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            {stocks.map((stock, index) => {
              const aiSuggestion    = aiSuggestionsMap?.get(stock.id);
              const histoSuggestion = suggestions.find(s => s.id === stock.id);
              const activeSuggestion = aiSuggestion ?? histoSuggestion;
              const isAI = !!aiSuggestion;

              return (
                <ProduitRow
                  key={stock.id}
                  stock={stock}
                  suggestion={activeSuggestion}
                  isAISuggestion={isAI}
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                  onApplySuggestion={onApplySuggestion}
                  onAjusterReport={onAjusterReport}
                  isFirst={index === 0}
                  categoryColor={cfg.color}
                />
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Composant : carte fournée ─────────────────────────────────

function FourneeCard({ numero, heure, isActive, onClick }: {
  numero: number; heure: string; isActive: boolean; onClick: () => void;
}) {
  return (
    <motion.button
      whileTap={{ scale: 0.94 }}
      onClick={onClick}
      className={`flex-shrink-0 flex flex-col items-center gap-1 px-4 py-2.5 rounded-2xl border transition-all ${
        isActive
          ? 'bg-[#C19A6B]/18 border-[#C19A6B]/35'
          : 'bg-white/5 border-white/10 hover:bg-white/8'
      }`}
    >
      <span className={`text-sm font-bold ${isActive ? 'text-[#C19A6B]' : 'text-white/60'}`}>
        Fournée {numero}
      </span>
      <span className={`text-[10px] font-mono ${isActive ? 'text-[#C19A6B]/70' : 'text-white/30'}`}>
        {heure}
      </span>
    </motion.button>
  );
}

// ── Composant principal ───────────────────────────────────────

export default function VueMatin() {
  const {
    todayStocks, reportsVeille,
    productionSuggestions,
    updateProduction, updateReportVeille,
    syncStatus, authLoading,
  } = useBoulanger();

  const [validated,     setValidated]     = useState(false);
  const [fourneeActive, setFourneeActive] = useState(0);
  const [fournees,      setFournees]      = useState<{ heure: string }[]>([
    { heure: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) },
  ]);

  // ── Prévisions Levain IA ─────────────────────────────────
  const [levainForecasts, setLevainForecasts]   = useState<LevainForecast[] | null>(null);
  const [levainApplying,  setLevainApplying]    = useState(false);

  useEffect(() => { loadLevainForecasts(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const loadLevainForecasts = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;
      const today = new Date().toLocaleDateString('en-CA');
      const res = await fetch(`/api/boulanger/ai/appliquer?date=${today}`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const data = await res.json() as { previsions: LevainForecast[]; count: number };
      if (data.previsions?.length > 0) setLevainForecasts(data.previsions);
    } catch (err) {
      console.warn('[VueMatin] loadLevainForecasts:', err);
    }
  }, []);

  const aiSuggestionsMap = useMemo<Map<string, ProductionSuggestion> | null>(() => {
    if (!levainForecasts?.length) return null;
    const map = new Map<string, ProductionSuggestion>();
    for (const f of levainForecasts) {
      const stock = todayStocks.find(s => s.id === f.produit_id);
      if (!stock) continue;
      map.set(f.produit_id, {
        id: f.produit_id, name: stock.name, emoji: stock.emoji,
        avgProduction: f.quantite_base,
        suggestedQty:  f.quantite_suggeree,
        dataPoints:    1,
        changePercent: f.variation_pct,
        confidence:    'high',
      });
    }
    return map;
  }, [levainForecasts, todayStocks]);

  // Grouper par catégorie
  const grouped = useMemo(() => {
    const map: Record<string, StockEntry[]> = {};
    for (const cat of CATEGORY_ORDER) map[cat] = [];
    for (const s of todayStocks) {
      const cat = s.category in map ? s.category : 'boulangerie';
      map[cat].push(s);
    }
    return map;
  }, [todayStocks]);

  // Résumé des reports disponibles (bandeau info)
  const nbProduitsAvecReport = Object.keys(reportsVeille).length;
  const totalUniteReportees  = Object.values(reportsVeille).reduce((s, r) => s + r.quantite, 0);

  const handleIncrement = (id: string) => {
    const s = todayStocks.find(x => x.id === id);
    if (s) updateProduction(id, s.production + 1);
  };
  const handleDecrement = (id: string) => {
    const s = todayStocks.find(x => x.id === id);
    if (s && s.production > 0) updateProduction(id, s.production - 1);
  };
  const handleApplySuggestion = (id: string) => {
    const aiSug   = aiSuggestionsMap?.get(id);
    const histSug = productionSuggestions.find(s => s.id === id);
    const sug = aiSug ?? histSug;
    if (sug) updateProduction(id, sug.suggestedQty);
  };
  const handleAjusterReport = (id: string, delta: number) => {
    const stock = todayStocks.find(s => s.id === id);
    if (!stock) return;
    const current = stock.reportVeille ?? 0;
    updateReportVeille(id, Math.max(0, current + delta));
  };

  const handleApplyAll = useCallback(async () => {
    if (levainForecasts?.length && aiSuggestionsMap) {
      setLevainApplying(true);
      levainForecasts.forEach(f => updateProduction(f.produit_id, f.quantite_suggeree));
      setLevainForecasts(null);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          const today = new Date().toLocaleDateString('en-CA');
          await fetch('/api/boulanger/ai/appliquer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ date_production: today }),
          });
        }
      } catch (err) {
        console.warn('[handleApplyAll]', err);
      } finally {
        setLevainApplying(false);
      }
    } else {
      productionSuggestions.forEach(s => {
        if (s.dataPoints > 0) updateProduction(s.id, s.suggestedQty);
      });
    }
  }, [levainForecasts, aiSuggestionsMap, productionSuggestions, updateProduction]);

  const handleValider = () => {
    setValidated(true);
    setTimeout(() => setValidated(false), 4000);
  };

  const handleAddFournee = () => {
    const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    const idx = fournees.length;
    setFournees(prev => [...prev, { heure }]);
    setFourneeActive(idx);
  };

  const caEstime    = todayStocks.reduce((acc, s) => acc + (s.production + (s.reportVeille ?? 0)) * s.prixVente, 0);
  const totalPieces = todayStocks.reduce((acc, s) => acc + s.production, 0);
  const totalDispo  = totalPieces + todayStocks.reduce((acc, s) => acc + (s.reportVeille ?? 0), 0);

  const hasLevainSuggestions = !!levainForecasts?.length;
  const hasHistoSuggestions  = !hasLevainSuggestions && productionSuggestions.some(
    s => s.dataPoints > 0 && s.suggestedQty !== todayStocks.find(t => t.id === s.id)?.production
  );
  const hasSuggestions = hasLevainSuggestions || hasHistoSuggestions;

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

      {/* ── Header ─────────────────────────────────────────────── */}
      <div data-tour="matin-header" className="pt-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium capitalize">
              {jourSemaine} {dateFr}
            </p>
            <h1 className="text-white text-2xl font-bold mt-1 leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
              Production du matin
            </h1>
          </div>
          <div className="text-right">
            <p className="text-[#C19A6B] text-lg font-bold tabular-nums">{caEstime.toFixed(0)} €</p>
            <p className="text-white/30 text-xs">CA estimé</p>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/8">
            <TrendingUp size={11} className="text-[#C19A6B]/70" />
            <span className="text-[11px] text-white/50 tabular-nums">
              {totalPieces} fraîches
              {totalDispo > totalPieces && <> + {totalDispo - totalPieces} reportées = <strong className="text-white/70">{totalDispo}</strong></>}
            </span>
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

      {/* ── Bandeau report J-1 ─────────────────────────────────── */}
      {/* Affiché uniquement si des produits de la veille sont reportables */}
      <AnimatePresence>
        {nbProduitsAvecReport > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="flex items-start gap-3 bg-orange-500/8 border border-orange-500/20 rounded-2xl px-4 py-3">
              <AlertCircle size={14} className="text-orange-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-orange-300 text-sm font-semibold">
                  {nbProduitsAvecReport} produit{nbProduitsAvecReport > 1 ? 's' : ''} reporté{nbProduitsAvecReport > 1 ? 's' : ''} de la veille
                </p>
                <p className="text-orange-300/60 text-[10px] mt-0.5 leading-relaxed">
                  {totalUniteReportees} unité{totalUniteReportees > 1 ? 's' : ''} pré-remplies.
                  Ajustez les quantités si certaines ont été consommées ou ne sont plus vendables.
                  Ces produits seront <strong className="text-orange-300/90">prioritaires dans le flash anti-gaspi</strong> ce soir.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Sélecteur fournées ─────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <Package size={12} className="text-white/35" />
          <p className="text-white/35 text-[10px] uppercase tracking-widest font-semibold">Fournées du jour</p>
        </div>
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {fournees.map((f, i) => (
            <FourneeCard
              key={i} numero={i + 1} heure={f.heure}
              isActive={fourneeActive === i} onClick={() => setFourneeActive(i)}
            />
          ))}
          <motion.button
            whileTap={{ scale: 0.94 }}
            onClick={handleAddFournee}
            className="flex-shrink-0 flex items-center gap-1.5 px-4 py-2.5 rounded-2xl border border-dashed border-white/20 text-white/40 hover:border-[#C19A6B]/40 hover:text-[#C19A6B] transition-all text-xs font-medium"
          >
            <Plus size={13} />
            Ajouter fournée
          </motion.button>
        </div>
        {fournees.length > 1 && (
          <p className="text-white/20 text-[10px] mt-1.5 px-1">
            Les quantités s'accumulent sur la production totale du jour
          </p>
        )}
      </div>

      {/* ── Bandeau suggestions Levain ─────────────────────────── */}
      <AnimatePresence>
        {hasSuggestions && (
          <motion.button
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            onClick={handleApplyAll}
            disabled={levainApplying}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all disabled:opacity-60"
            style={
              hasLevainSuggestions
                ? { background: 'linear-gradient(135deg, rgba(147,51,234,0.12) 0%, rgba(147,51,234,0.06) 100%)', borderColor: 'rgba(147,51,234,0.25)' }
                : { background: 'linear-gradient(135deg, rgba(193,154,107,0.12) 0%, rgba(232,201,154,0.06) 100%)', borderColor: 'rgba(193,154,107,0.2)' }
            }
          >
            <div className="flex items-center gap-2">
              {levainApplying
                ? <Loader2 size={14} className="animate-spin text-purple-400" />
                : hasLevainSuggestions
                  ? <Brain size={14} className="text-purple-400" />
                  : <Sparkles size={14} className="text-[#C19A6B]/80" />
              }
              <div className="text-left">
                <span className={`text-[13px] font-semibold ${hasLevainSuggestions ? 'text-purple-300' : 'text-[#C19A6B]/90'}`}>
                  {levainApplying ? 'Application en cours…'
                    : hasLevainSuggestions ? 'Appliquer les prévisions Levain IA'
                    : 'Appliquer les suggestions Levain'}
                </span>
                {hasLevainSuggestions && (
                  <p className="text-[10px] text-purple-400/60 mt-0.5">
                    {levainForecasts?.length} produits · historique + météo
                  </p>
                )}
              </div>
            </div>
            <ChevronRight size={14} className={hasLevainSuggestions ? 'text-purple-400/50' : 'text-[#C19A6B]/50'} />
          </motion.button>
        )}
      </AnimatePresence>

      {/* ── Listes par catégorie ──────────────────────────────── */}
      <div>
        {CATEGORY_ORDER.map(cat => (
          <CategorieSection
            key={cat}
            category={cat}
            stocks={grouped[cat] ?? []}
            suggestions={productionSuggestions}
            aiSuggestionsMap={aiSuggestionsMap}
            onIncrement={handleIncrement}
            onDecrement={handleDecrement}
            onApplySuggestion={handleApplySuggestion}
            onAjusterReport={handleAjusterReport}
          />
        ))}
      </div>

      {/* ── Bouton Valider ─────────────────────────────────────── */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleValider}
        disabled={totalPieces === 0 && totalDispo === 0}
        className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 font-bold text-base transition-all duration-300 select-none touch-manipulation disabled:opacity-30 disabled:cursor-not-allowed"
        style={
          validated
            ? { background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: 'rgb(74,222,128)' }
            : { background: 'linear-gradient(135deg, rgba(193,154,107,0.25) 0%, rgba(193,154,107,0.12) 100%)', border: '1px solid rgba(193,154,107,0.35)', color: '#C19A6B' }
        }
      >
        {validated
          ? <><CheckCircle2 size={20} /> Fournée {fourneeActive + 1} validée ✓</>
          : <><CheckCircle2 size={20} /> Valider la fournée {fourneeActive + 1} ({totalDispo} pièces disponibles)</>
        }
      </motion.button>

      <p className="text-center text-white/18 text-[10px] pb-2">
        Saisie sauvegardée en continu · Production fraîche + reports de la veille
      </p>
    </div>
  );
}