'use client';
// components/boulanger/vue-sandwichs.tsx
// ─────────────────────────────────────────────────────────────
// Saisie des sandwichs & snacking du midi.
// Déverrouillé à 11h — stock pain déduit automatiquement.
//
// Logique bread deduction :
//   - Chaque sandwich consomme X unités de pain baguette
//   - Le stock "pain" de la journée est mis à jour en temps réel
//   - Affiche un avertissement si le stock pain est insuffisant
// ─────────────────────────────────────────────────────────────

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Minus, CheckCircle2, Loader2, Info,
  AlertTriangle, Wheat, ArrowDown,
} from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import type { StockEntry } from '@/context/boulanger-context';

// Coût en pain (baguette-équivalent) par unité de sandwich
// Le boulanger peut ajuster ça dans les paramètres produit à terme
const DEFAULT_BREAD_COST = 0.5; // 1 sandwich = 0.5 baguette

interface SandwichEntry {
  stockId:    string;
  name:       string;
  emoji:      string;
  quantity:   number;
  breadCost:  number; // baguettes consommées par unité
}

interface VueSandwichsProps {
  onValidate?: (entries: SandwichEntry[]) => void;
}

export default function VueSandwichs({ onValidate }: VueSandwichsProps) {
  const { todayStocks, updateProduction, authLoading } = useBoulanger();
  const [validated, setValidated]   = useState(false);
  const [entries, setEntries]       = useState<Record<string, number>>({});

  // Produits sandwichs du catalogue
  const sandwichStocks = todayStocks.filter(s => s.category === 'sandwich');

  // Stock pain disponible (boulangerie seulement)
  const breadStocks = todayStocks.filter(s => s.category === 'boulangerie');
  const totalBreadProduction = breadStocks.reduce((sum, s) => sum + s.production, 0);

  // Pain utilisé par les sandwichs
  const totalBreadUsed = useMemo(() => {
    return sandwichStocks.reduce((sum, s) => {
      return sum + (entries[s.id] ?? 0) * DEFAULT_BREAD_COST;
    }, 0);
  }, [entries, sandwichStocks]);

  const breadRemaining = totalBreadProduction - totalBreadUsed;
  const breadWarning   = breadRemaining < 0;

  const totalSandwichs = Object.values(entries).reduce((a, b) => a + b, 0);

  const increment = useCallback((id: string) => {
    setEntries(prev => ({ ...prev, [id]: (prev[id] ?? 0) + 1 }));
  }, []);

  const decrement = useCallback((id: string) => {
    setEntries(prev => {
      const next = (prev[id] ?? 0) - 1;
      return { ...prev, [id]: Math.max(0, next) };
    });
  }, []);

  const handleValidate = () => {
    // Sync les quantités dans le contexte global
    sandwichStocks.forEach(s => {
      const qty = entries[s.id] ?? 0;
      updateProduction(s.id, qty);
    });

    const result: SandwichEntry[] = sandwichStocks
      .map(s => ({
        stockId:   s.id,
        name:      s.name,
        emoji:     s.emoji,
        quantity:  entries[s.id] ?? 0,
        breadCost: DEFAULT_BREAD_COST,
      }))
      .filter(e => e.quantity > 0);

    setValidated(true);
    onValidate?.(result);
    setTimeout(() => setValidated(false), 4000);
  };

  if (authLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin" />
    </div>
  );

  if (sandwichStocks.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <span className="text-5xl mb-4">🥪</span>
      <p className="text-white/50 font-medium text-sm">Aucun produit sandwich configuré</p>
      <p className="text-white/25 text-xs mt-1">
        Ajoutez des produits de catégorie <span className="text-[#C19A6B]">Sandwichs</span> dans votre catalogue.
      </p>
    </div>
  );

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="pt-2">
        <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium">
          Midi — disponible dès 11h
        </p>
        <h1 className="text-white text-2xl font-bold mt-1" style={{ fontFamily: 'Playfair Display, serif' }}>
          Sandwichs & Snacking
        </h1>
      </div>

      {/* Info pain */}
      <div className={`rounded-2xl border px-4 py-3.5 flex items-start gap-3 transition-colors ${
        breadWarning
          ? 'bg-red-500/10 border-red-500/20'
          : 'bg-white/4 border-white/8'
      }`}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          breadWarning ? 'bg-red-500/20' : 'bg-[#C19A6B]/12'
        }`}>
          {breadWarning
            ? <AlertTriangle size={14} className="text-red-400" />
            : <Wheat size={14} className="text-[#C19A6B]" />
          }
        </div>
        <div className="flex-1">
          <div className="flex items-center justify-between">
            <p className={`text-sm font-medium ${breadWarning ? 'text-red-300' : 'text-white/70'}`}>
              Stock pain disponible
            </p>
            <span className={`font-bold font-mono text-sm ${
              breadWarning ? 'text-red-400' : 'text-[#C19A6B]'
            }`}>
              {breadRemaining.toFixed(1)} baguettes
            </span>
          </div>
          <p className="text-white/30 text-xs mt-0.5">
            {totalBreadProduction} produites · {totalBreadUsed.toFixed(1)} utilisées pour sandwichs
            {breadWarning && ' · ⚠️ Insuffisant !'}
          </p>
          {/* Barre visuelle */}
          <div className="mt-2 h-1.5 bg-white/8 rounded-full overflow-hidden">
            <motion.div
              animate={{ width: `${Math.min(100, (totalBreadUsed / Math.max(totalBreadProduction, 1)) * 100)}%` }}
              className="h-full rounded-full"
              style={{ background: breadWarning ? '#ef4444' : 'linear-gradient(90deg, #C19A6B, #E8C99A)' }}
            />
          </div>
        </div>
      </div>

      {/* Liste sandwichs */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{ background: 'linear-gradient(145deg, rgba(255,255,255,0.035), rgba(255,255,255,0.01))', borderColor: 'rgba(255,255,255,0.07)' }}
      >
        {/* Légende */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
          <p className="text-white/30 text-[10px] uppercase tracking-widest">Produit</p>
          <div className="flex items-center gap-1.5 text-white/25 text-[10px]">
            <ArrowDown size={9} />
            <Wheat size={9} />
            <span>= 0.5 baguette</span>
          </div>
        </div>

        {sandwichStocks.map((stock, i) => {
          const qty  = entries[stock.id] ?? 0;
          const pain = (qty * DEFAULT_BREAD_COST).toFixed(1);

          return (
            <motion.div
              key={stock.id}
              layout
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="flex items-center gap-3 px-4 py-3.5 border-b border-white/5 last:border-0"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2.5">
                  <span className="text-2xl leading-none">{stock.emoji}</span>
                  <div>
                    <p className="text-white text-sm font-semibold">{stock.name}</p>
                    <p className="text-white/35 text-xs mt-0.5">
                      {stock.prixVente.toFixed(2)} €
                      {qty > 0 && (
                        <span className="text-amber-400/60 ml-2 font-mono">
                          −{pain} 🥖
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              </div>

              {/* Contrôles */}
              <div className="flex items-center gap-0 flex-shrink-0">
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onPointerDown={() => decrement(stock.id)}
                  disabled={qty === 0}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center select-none touch-manipulation transition-all ${
                    qty === 0
                      ? 'bg-white/5 border border-white/8 opacity-30 cursor-not-allowed'
                      : 'bg-white/10 border border-white/12 hover:bg-white/16'
                  }`}
                >
                  <Minus size={18} strokeWidth={2.5} className="text-white" />
                </motion.button>

                <motion.div
                  key={qty}
                  initial={{ scale: 1.25, color: '#C19A6B' }}
                  animate={{ scale: 1, color: '#FFFFFF' }}
                  transition={{ duration: 0.2 }}
                  className="w-14 text-center font-bold text-2xl tabular-nums mx-1 select-none"
                >
                  {qty}
                </motion.div>

                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onPointerDown={() => increment(stock.id)}
                  className="w-12 h-12 rounded-2xl flex items-center justify-center bg-[#C19A6B]/20 border border-[#C19A6B]/30 text-[#C19A6B] select-none touch-manipulation"
                >
                  <Plus size={18} strokeWidth={2.5} />
                </motion.button>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Récapitulatif */}
      {totalSandwichs > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          className="bg-[#C19A6B]/8 border border-[#C19A6B]/18 rounded-2xl px-4 py-3 flex items-center justify-between"
        >
          <p className="text-[#C19A6B]/80 text-sm font-medium">
            {totalSandwichs} sandwich{totalSandwichs > 1 ? 's' : ''} préparés
          </p>
          <p className="text-white/40 text-xs font-mono">
            {totalBreadUsed.toFixed(1)} baguettes utilisées
          </p>
        </motion.div>
      )}

      {/* Avertissement si surstock pain */}
      {breadWarning && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 flex items-start gap-2.5">
          <AlertTriangle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-red-300 text-sm">
            Attention — vous avez saisi plus de sandwichs que votre stock de pain ne le permet.
            Vérifiez la production du matin ou réduisez les quantités.
          </p>
        </div>
      )}

      {/* Bouton valider */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleValidate}
        className={`w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 font-bold text-base transition-all duration-300 select-none touch-manipulation`}
        style={
          validated
            ? { background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: 'rgb(74,222,128)' }
            : { background: 'linear-gradient(135deg, rgba(193,154,107,0.25), rgba(193,154,107,0.12))', border: '1px solid rgba(193,154,107,0.35)', color: '#C19A6B' }
        }
      >
        {validated
          ? <><CheckCircle2 size={20} /> Sandwichs validés ✓</>
          : <><CheckCircle2 size={20} /> Valider ({totalSandwichs} pcs · {totalBreadUsed.toFixed(1)} 🥖)</>
        }
      </motion.button>

      <p className="text-center text-white/15 text-[10px] pb-2">
        Saisie disponible de 11h à 14h · Stock pain mis à jour automatiquement
      </p>
    </div>
  );
}