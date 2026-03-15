'use client';
// components/boulanger/vue-snapshot.tsx
// Vue snapshot étagère — saisie ce qui reste en rayon (10h et 14h).
// Connectée au BoulangerContext : todayStocks, updateSnapshot, validateSnapshot.

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, AlertTriangle, TrendingDown, Check, Loader2 } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import type { StockEntry } from '@/context/boulanger-context';

// ─── Types ────────────────────────────────────────────────────

type Slot = '10h' | '14h';

const SEUIL_ALERTE_PCT = 30; // % restant au-delà duquel on alerte

// ─── Cellule de saisie ────────────────────────────────────────

function SnapshotCell({
  value,
  max,
  onChange,
}: {
  value:    number | undefined;
  max:      number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput]     = useState(value?.toString() ?? '');

  const pct    = max > 0 && value !== undefined ? (value / max) * 100 : null;
  const alerte = pct !== null && pct > SEUIL_ALERTE_PCT;

  const commit = () => {
    const n = parseInt(input, 10);
    if (!isNaN(n) && n >= 0 && n <= max) onChange(n);
    else setInput(value?.toString() ?? '');
    setEditing(false);
  };

  if (value === undefined) {
    return (
      <button
        onClick={() => { setInput(''); setEditing(true); }}
        className="w-14 h-9 rounded-xl border border-dashed border-white/15 flex items-center justify-center text-white/20 hover:border-[#C19A6B]/30 hover:text-[#C19A6B]/50 transition-all text-xs"
      >
        —
      </button>
    );
  }

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        max={max}
        value={input}
        onChange={e => setInput(e.target.value)}
        onBlur={commit}
        onKeyDown={e => e.key === 'Enter' && commit()}
        className="w-14 h-9 rounded-xl bg-[#C19A6B]/10 border border-[#C19A6B]/30 text-center text-white text-sm font-bold focus:outline-none tabular-nums"
      />
    );
  }

  return (
    <button
      onClick={() => { setInput(value.toString()); setEditing(true); }}
      className={`w-14 h-9 rounded-xl border flex items-center justify-center text-sm font-bold tabular-nums transition-all ${
        alerte
          ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
          : 'bg-white/5 border-white/8 text-white hover:bg-white/8'
      }`}
    >
      {value}
    </button>
  );
}

// ─── Vue Snapshot principale ──────────────────────────────────

export default function VueSnapshot() {
  const {
    todayStocks,
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
    setTimeout(() => setSaved(false), 2500);
  };

  // Stocks avec invendus potentiels pour le slot actif
  const alertes = todayStocks.filter(s => {
    const reste = slotActif === '10h' ? s.snapshot10h : s.snapshot14h;
    if (s.production === 0) return false;
    return (reste / s.production) * 100 > SEUIL_ALERTE_PCT;
  });

  const heure = new Date().getHours();
  const slotSuggere: Slot = heure < 12 ? '10h' : '14h';

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
        <span className="text-5xl mb-4">📸</span>
        <p className="text-white/50 font-medium">Aucune production saisie</p>
        <p className="text-white/25 text-sm mt-1">
          Saisissez d'abord votre production dans l'onglet <span className="text-[#C19A6B]">Matin</span>
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
              Contrôle étagère
            </p>
            <h1
              className="text-white text-2xl font-bold mt-1 leading-tight"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Snapshot de stock
            </h1>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-[#C19A6B]/10 border border-[#C19A6B]/15 flex items-center justify-center">
            <Camera size={18} className="text-[#C19A6B]/70" />
          </div>
        </div>
        <p className="text-white/30 text-xs mt-2 leading-relaxed">
          Saisissez ce qui <strong className="text-white/50">reste</strong> en rayon.
          Les ventes sont calculées automatiquement.
        </p>
      </div>

      {/* ── Sélecteur de slot ── */}
      <div className="flex gap-2">
        {(['10h', '14h'] as Slot[]).map(slot => {
          const isDone = slot === '10h'
            ? todayStocks.some(s => s.snapshot10hDone)
            : todayStocks.some(s => s.snapshot14hDone);
          return (
            <button
              key={slot}
              onClick={() => setSlotActif(slot)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
                slotActif === slot
                  ? 'bg-[#C19A6B]/15 border-[#C19A6B]/25 text-[#C19A6B]'
                  : 'bg-white/3 border-white/8 text-white/40 hover:text-white/60'
              }`}
            >
              {isDone ? '✅' : '📸'} {slot}
              {slot === slotSuggere && !isDone && (
                <span className="ml-1.5 text-[9px] text-[#C19A6B]/60">maintenant</span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Alerte invendus ── */}
      {alertes.length > 0 && (
        <div
          data-tour="snapshot-alerte"
          className="flex items-start gap-3 px-4 py-3 rounded-2xl border"
          style={{
            background: 'rgba(245,158,11,0.08)',
            borderColor: 'rgba(245,158,11,0.2)',
          }}
        >
          <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 text-[12px] font-semibold">
              {alertes.length} produit{alertes.length > 1 ? 's' : ''} à risque d'invendu
            </p>
            <p className="text-amber-400/60 text-[11px] mt-0.5">
              {alertes.map(a => a.name).join(', ')}
            </p>
          </div>
        </div>
      )}

      {/* ── Tableau produits ── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        {/* En-tête colonnes */}
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5">
          <p className="flex-1 text-white/30 text-[10px] uppercase tracking-widest">Produit</p>
          <p className="w-14 text-center text-white/30 text-[10px]">Produit</p>
          <p className="w-14 text-center text-[#C19A6B]/60 text-[10px] font-semibold">
            Reste {slotActif}
          </p>
          <p className="w-14 text-center text-white/30 text-[10px]">Vendus</p>
        </div>

        {/* Lignes */}
        {todayStocks.map(stock => {
          const isDone   = slotActif === '10h' ? stock.snapshot10hDone : stock.snapshot14hDone;
          const reste    = slotActif === '10h' ? stock.snapshot10h     : stock.snapshot14h;
          const base     = slotActif === '10h' ? stock.production       : stock.snapshot10h;
          const vendus   = base - reste;

          return (
            <div
              key={stock.id}
              className={`flex items-center gap-3 px-4 py-2.5 border-b border-white/4 last:border-0 ${isDone ? 'opacity-50' : ''}`}
            >
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-base">{stock.emoji}</span>
                <span className="text-white text-sm truncate">{stock.name}</span>
              </div>
              {/* Base (readonly) */}
              <div className="w-14 text-center text-white/40 text-sm font-mono tabular-nums">
                {slotActif === '10h' ? stock.production : stock.snapshot10h}
              </div>
              {/* Saisie reste */}
              <div className="w-14 flex justify-center">
                {isDone ? (
                  <div className="w-14 h-9 rounded-xl bg-white/3 border border-white/5 flex items-center justify-center">
                    <span className="text-white/40 text-sm font-mono">{reste}</span>
                  </div>
                ) : (
                  <SnapshotCell
                    value={reste}
                    max={base}
                    onChange={val => handleChange(stock, slotActif, val)}
                  />
                )}
              </div>
              {/* Vendus calculés */}
              <div className="w-14 text-center">
                <span className="text-green-400/70 text-sm font-mono tabular-nums">
                  {vendus > 0 ? vendus : '—'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bouton sauvegarder ── */}
      <button
        onClick={handleSave}
        disabled={syncStatus === 'saving'}
        className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all font-semibold text-sm disabled:opacity-50"
        style={{
          background: saved
            ? 'rgba(74,222,128,0.15)'
            : 'linear-gradient(135deg, rgba(193,154,107,0.2) 0%, rgba(193,154,107,0.1) 100%)',
          border: `1px solid ${saved ? 'rgba(74,222,128,0.3)' : 'rgba(193,154,107,0.25)'}`,
          color: saved ? 'rgb(74,222,128)' : '#C19A6B',
        }}
      >
        {syncStatus === 'saving' ? (
          <><Loader2 size={15} className="animate-spin" /> Synchronisation...</>
        ) : saved ? (
          <><Check size={15} /> Snapshot {slotActif} enregistré</>
        ) : (
          <><Camera size={15} /> Valider le snapshot {slotActif}</>
        )}
      </button>

      {/* Légende */}
      <div className="flex items-center gap-2 justify-center">
        <TrendingDown size={11} className="text-amber-400/50" />
        <p className="text-white/20 text-[10px]">
          Fond orange = risque d'invendu (reste &gt; {SEUIL_ALERTE_PCT}% du produit)
        </p>
      </div>
    </div>
  );
}