'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, AlertTriangle, Award, BarChart2, Info } from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const CAT_LABELS: Record<string, string> = {
  boulangerie: '🥖 Boulangerie',
  viennoiserie: '🥐 Viennoiserie',
  patisserie: '🎂 Pâtisserie',
};

// ─── État vide ────────────────────────────────────────────────────────────────

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
      <div className="w-14 h-14 bg-white/5 border border-white/8 rounded-2xl flex items-center justify-center">
        <Info size={24} className="text-white/25" />
      </div>
      <p className="text-white/35 text-sm max-w-xs leading-relaxed">{message}</p>
    </div>
  );
}

export default function Dashboard() {
  const { history, todayStocks } = useBoulanger();
  const [selectedMetric, setSelectedMetric] = useState<'ca' | 'invendu'>('ca');

  const hasHistory = history.length >= 1;
  const hasEnoughForTrend = history.length >= 3;

  // ─── Stats depuis l'historique réel ─────────────────────────────────────
  const avgCA = hasHistory
    ? history.reduce((s, d) => s + d.chiffreAffaires, 0) / history.length
    : null;

  const avgInvendu = hasHistory
    ? history.reduce((s, d) => s + d.tauxInvendu, 0) / history.length
    : null;

  const maxCA = hasHistory ? Math.max(...history.map(d => d.chiffreAffaires)) : 1;
  const maxInvendu = hasHistory ? Math.max(...history.map(d => d.tauxInvendu), 1) : 1;

  // Évolution CA (seulement si assez de données)
  const caEvolution = hasEnoughForTrend
    ? +((history[history.length - 1].chiffreAffaires / history[0].chiffreAffaires - 1) * 100).toFixed(1)
    : null;

  // Taux invendu par produit depuis l'historique réel
  const productWasteMap: Record<string, {
    name: string; emoji: string; totalUnsold: number; totalProduced: number;
  }> = {};

  history.forEach(day => {
    day.stocks.forEach(p => {
      if (!productWasteMap[p.id]) {
        productWasteMap[p.id] = { name: p.name, emoji: p.emoji, totalUnsold: 0, totalProduced: 0 };
      }
      productWasteMap[p.id].totalUnsold += p.stockFinal;
      productWasteMap[p.id].totalProduced += p.production;
    });
  });

  const productWaste = Object.entries(productWasteMap)
    .map(([id, v]) => ({
      id, ...v,
      rate: v.totalProduced > 0 ? (v.totalUnsold / v.totalProduced) * 100 : 0,
    }))
    .sort((a, b) => b.rate - a.rate);

  const worstProduct  = productWaste.length > 0 ? productWaste[0] : null;
  const bestProduct   = productWaste.length > 0 ? productWaste[productWaste.length - 1] : null;

  return (
    <div className="space-y-6 pb-6">

      {/* ── Avertissement si pas assez de données ── */}
      {!hasHistory && (
        <div className="bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-2xl px-4 py-4 flex items-start gap-3">
          <Info size={16} className="text-[#C19A6B] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[#C19A6B] text-sm font-semibold mb-1">Pas encore de données historiques</p>
            <p className="text-white/45 text-xs leading-relaxed">
              Les statistiques s'alimentent automatiquement après chaque clôture de journée (onglet Soir).
              Revenez ici après quelques jours d'utilisation.
            </p>
          </div>
        </div>
      )}

      {/* ── KPIs ── */}
      <div>
        <p className="text-[#C19A6B] text-xs font-medium tracking-widest uppercase mb-3">
          {hasHistory ? `${history.length} jour${history.length > 1 ? 's' : ''} enregistré${history.length > 1 ? 's' : ''}` : 'Statistiques'}
        </p>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white/6 border border-white/8 rounded-2xl p-4">
            <p className="text-white/35 text-xs mb-1">CA moyen / jour</p>
            {avgCA !== null ? (
              <>
                <p className="text-white font-bold text-2xl font-mono">{avgCA.toFixed(0)}€</p>
                {caEvolution !== null && (
                  <div className="flex items-center gap-1 mt-1">
                    {caEvolution >= 0
                      ? <TrendingUp size={11} className="text-green-400" />
                      : <TrendingDown size={11} className="text-red-400" />
                    }
                    <span className={`text-xs ${caEvolution >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {caEvolution >= 0 ? '+' : ''}{caEvolution}% sur la période
                    </span>
                  </div>
                )}
              </>
            ) : (
              <p className="text-white/20 text-sm mt-1">—</p>
            )}
          </div>

          <div className="bg-white/6 border border-white/8 rounded-2xl p-4">
            <p className="text-white/35 text-xs mb-1">Taux invendu moy.</p>
            {avgInvendu !== null ? (
              <>
                <p className={`font-bold text-2xl font-mono ${
                  avgInvendu > 8 ? 'text-red-400' : avgInvendu > 5 ? 'text-amber-400' : 'text-green-400'
                }`}>
                  {avgInvendu.toFixed(1)}%
                </p>
                <p className="text-white/25 text-xs mt-1">
                  {avgInvendu < 3 ? '🎯 Optimal' : avgInvendu < 6 ? '✅ Correct' : avgInvendu < 10 ? '⚠️ À surveiller' : '🚨 Trop élevé'}
                </p>
              </>
            ) : (
              <p className="text-white/20 text-sm mt-1">—</p>
            )}
          </div>
        </div>
      </div>

      {/* ── Graphique ── */}
      <div className="bg-white/5 border border-white/8 rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <p className="text-white/70 text-sm font-semibold">Historique</p>
          <div className="flex gap-1.5">
            <button
              onClick={() => setSelectedMetric('ca')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                selectedMetric === 'ca' ? 'bg-[#C19A6B] text-[#1A0F0A]' : 'text-white/40 hover:text-white/60'
              }`}
            >
              CA
            </button>
            <button
              onClick={() => setSelectedMetric('invendu')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                selectedMetric === 'invendu' ? 'bg-red-400 text-white' : 'text-white/40 hover:text-white/60'
              }`}
            >
              Invendus
            </button>
          </div>
        </div>

        {!hasHistory ? (
          <EmptyState message="Le graphique apparaîtra après la première clôture de journée." />
        ) : (
          <div className="flex items-end gap-2 h-36">
            {history.map((day, i) => {
              const val = selectedMetric === 'ca' ? day.chiffreAffaires : day.tauxInvendu;
              const max = selectedMetric === 'ca' ? maxCA : maxInvendu;
              const h = Math.max(Math.round((val / max) * 100), 4);
              const dayDate = new Date(day.date);
              const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;

              return (
                <div key={day.date} className="flex-1 flex flex-col items-center gap-1.5">
                  <p className="text-white/35 text-[10px] font-mono whitespace-nowrap">
                    {selectedMetric === 'ca' ? `${Math.round(val)}€` : `${val.toFixed(0)}%`}
                  </p>
                  <div className="w-full flex items-end justify-center" style={{ height: '80px' }}>
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: `${h}%` }}
                      transition={{ duration: 0.5, delay: i * 0.07 }}
                      className={`w-full rounded-t-lg ${
                        selectedMetric === 'ca'
                          ? isWeekend ? 'bg-[#C19A6B]' : 'bg-[#C19A6B]/50'
                          : val > 8 ? 'bg-red-400/70' : val > 5 ? 'bg-amber-400/70' : 'bg-green-400/70'
                      }`}
                      style={{ maxHeight: '100%' }}
                    />
                  </div>
                  <p className="text-white/25 text-[10px]">
                    {DAY_LABELS[dayDate.getDay()]}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Spotlight produits ── */}
      {hasHistory && productWaste.length > 0 ? (
        <div>
          <p className="text-white/40 text-xs uppercase tracking-wider mb-3">Performance par produit</p>

          {/* Meilleur / pire */}
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Award size={13} className="text-green-400" />
                <p className="text-green-400 text-xs font-semibold uppercase tracking-wider">Meilleur</p>
              </div>
              <p className="text-xl mb-0.5">{bestProduct!.emoji}</p>
              <p className="text-white font-semibold text-sm">{bestProduct!.name}</p>
              <p className="text-green-400 text-xs font-mono">{bestProduct!.rate.toFixed(1)}% invendu</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-4">
              <div className="flex items-center gap-1.5 mb-2">
                <AlertTriangle size={13} className="text-red-400" />
                <p className="text-red-400 text-xs font-semibold uppercase tracking-wider">À réduire</p>
              </div>
              <p className="text-xl mb-0.5">{worstProduct!.emoji}</p>
              <p className="text-white font-semibold text-sm">{worstProduct!.name}</p>
              <p className="text-red-400 text-xs font-mono">{worstProduct!.rate.toFixed(1)}% invendu</p>
            </div>
          </div>

          {/* Tableau complet */}
          <div className="bg-white/5 border border-white/8 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/8 flex items-center gap-2">
              <BarChart2 size={13} className="text-[#C19A6B]" />
              <p className="text-white/50 text-xs font-medium uppercase tracking-wider">
                Taux invendu · {history.length} jour{history.length > 1 ? 's' : ''}
              </p>
            </div>
            <div className="divide-y divide-white/5">
              {productWaste.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="px-4 py-3 flex items-center gap-3"
                >
                  <span className="text-base w-6">{p.emoji}</span>
                  <p className="text-white/60 text-xs flex-1 truncate">{p.name}</p>
                  <div className="w-20 h-1.5 bg-white/8 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${
                        p.rate > 8 ? 'bg-red-400' : p.rate > 5 ? 'bg-amber-400' : 'bg-green-400'
                      }`}
                      style={{ width: `${Math.min(p.rate * 5, 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-mono font-bold w-10 text-right ${
                    p.rate > 8 ? 'text-red-400' : p.rate > 5 ? 'text-amber-400' : 'text-green-400'
                  }`}>
                    {p.rate.toFixed(0)}%
                  </span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Recommandation */}
          {avgInvendu !== null && (
            <div className="mt-4 bg-[#C19A6B]/8 border border-[#C19A6B]/20 rounded-2xl p-4">
              <p className="text-[#C19A6B] text-xs font-semibold uppercase tracking-wider mb-2">
                💡 Recommandation
              </p>
              <p className="text-white/60 text-sm leading-relaxed">
                {avgInvendu > 8
                  ? `Taux d'invendu élevé (${avgInvendu.toFixed(1)}%). Réduisez la production de "${worstProduct!.name}" de ~15% et observez pendant 2 semaines.`
                  : avgInvendu < 3
                    ? `Excellent taux ! Vous pouvez augmenter légèrement la production pour ne pas rater des ventes.`
                    : `Taux correct. Surveillez "${worstProduct!.name}" (${worstProduct!.rate.toFixed(0)}% invendu) et envisagez -10% de production sur ce produit.`
                }
              </p>
            </div>
          )}
        </div>
      ) : hasHistory ? (
        <EmptyState message="Revenez après quelques clôtures pour voir les statistiques par produit." />
      ) : null}

    </div>
  );
}