'use client';
// components/boulanger/vue-snapshot.tsx
// ✅ Valeur de départ = 0 (vendeuse saisit ce qui reste, pas ce qui était)
// ✅ Gros boutons tactiles pour usage au comptoir
// ✅ FIX : snapshot14h limité par snapshot10h même quand snapshot10h === 0
//          (si snapshot10hDone=true et snapshot10h=0, max14h=0, pas production)

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, AlertTriangle, TrendingDown, Check, Loader2, Plus, Minus } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import type { StockEntry } from '@/context/boulanger-context';

type Slot = '10h' | '14h';

const SEUIL_ALERTE_PCT = 30; // % restant au-delà duquel on alerte

// ─── Cellule tactile ──────────────────────────────────────────

function SnapshotCellTouch({
  value,
  max,
  onChange,
  disabled,
}: {
  value:    number;
  max:      number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const pct    = max > 0 ? (value / max) * 100 : 0;
  const alerte = pct > SEUIL_ALERTE_PCT && value > 0;

  const decrement = () => { if (value > 0) onChange(value - 1); };
  const increment = () => { if (value < max) onChange(value + 1); };

  if (disabled) {
    return (
      <div className="flex items-center gap-2">
        <div
          className={`w-14 h-11 rounded-xl flex items-center justify-center text-sm font-bold font-mono border ${
            alerte ? 'bg-amber-500/10 border-amber-500/20 text-amber-400' : 'bg-white/5 border-white/8 text-white/40'
          }`}
        >
          {value}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      {/* Bouton − */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onPointerDown={decrement}
        disabled={value <= 0}
        className={`
          w-12 h-12 rounded-xl flex items-center justify-center
          select-none touch-manipulation transition-all
          ${value <= 0
            ? 'bg-white/4 border border-white/6 opacity-30 cursor-not-allowed'
            : 'bg-white/10 border border-white/12 hover:bg-white/16 active:bg-white/22'
          }
        `}
        aria-label="Diminuer"
      >
        <Minus size={16} strokeWidth={2.5} className="text-white" />
      </motion.button>

      {/* Valeur */}
      <motion.div
        key={value}
        initial={{ scale: 1.2 }}
        animate={{ scale: 1 }}
        transition={{ duration: 0.15 }}
        className={`
          w-14 h-12 rounded-xl flex items-center justify-center
          text-lg font-bold font-mono tabular-nums border select-none
          ${alerte
            ? 'bg-amber-500/12 border-amber-500/25 text-amber-400'
            : value > 0
              ? 'bg-[#C19A6B]/10 border-[#C19A6B]/20 text-[#C19A6B]'
              : 'bg-white/5 border-white/8 text-white/50'
          }
        `}
      >
        {value}
      </motion.div>

      {/* Bouton + */}
      <motion.button
        whileTap={{ scale: 0.85 }}
        onPointerDown={increment}
        disabled={value >= max}
        className={`
          w-12 h-12 rounded-xl flex items-center justify-center
          select-none touch-manipulation transition-all
          ${value >= max
            ? 'bg-white/4 border border-white/6 opacity-30 cursor-not-allowed'
            : 'bg-[#C19A6B]/20 border border-[#C19A6B]/30 hover:bg-[#C19A6B]/30 active:bg-[#C19A6B]/40'
          }
        `}
        aria-label="Augmenter"
      >
        <Plus size={16} strokeWidth={2.5} className="text-[#C19A6B]" />
      </motion.button>
    </div>
  );
}

// ─── Vue Snapshot ─────────────────────────────────────────────

export default function VueSnapshot() {
  const {
    todayStocks,
    reservedByProduct,
    updateSnapshot,
    validateSnapshot,
    syncStatus,
    authLoading,
  } = useBoulanger();

  const [slotActif, setSlotActif] = useState<Slot>('10h');
  const [saved, setSaved]         = useState(false);

  const handleChange = (stock: StockEntry, slot: Slot, val: number) => {
    updateSnapshot(stock.id, val, slot);
  };

  const handleSave = () => {
    validateSnapshot(slotActif);
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  };

  // Alertes invendus potentiels
  const alertes = todayStocks.filter(s => {
    const reste = slotActif === '10h' ? s.snapshot10h : s.snapshot14h;
    if (s.production === 0) return false;
    return reste > 0 && (reste / s.production) * 100 > SEUIL_ALERTE_PCT;
  });

  const heure       = new Date().getHours();
  const slotSuggere: Slot = heure < 12 ? '10h' : '14h';

  if (authLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin" />
      </div>
    );
  }

  if (todayStocks.length === 0 || todayStocks.every(s => s.production === 0)) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="text-5xl mb-4">📸</span>
        <p className="text-white/50 font-medium">Aucune production saisie</p>
        <p className="text-white/25 text-sm mt-1">
          Saisissez la production dans l'onglet <span className="text-[#C19A6B]">Matin</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div data-tour="snapshot-header" className="pt-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium">
              Comptage étagère
            </p>
            <h1
              className="text-white text-2xl font-bold mt-1"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Stock en rayon
            </h1>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-[#C19A6B]/10 border border-[#C19A6B]/15 flex items-center justify-center">
            <Camera size={18} className="text-[#C19A6B]/70" />
          </div>
        </div>
        <p className="text-white/35 text-xs mt-2 leading-relaxed">
          Saisissez ce qui <strong className="text-white/55">reste</strong> en vitrine.
          Partez de zéro — ajoutez uniquement les invendus.
        </p>
      </div>

      {/* ── Sélecteur de slot ── */}
      <div className="flex gap-2">
        {(['10h', '14h'] as Slot[]).map(slot => {
          const isDone = slot === '10h'
            ? todayStocks.some(s => s.snapshot10hDone)
            : todayStocks.some(s => s.snapshot14hDone);
          return (
            <motion.button
              key={slot}
              whileTap={{ scale: 0.96 }}
              onClick={() => setSlotActif(slot)}
              className={`
                flex-1 py-3.5 rounded-2xl text-sm font-bold transition-all border
                select-none touch-manipulation
                ${slotActif === slot
                  ? 'bg-[#C19A6B]/15 border-[#C19A6B]/30 text-[#C19A6B]'
                  : 'bg-white/4 border-white/8 text-white/50 hover:text-white/70'
                }
              `}
            >
              {isDone ? '✅' : '📸'} Snapshot {slot}
              {slot === slotSuggere && !isDone && (
                <span className="ml-1.5 text-[9px] text-[#C19A6B]/60">maintenant</span>
              )}
            </motion.button>
          );
        })}
      </div>

      {/* ── Alerte invendus ── */}
      {alertes.length > 0 && (
        <div
          data-tour="snapshot-alerte"
          className="flex items-start gap-3 px-4 py-3 rounded-2xl border"
          style={{ background: 'rgba(245,158,11,0.08)', borderColor: 'rgba(245,158,11,0.2)' }}
        >
          <AlertTriangle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 text-xs font-semibold">
              {alertes.length} produit{alertes.length > 1 ? 's' : ''} à risque d'invendu
            </p>
            <p className="text-amber-400/60 text-[11px] mt-0.5">
              {alertes.map(a => a.name).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* ── Liste produits ── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
          borderColor: 'rgba(255,255,255,0.07)',
        }}
      >
        {/* En-tête */}
        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/5">
          <p className="flex-1 text-white/30 text-[10px] uppercase tracking-widest">Produit</p>
          <p className="text-white/30 text-[10px] uppercase tracking-widest text-right pr-1">
            Produit / Reste
          </p>
        </div>

        {/* Lignes */}
        {todayStocks.map(stock => {
          const isDone = slotActif === '10h' ? stock.snapshot10hDone : stock.snapshot14hDone;
          const reste  = slotActif === '10h' ? stock.snapshot10h : stock.snapshot14h;

          // ── FIX : max14h basé sur snapshot10hDone (pas snapshot10h > 0)
          // Si snapshot10hDone=true et snapshot10h=0 → max=0 (tout vendu à 10h)
          // Si snapshot10hDone=false → max=production (pas encore de snapshot 10h)
          const base = slotActif === '10h'
            ? stock.production
            : (stock.snapshot10hDone ? stock.snapshot10h : stock.production);

          const vendus = base - reste;

          // Label de référence affiché
          const refLabel = slotActif === '14h' && stock.snapshot10hDone
            ? `Snapshot 10h : ${stock.snapshot10h} restants`
            : `${stock.production} produits (base production)`;

          return (
            <div
              key={stock.id}
              className={`
                flex items-center gap-3 px-4 py-3 border-b border-white/4 last:border-0
                ${isDone ? 'opacity-45' : ''}
              `}
            >
              {/* Produit */}
              <div className="flex-1 flex items-center gap-2.5 min-w-0">
                <span className="text-xl leading-none flex-shrink-0">{stock.emoji}</span>
                <div className="min-w-0">
                  <p className="text-white text-sm font-medium line-clamp-2">{stock.name}</p>
                  <p className="text-white/35 text-xs tabular-nums">
                    {refLabel}
                    {vendus > 0 && (
                      <span className="text-green-400/60 ml-2">→ {vendus} vendus</span>
                    )}
                    {/* Indicateur réservations C&C actives */}
                    {(reservedByProduct[stock.name] ?? 0) > 0 && (
                      <span className="text-amber-400/80 ml-2 font-medium">
                        · {reservedByProduct[stock.name]} réservé{reservedByProduct[stock.name] > 1 ? 's' : ''} C&C
                      </span>
                    )}
                    {/* Indicateur 14h bloqué si tout vendu à 10h */}
                    {slotActif === '14h' && stock.snapshot10hDone && stock.snapshot10h === 0 && (
                      <span className="text-white/30 ml-2 italic">· tout vendu à 10h</span>
                    )}
                  </p>
                </div>
              </div>

              {/* Contrôle tactile */}
              <div className="flex-shrink-0">
                <SnapshotCellTouch
                  value={reste}
                  max={base}
                  onChange={val => handleChange(stock, slotActif, val)}
                  disabled={isDone || (slotActif === '14h' && stock.snapshot10hDone && stock.snapshot10h === 0)}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bouton valider snapshot ── */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={handleSave}
        disabled={syncStatus === 'saving'}
        className={`
          w-full py-4 rounded-2xl flex items-center justify-center gap-2.5
          font-bold text-base transition-all duration-300 select-none touch-manipulation
          disabled:opacity-50
        `}
        style={
          saved
            ? { background: 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: 'rgb(74,222,128)' }
            : { background: 'linear-gradient(135deg, rgba(193,154,107,0.25) 0%, rgba(193,154,107,0.12) 100%)', border: '1px solid rgba(193,154,107,0.35)', color: '#C19A6B' }
        }
      >
        {syncStatus === 'saving'
          ? <><Loader2 size={18} className="animate-spin" /> Synchronisation…</>
          : saved
            ? <><Check size={18} /> Snapshot {slotActif} enregistré ✓</>
            : <><Camera size={18} /> Valider le snapshot {slotActif}</>
        }
      </motion.button>

      <div className="flex items-center gap-2 justify-center pb-1">
        <TrendingDown size={11} className="text-amber-400/50" />
        <p className="text-white/20 text-[10px]">
          Orange = reste &gt; {SEUIL_ALERTE_PCT}% de la production
        </p>
      </div>
    </div>
  );
}