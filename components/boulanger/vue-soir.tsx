'use client';
// components/boulanger/vue-soir.tsx
// Vue du soir — bilan journée, invendus, paniers flash anti-gaspi.

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, ZapOff, TrendingDown, Package, Euro, Loader2, Check, ChevronDown } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';

// ─── Types ────────────────────────────────────────────────────

interface ProduitSoir {
  id:       string;
  nom:      string;
  emoji:    string;
  prix:     number;
  produit:  number;
  invendu:  number;
  flashActif: boolean;
}

interface PanierSuggere {
  nom:      string;
  emoji:    string;
  items:    string[];
  prix:     number;
  prixFlash: number;
}

// ─── KPI Card ────────────────────────────────────────────────

function KpiCard({ label, value, sub, color = 'default' }: {
  label: string;
  value: string;
  sub?: string;
  color?: 'default' | 'green' | 'amber' | 'red';
}) {
  const colors = {
    default: { text: 'text-white',       bg: 'bg-white/5',           border: 'border-white/8' },
    green:   { text: 'text-green-400',   bg: 'bg-green-400/8',       border: 'border-green-400/15' },
    amber:   { text: 'text-amber-400',   bg: 'bg-amber-400/8',       border: 'border-amber-400/15' },
    red:     { text: 'text-red-400',     bg: 'bg-red-400/8',         border: 'border-red-400/15' },
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

// ─── Vue Soir principale ──────────────────────────────────────

export default function VueSoir() {
  const { } = useBoulanger(); // contexte disponible si besoin futur
  const [produits, setProduits]   = useState<ProduitSoir[]>([]);
  const [paniers, setPaniers]     = useState<PanierSuggere[]>([]);
  const [loading, setLoading]     = useState(true);
  const [cloture, setCloture]     = useState(false);
  const [cloturing, setCloturing] = useState(false);
  const [expanded, setExpanded]   = useState(false);

  useEffect(() => {
    // TODO: fetch depuis /api/boulanger/journee pour les vraies données
    setProduits([
      { id: '1', nom: 'Baguette tradition', emoji: '🥖', prix: 1.30, produit: 80, invendu: 6,  flashActif: false },
      { id: '2', nom: 'Croissant',          emoji: '🥐', prix: 1.20, produit: 40, invendu: 4,  flashActif: false },
      { id: '3', nom: 'Pain de campagne',   emoji: '🍞', prix: 4.50, produit: 12, invendu: 2,  flashActif: true  },
      { id: '4', nom: 'Pain au chocolat',   emoji: '🍫', prix: 1.30, produit: 35, invendu: 5,  flashActif: false },
      { id: '5', nom: 'Ficelle',            emoji: '🫓', prix: 0.90, produit: 20, invendu: 8,  flashActif: false },
    ]);

    // Paniers suggérés algorithme
    setPaniers([
      {
        nom:      'Petit-Déjeuner',
        emoji:    '🌅',
        items:    ['2 baguettes', '2 croissants', '1 pain au chocolat'],
        prix:     6.10,
        prixFlash: 3.66,
      },
      {
        nom:      'Panier Gourmand',
        emoji:    '🧺',
        items:    ['1 pain campagne', '3 viennoiseries', '2 baguettes'],
        prix:     10.90,
        prixFlash: 6.54,
      },
      {
        nom:      'Grand Panier',
        emoji:    '🎁',
        items:    ['2 pains campagne', '6 viennoiseries', '4 baguettes', '4 ficelles'],
        prix:     21.20,
        prixFlash: 12.72,
      },
    ]);

    setLoading(false);
  }, []);

  const toggleFlash = (id: string) => {
    setProduits(prev => prev.map(p =>
      p.id === id ? { ...p, flashActif: !p.flashActif } : p
    ));
  };

  const handleCloturer = async () => {
    setCloturing(true);
    await new Promise(r => setTimeout(r, 1200));
    setCloture(true);
    setCloturing(false);
    // cloturerJournee?.();
  };

  // KPIs
  const totalProduit   = produits.reduce((a, p) => a + p.produit, 0);
  const totalInvendu   = produits.reduce((a, p) => a + p.invendu, 0);
  const caEstime       = produits.reduce((a, p) => a + (p.produit - p.invendu) * p.prix, 0);
  const tauxInvendu    = totalProduit > 0 ? (totalInvendu / totalProduit) * 100 : 0;
  const flashCount     = produits.filter(p => p.flashActif && p.invendu > 0).length;

  const kpiColor = tauxInvendu < 5 ? 'green' : tauxInvendu < 10 ? 'amber' : 'red';

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
        <KpiCard label="CA estimé"    value={`${caEstime.toFixed(0)} €`}   color="green" />
        <KpiCard label="Invendus"     value={`${tauxInvendu.toFixed(1)} %`} sub={`${totalInvendu} pièces`} color={kpiColor} />
        <KpiCard label="Pièces"       value={`${totalProduit}`}             sub={`−${totalInvendu} non vendues`} />
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
        {/* Titre section */}
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

        {/* Produits avec toggle flash */}
        <div className="px-4 py-1">
          {produits.filter(p => p.invendu > 0).map(p => {
            const prixFlash = p.prix * 0.6;
            return (
              <div key={p.id} className="flex items-center gap-3 py-2.5 border-b border-white/4 last:border-0">
                <span className="text-base flex-shrink-0">{p.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm leading-none">{p.nom}</p>
                  <p className="text-white/30 text-[10px] mt-0.5">
                    {p.invendu} restant{p.invendu > 1 ? 's' : ''} ·{' '}
                    <span className="line-through">{p.prix.toFixed(2)} €</span>{' '}
                    <span className="text-[#C19A6B]/80">{prixFlash.toFixed(2)} €</span>
                  </p>
                </div>
                <button
                  onClick={() => toggleFlash(p.id)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold transition-all border ${
                    p.flashActif
                      ? 'bg-[#C19A6B]/20 border-[#C19A6B]/30 text-[#C19A6B]'
                      : 'bg-white/5 border-white/8 text-white/40 hover:text-white/70'
                  }`}
                >
                  {p.flashActif
                    ? <><Zap size={11} /> Actif</>
                    : <><ZapOff size={11} /> Off</>
                  }
                </button>
              </div>
            );
          })}
          {produits.filter(p => p.invendu > 0).length === 0 && (
            <div className="py-4 text-center">
              <p className="text-white/25 text-sm">🎉 Aucun invendu aujourd'hui !</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Paniers suggérés ── */}
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between py-2"
        >
          <p className="text-white/50 text-xs font-semibold uppercase tracking-widest">
            Paniers suggérés ({paniers.length})
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
              {paniers.map(panier => (
                <div
                  key={panier.nom}
                  className="rounded-2xl border px-4 py-3"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    borderColor: 'rgba(255,255,255,0.06)',
                  }}
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

      {/* ── Bouton clôture ── */}
      {!cloture ? (
        <button
          onClick={handleCloturer}
          disabled={cloturing}
          className="w-full py-3.5 rounded-2xl flex items-center justify-center gap-2 transition-all font-semibold text-sm"
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