'use client';
// components/boulanger/vue-soir.tsx
// Vue du soir — bilan journée, invendus, paniers flash anti-gaspi.
// Connectée au BoulangerContext : todayStocks, updateStockFinal, closeDayAndSave.

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ZapOff, Package, Loader2, Check, ChevronDown, Info } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import type { StockEntry } from '@/context/boulanger-context';

// ─── Types ────────────────────────────────────────────────────

interface PanierSuggere {
  nom:       string;
  emoji:     string;
  items:     string[];
  prix:      number;
  prixFlash: number;
}

// ─── KPI Card ────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = 'default' }: {
  label: string;
  value: string;
  sub?:  string;
  color?: 'default' | 'green' | 'amber' | 'red';
}) {
  const colors = {
    default: { text: 'text-white',       bg: 'bg-white/5',       border: 'border-white/8' },
    green:   { text: 'text-green-400',   bg: 'bg-green-400/8',   border: 'border-green-400/15' },
    amber:   { text: 'text-amber-400',   bg: 'bg-amber-400/8',   border: 'border-amber-400/15' },
    red:     { text: 'text-red-400',     bg: 'bg-red-400/8',     border: 'border-red-400/15' },
  };
  const c = colors[color];

  return (
    <div className={`flex-1 rounded-2xl ${c.bg} border ${c.border} p-3`}>
      <p className="text-white/30 text-[10px] uppercase tracking-widest">{label}</p>
      <p className={`${c.text} text-xl font-bold mt-1 tabular-nums leading-none`}>{value}</p>
      {sub && <p className="text-white/25 text-[10px] mt-1">{sub}</p>}
    </div>
  );
}

// ─── Cellule saisie stock final ───────────────────────────────

function StockFinalCell({
  value,
  max,
  onChange,
}: {
  value:    number;
  max:      number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [input, setInput]     = useState(value.toString());

  const commit = () => {
    const n = parseInt(input, 10);
    if (!isNaN(n) && n >= 0 && n <= max) onChange(n);
    else setInput(value.toString());
    setEditing(false);
  };

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
        className="w-16 h-8 rounded-xl bg-[#C19A6B]/10 border border-[#C19A6B]/30 text-center text-white text-sm font-bold focus:outline-none tabular-nums"
      />
    );
  }

  return (
    <button
      onClick={() => { setInput(value.toString()); setEditing(true); }}
      className="w-16 h-8 rounded-xl bg-white/5 border border-white/8 text-white text-sm font-mono tabular-nums hover:bg-white/10 transition-colors"
    >
      {value}
    </button>
  );
}

// ─── Générateur de paniers suggérés ──────────────────────────

function genererPaniers(stocks: StockEntry[], remise = 40): PanierSuggere[] {
  const invendus = stocks.filter(s => s.stockFinal > 0);
  if (invendus.length === 0) return [];

  const valeurTotale = invendus.reduce((s, p) => s + p.stockFinal * p.prixVente, 0);
  const boul  = invendus.filter(s => s.category === 'boulangerie');
  const vien  = invendus.filter(s => s.category === 'viennoiserie');
  const patis = invendus.filter(s => s.category === 'patisserie');

  const paniers: PanierSuggere[] = [];

  // Petit panier : 2-3 articles, ~30% de la valeur
  if (invendus.length >= 2) {
    const selection = invendus.slice(0, Math.min(3, invendus.length));
    const prix = selection.reduce((s, p) => s + p.prixVente, 0);
    paniers.push({
      nom:      'Panier Découverte',
      emoji:    '🌅',
      items:    selection.map(p => p.name),
      prix:     parseFloat(prix.toFixed(2)),
      prixFlash: parseFloat((prix * (1 - remise / 100)).toFixed(2)),
    });
  }

  // Panier medium
  if (invendus.length >= 3) {
    const mid = invendus.slice(0, Math.min(5, invendus.length));
    const prix = mid.reduce((s, p) => s + p.prixVente, 0);
    paniers.push({
      nom:      'Panier Gourmand',
      emoji:    '🧺',
      items:    mid.map(p => p.name),
      prix:     parseFloat(prix.toFixed(2)),
      prixFlash: parseFloat((prix * (1 - remise / 100)).toFixed(2)),
    });
  }

  // Grand panier : tout
  if (invendus.length >= 4 && valeurTotale > 5) {
    paniers.push({
      nom:      'Grand Panier Anti-Gaspi',
      emoji:    '🎁',
      items:    invendus.map(p => `${p.stockFinal}× ${p.name}`),
      prix:     parseFloat(valeurTotale.toFixed(2)),
      prixFlash: parseFloat((valeurTotale * (1 - remise / 100)).toFixed(2)),
    });
  }

  return paniers;
}

// ─── Vue Soir principale ──────────────────────────────────────

export default function VueSoir() {
  const {
    todayStocks,
    updateStockFinal,
    closeDayAndSave,
    commandesOnline,
    revenueToday,
    unsoldToday,
    unsoldRateToday,
    totalProducedToday,
    syncStatus,
    authLoading,
  } = useBoulanger();

  // Flash actif par produit (local à la vue — contrôle quels invendus sont mis en flash)
  const [flashActifs, setFlashActifs] = useState<Record<string, boolean>>({});
  const [cloture, setCloture]         = useState(false);
  const [cloturing, setCloturing]     = useState(false);
  const [expanded, setExpanded]       = useState(false);

  const toggleFlash = (id: string) => {
    setFlashActifs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const isFlashActif = (stock: StockEntry) =>
    flashActifs[stock.id] !== undefined ? flashActifs[stock.id] : true;

  const handleCloturer = async () => {
    setCloturing(true);
    try {
      await closeDayAndSave(commandesOnline);
      setCloture(true);
    } finally {
      setCloturing(false);
    }
  };

  const kpiColor =
    unsoldRateToday < 5  ? 'green' :
    unsoldRateToday < 10 ? 'amber' : 'red';

  const invendusAvecStock = todayStocks.filter(s => s.stockFinal > 0);
  const paniersSuggeres   = genererPaniers(todayStocks);
  const flashCount        = invendusAvecStock.filter(isFlashActif).length;

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
        <span className="text-5xl mb-4">🌙</span>
        <p className="text-white/50 font-medium">Aucune production saisie aujourd'hui</p>
        <p className="text-white/25 text-sm mt-1">
          Saisissez votre production dans l'onglet <span className="text-[#C19A6B]">Matin</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div data-tour="soir-header" className="pt-2">
        <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium">
          Clôture du soir
        </p>
        <h1
          className="text-white text-2xl font-bold mt-1 leading-tight"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          Bilan & Invendus
        </h1>
      </div>

      {/* ── KPIs ── */}
      <div className="flex gap-2.5">
        <KpiCard
          label="CA estimé"
          value={`${revenueToday.toFixed(0)} €`}
          color="green"
        />
        <KpiCard
          label="Invendus"
          value={`${unsoldRateToday.toFixed(1)} %`}
          sub={`${unsoldToday} pièces`}
          color={kpiColor as 'green' | 'amber' | 'red'}
        />
        <KpiCard
          label="Pièces"
          value={`${totalProducedToday}`}
          sub={`−${unsoldToday} non vendues`}
        />
      </div>

      {/* ── Saisie stock final ── */}
      <div
        className="rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
          borderColor: 'rgba(255,255,255,0.06)',
        }}
      >
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/5">
          <p className="flex-1 text-white/30 text-[10px] uppercase tracking-widest">Produit</p>
          <p className="w-14 text-center text-white/30 text-[10px]">Produit</p>
          <p className="w-16 text-center text-[#C19A6B]/60 text-[10px] font-semibold">Invendu</p>
          <p className="w-14 text-center text-white/30 text-[10px]">Vendu</p>
        </div>
        {todayStocks.map(stock => (
          <div key={stock.id} className="flex items-center gap-3 px-4 py-2.5 border-b border-white/4 last:border-0">
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <span className="text-base">{stock.emoji}</span>
              <span className="text-white text-sm truncate">{stock.name}</span>
            </div>
            <div className="w-14 text-center text-white/40 text-sm font-mono tabular-nums">
              {stock.production}
            </div>
            <div className="w-16 flex justify-center">
              <StockFinalCell
                value={stock.stockFinal}
                max={stock.production}
                onChange={val => updateStockFinal(stock.id, val)}
              />
            </div>
            <div className="w-14 text-center text-green-400/70 text-sm font-mono tabular-nums">
              {stock.production - stock.stockFinal}
            </div>
          </div>
        ))}
      </div>

      {/* ── Section anti-gaspi flash ── */}
      <div
        data-tour="soir-flash"
        className="rounded-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(193,154,107,0.06) 0%, rgba(193,154,107,0.02) 100%)',
          borderColor: 'rgba(193,154,107,0.18)',
        }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-[#C19A6B]" />
            <span className="text-[#C19A6B] text-sm font-semibold">Paniers anti-gaspi</span>
            {flashCount > 0 && (
              <span className="text-[10px] bg-[#C19A6B]/20 text-[#C19A6B]/90 px-2 py-0.5 rounded-full font-medium">
                {flashCount} actif{flashCount > 1 ? 's' : ''}
              </span>
            )}
          </div>
          <p className="text-white/30 text-[10px]">−40% du prix</p>
        </div>

        <div className="px-4 py-1">
          {invendusAvecStock.length === 0 ? (
            <div className="py-4 text-center">
              <p className="text-white/25 text-sm">🎉 Aucun invendu — saisissez le stock final ci-dessus</p>
            </div>
          ) : (
            invendusAvecStock.map(stock => {
              const prixFlash = stock.prixVente * 0.6;
              const actif = isFlashActif(stock);
              return (
                <div key={stock.id} className="flex items-center gap-3 py-2.5 border-b border-white/4 last:border-0">
                  <span className="text-base flex-shrink-0">{stock.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm leading-none">{stock.name}</p>
                    <p className="text-white/30 text-[10px] mt-0.5">
                      {stock.stockFinal} restant{stock.stockFinal > 1 ? 's' : ''} ·{' '}
                      <span className="line-through">{stock.prixVente.toFixed(2)} €</span>{' '}
                      <span className="text-[#C19A6B]/80">{prixFlash.toFixed(2)} €</span>
                    </p>
                  </div>
                  <button
                    onClick={() => toggleFlash(stock.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all border ${
                      actif
                        ? 'bg-[#C19A6B]/20 border-[#C19A6B]/30 text-[#C19A6B]'
                        : 'bg-white/5 border-white/8 text-white/40 hover:text-white/70'
                    }`}
                  >
                    {actif
                      ? <><Zap size={11} /> Actif</>
                      : <><ZapOff size={11} /> Off</>
                    }
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Paniers suggérés ── */}
      {paniersSuggeres.length > 0 && (
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="w-full flex items-center justify-between py-2"
          >
            <p className="text-white/50 text-xs font-semibold uppercase tracking-widest">
              Paniers suggérés ({paniersSuggeres.length})
            </p>
            <ChevronDown
              size={14}
              className={`text-white/30 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-2 overflow-hidden"
              >
                {paniersSuggeres.map(panier => (
                  <div
                    key={panier.nom}
                    className="rounded-2xl border px-4 py-3"
                    style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xl">{panier.emoji}</span>
                        <p className="text-white text-sm font-semibold">{panier.nom}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[#C19A6B] text-sm font-bold">{panier.prixFlash.toFixed(2)} €</p>
                        <p className="text-white/25 text-[10px] line-through">{panier.prix.toFixed(2)} €</p>
                      </div>
                    </div>
                    <p className="text-white/35 text-[11px] mt-1.5">
                      {panier.items.join(' · ')}
                    </p>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Info commandes online ── */}
      {commandesOnline > 0 && (
        <div className="flex items-center gap-2 bg-blue-500/8 border border-blue-500/15 rounded-xl px-4 py-3">
          <Info size={13} className="text-blue-400 flex-shrink-0" />
          <p className="text-white/50 text-xs">
            <span className="text-blue-300 font-semibold">{commandesOnline}</span> commande{commandesOnline > 1 ? 's' : ''} click & collect incluse{commandesOnline > 1 ? 's' : ''} dans le CA
          </p>
        </div>
      )}

      {/* ── Bouton clôture ── */}
      {!cloture ? (
        <button
          onClick={handleCloturer}
          disabled={cloturing || syncStatus === 'saving'}
          className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all font-semibold text-sm disabled:opacity-50"
          style={{
            background: 'linear-gradient(135deg, rgba(193,154,107,0.25) 0%, rgba(193,154,107,0.12) 100%)',
            border: '1px solid rgba(193,154,107,0.3)',
            color: '#C19A6B',
          }}
        >
          {cloturing ? (
            <><Loader2 size={15} className="animate-spin" /> Clôture en cours...</>
          ) : (
            <><Package size={15} /> Clôturer la journée</>
          )}
        </button>
      ) : (
        <div
          className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 border"
          style={{ background: 'rgba(74,222,128,0.1)', borderColor: 'rgba(74,222,128,0.25)' }}
        >
          <Check size={15} className="text-green-400" />
          <span className="text-green-400 text-sm font-semibold">Journée clôturée ✓</span>
        </div>
      )}

      <p className="text-center text-white/20 text-[10px] pb-2">
        La clôture sauvegarde vos données pour les statistiques et suggestions ML.
      </p>
    </div>
  );
}