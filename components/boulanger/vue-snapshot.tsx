'use client';
// components/boulanger/vue-snapshot.tsx
// Vue snapshot étagère — saisie ce qui reste en rayon (10h et 14h).
// Les ventes sont calculées automatiquement par différence.

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Camera, AlertTriangle, TrendingDown, Check, Loader2 } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';

// ─── Types ────────────────────────────────────────────────────

type Slot = '10h' | '14h';

interface ProduitSnapshot {
  id:            string;
  nom:           string;
  emoji:         string;
  produit:       number;  // ce qui a été produit ce matin
  reste10h?:     number;  // saisie 10h
  reste14h?:     number;  // saisie 14h
  seuilAlerte:   number;  // % restant au-delà duquel on alerte
}

// ─── Cellule de saisie ────────────────────────────────────────

function SnapshotCell({
  value,
  max,
  onChange,
  seuilAlerte,
}: {
  value: number | undefined;
  max: number;
  onChange: (v: number) => void;
  seuilAlerte: number;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput]     = useState(value?.toString() ?? '');

  const pct     = max > 0 && value !== undefined ? (value / max) * 100 : null;
  const alerte  = pct !== null && pct > seuilAlerte;

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
  const { } = useBoulanger(); // contexte disponible si besoin futur
  const [produits, setProduits]   = useState<ProduitSnapshot[]>([]);
  const [slotActif, setSlotActif] = useState<Slot>('10h');
  const [loading, setLoading]     = useState(true);
  const [saved, setSaved]         = useState(false);

  useEffect(() => {
    // TODO: fetch depuis /api/boulanger/journee pour les quantités produites ce matin
    setProduits([
      { id: '1', nom: 'Baguette tradition', emoji: '🥖', produit: 80, seuilAlerte: 30 },
      { id: '2', nom: 'Croissant',          emoji: '🥐', produit: 40, seuilAlerte: 30 },
      { id: '3', nom: 'Pain de campagne',   emoji: '🍞', produit: 12, seuilAlerte: 30 },
      { id: '4', nom: 'Pain au chocolat',   emoji: '🍫', produit: 35, seuilAlerte: 30 },
      { id: '5', nom: 'Ficelle',            emoji: '🫓', produit: 20, seuilAlerte: 30 },
    ]);
    setLoading(false);
  }, []);

  const handleChange = (id: string, slot: Slot, val: number) => {
    setProduits(prev => prev.map(p => {
      if (p.id !== id) return p;
      return slot === '10h' ? { ...p, reste10h: val } : { ...p, reste14h: val };
    }));
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    // updateSnapshot(produits) — via context
  };

  // Produits en alerte pour le slot actif
  const alertes = produits.filter(p => {
    const reste = slotActif === '10h' ? p.reste10h : p.reste14h;
    if (reste === undefined || p.produit === 0) return false;
    return (reste / p.produit) * 100 > p.seuilAlerte;
  });

  const heure = new Date().getHours();
  const slotSuggere: Slot = heure < 12 ? '10h' : '14h';

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
        {(['10h', '14h'] as Slot[]).map(slot => (
          <button
            key={slot}
            onClick={() => setSlotActif(slot)}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all border ${
              slotActif === slot
                ? 'bg-[#C19A6B]/15 border-[#C19A6B]/25 text-[#C19A6B]'
                : 'bg-white/3 border-white/8 text-white/40 hover:text-white/60'
            }`}
          >
            📸 {slot}
            {slot === slotSuggere && (
              <span className="ml-1.5 text-[9px] text-[#C19A6B]/60">maintenant</span>
            )}
          </button>
        ))}
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
              {alertes.map(a => a.nom).join(', ')}
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
          <p className="w-14 text-center text-[#C19A6B]/60 text-[10px] font-semibold">Reste {slotActif}</p>
          <p className="w-14 text-center text-white/30 text-[10px]">Vendus</p>
        </div>

        {/* Lignes */}
        {produits.map(p => {
          const reste = slotActif === '10h' ? p.reste10h : p.reste14h;
          const vendus = reste !== undefined ? Math.max(0, p.produit - reste) : undefined;

          return (
            <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/4 last:border-0">
              <div className="flex-1 flex items-center gap-2 min-w-0">
                <span className="text-base">{p.emoji}</span>
                <span className="text-white text-sm truncate">{p.nom}</span>
              </div>
              {/* Produit (readonly) */}
              <div className="w-14 text-center text-white/40 text-sm font-mono tabular-nums">
                {p.produit}
              </div>
              {/* Saisie reste */}
              <div className="w-14 flex justify-center">
                <SnapshotCell
                  value={reste}
                  max={p.produit}
                  onChange={val => handleChange(p.id, slotActif, val)}
                  seuilAlerte={p.seuilAlerte}
                />
              </div>
              {/* Vendus calculés */}
              <div className="w-14 text-center">
                {vendus !== undefined ? (
                  <span className="text-green-400/70 text-sm font-mono tabular-nums">
                    {vendus}
                  </span>
                ) : (
                  <span className="text-white/15 text-sm">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Bouton sauvegarder ── */}
      <button
        onClick={handleSave}
        className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all font-semibold text-sm"
        style={{
          background: saved
            ? 'rgba(74,222,128,0.15)'
            : 'linear-gradient(135deg, rgba(193,154,107,0.2) 0%, rgba(193,154,107,0.1) 100%)',
          border: `1px solid ${saved ? 'rgba(74,222,128,0.3)' : 'rgba(193,154,107,0.25)'}`,
          color: saved ? 'rgb(74,222,128)' : '#C19A6B',
        }}
      >
        {saved ? (
          <><Check size={15} /> Snapshot enregistré</>
        ) : (
          <><Camera size={15} /> Enregistrer le snapshot {slotActif}</>
        )}
      </button>

      {/* Légende */}
      <div className="flex items-center gap-2 justify-center">
        <TrendingDown size={11} className="text-amber-400/50" />
        <p className="text-white/20 text-[10px]">
          Fond orange = risque d'invendu (reste &gt; {produits[0]?.seuilAlerte ?? 30}% du produit)
        </p>
      </div>
    </div>
  );
}