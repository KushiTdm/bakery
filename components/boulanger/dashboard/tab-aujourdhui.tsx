'use client';
// components/boulanger/dashboard/tab-aujourdhui.tsx
// ───────────────────────────────────────────────────────────────
// Onglet "Aujourd'hui" — KPIs live, spotlight produits, défis actifs,
// graphique barres, tableau produits collapsible.

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Award, AlertTriangle,
  BarChart2, Info, Package, ArrowUpRight,
  ChevronDown, Flame, Target, Eye,
} from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';
import type { Defi } from '@/lib/types';
import { DIFFICULTY_LABELS, DIFFICULTY_COLORS } from '@/lib/gamification';

// ── Sparkline SVG (from original dashboard) ──────────────────

function Sparkline({
  data, color, height = 28,
}: { data: number[]; color: string; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data);
  const range = max - min || 1;
  const w = 80;
  const h = height;
  const pad = 2;

  const points = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x},${y}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `M ${points[0]} L ${points.join(' L ')} L ${w - pad},${h} L ${pad},${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="overflow-visible">
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color.replace('#', '')})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5"
        strokeLinecap="round" strokeLinejoin="round" />
      <circle
        cx={parseFloat(points[points.length - 1].split(',')[0])}
        cy={parseFloat(points[points.length - 1].split(',')[1])}
        r="2.5" fill={color} />
    </svg>
  );
}

// ── KPI Card ─────────────────────────────────────────────────

function KpiCard({
  label, value, sub, evolution, sparkData, color, unit = '',
}: {
  label:      string;
  value:      string;
  sub:        string;
  evolution?: number | null;
  sparkData?: number[];
  color:      string;
  unit?:      string;
}) {
  const isPositive = evolution !== null && evolution !== undefined && evolution >= 0;
  const showEvo    = evolution !== null && evolution !== undefined;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl p-4 border relative overflow-hidden"
      style={{
        background: 'rgba(255,255,255,0.035)',
        borderColor: 'rgba(255,255,255,0.07)',
      }}
    >
      <div
        className="absolute bottom-0 left-0 right-0 h-[2px] rounded-full"
        style={{ background: color }}
      />
      <p className="text-white/35 text-[10px] uppercase tracking-widest font-medium mb-2">
        {label}
      </p>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-white font-bold text-2xl font-mono leading-none">
            {value}<span className="text-sm ml-0.5 font-normal text-white/40">{unit}</span>
          </p>
          <p className="text-white/30 text-[10px] mt-1.5">{sub}</p>
        </div>
        {sparkData && sparkData.length > 1 && (
          <Sparkline data={sparkData} color={color} />
        )}
      </div>
      {showEvo && (
        <div className="flex items-center gap-1 mt-2.5">
          {isPositive
            ? <TrendingUp size={10} style={{ color }} />
            : <TrendingDown size={10} className="text-red-400" />}
          <span
            className="text-[10px] font-semibold"
            style={{ color: isPositive ? color : '#E55' }}
          >
            {isPositive ? '+' : ''}{evolution?.toFixed(1)}% vs période préc.
          </span>
        </div>
      )}
    </motion.div>
  );
}

// ── Bar Chart ────────────────────────────────────────────────

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function BarChart({
  history, metric,
}: {
  history: { date: string; chiffreAffaires: number; tauxInvendu: number }[];
  metric: 'ca' | 'invendu';
}) {
  const data = history.slice(-14);
  const values = data.map(d => metric === 'ca' ? d.chiffreAffaires : d.tauxInvendu);
  const max = Math.max(...values, 1);

  return (
    <div className="flex items-end gap-1.5" style={{ height: '100px' }}>
      {data.map((d, i) => {
        const v = values[i];
        const pct = Math.max((v / max) * 100, 2);
        const dayDate = new Date(d.date + 'T12:00:00');
        const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
        const isToday = i === data.length - 1;

        const barColor = metric === 'ca'
          ? isToday ? '#C19A6B' : isWeekend ? 'rgba(193,154,107,0.5)' : 'rgba(193,154,107,0.25)'
          : v > 8 ? 'rgba(226,85,85,0.7)'
          : v > 5 ? 'rgba(212,137,26,0.7)'
          : 'rgba(61,158,106,0.7)';

        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5">
            <p className="text-white/25 text-[8px] font-mono">
              {metric === 'ca' ? `${Math.round(v)}` : `${v.toFixed(0)}%`}
            </p>
            <div className="w-full flex items-end" style={{ height: '68px' }}>
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${pct}%` }}
                transition={{ duration: 0.5, delay: i * 0.02 }}
                className="w-full rounded-t-md"
                style={{
                  background: barColor,
                  boxShadow: isToday ? `0 0 10px ${barColor}66` : 'none',
                }}
              />
            </div>
            <p
              className="text-[8px] font-medium"
              style={{ color: isToday ? '#C19A6B' : 'rgba(255,255,255,0.2)' }}
            >
              {DAY_LABELS[dayDate.getDay()]}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// ── Product Table ────────────────────────────────────────────

function ProductTable({
  productWaste, collapsed,
}: {
  productWaste: { id: string; name: string; emoji: string; rate: number }[];
  collapsed: boolean;
}) {
  const maxRate = Math.max(...productWaste.map(p => p.rate), 1);
  const items = collapsed ? productWaste.slice(0, 3) : productWaste;

  return (
    <div className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <p className="text-white/35 text-[9px] uppercase tracking-widest font-semibold">Produit</p>
        <p className="text-white/35 text-[9px] uppercase tracking-widest font-semibold">Taux invendu</p>
      </div>
      <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        {items.map((p, i) => {
          const barColor = p.rate > 8 ? '#E25555' : p.rate > 5 ? '#D4891A' : '#3D9E6A';
          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="px-4 py-3"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm flex-shrink-0">{p.emoji}</span>
                  <span className="text-white/65 text-xs truncate">{p.name}</span>
                </div>
                <span className="font-bold text-xs font-mono ml-3 flex-shrink-0"
                  style={{ color: barColor }}>
                  {p.rate.toFixed(1)}%
                </span>
              </div>
              <div className="h-1 rounded-full overflow-hidden"
                style={{ background: 'rgba(255,255,255,0.06)' }}>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${(p.rate / maxRate) * 100}%` }}
                  transition={{ duration: 0.6, delay: i * 0.04 + 0.2 }}
                  className="h-full rounded-full"
                  style={{ background: barColor }}
                />
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

// ── Active Challenge Mini Card ───────────────────────────────

function ChallengePreview({ defi, onClick }: { defi: Defi; onClick: () => void }) {
  const color = DIFFICULTY_COLORS[defi.difficulte];
  const progress = defi.valeur_actuelle !== null && defi.valeur_cible > 0
    ? Math.min((defi.valeur_actuelle / defi.valeur_cible) * 100, 100)
    : 0;

  return (
    <motion.button
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full rounded-xl p-3 border text-left"
      style={{
        background: `${color}08`,
        borderColor: `${color}20`,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="text-lg">{defi.emoji}</span>
        <div className="flex-1 min-w-0">
          <p className="text-white/80 text-xs font-semibold truncate">{defi.titre}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <div className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all"
                style={{ width: `${progress}%`, background: color }} />
            </div>
            <span className="text-[9px] font-bold" style={{ color }}>
              +{defi.xp_reward}XP
            </span>
          </div>
        </div>
        <ArrowUpRight size={12} style={{ color }} />
      </div>
    </motion.button>
  );
}

// ── Main Component ───────────────────────────────────────────

export default function TabAujourdhui({
  defisToday,
  onNavigateDefis,
}: {
  defisToday: Defi[];
  onNavigateDefis: () => void;
}) {
  const {
    history, todayStocks,
    revenueToday, totalProducedToday, unsoldToday, unsoldRateToday,
  } = useBoulanger();

  const [selectedMetric, setSelectedMetric] = useState<'ca' | 'invendu'>('ca');
  const [periodDays, setPeriodDays] = useState<7 | 14 | 30>(14);
  const [productTableExpanded, setProductTableExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const hasHistory = history.length >= 1;
  const hasEnoughTrend = history.length >= 3;
  const isToday = totalProducedToday > 0;

  const filteredHistory = useMemo(
    () => history.slice(-periodDays),
    [history, periodDays]
  );

  // KPIs
  const avgCA = hasHistory
    ? filteredHistory.reduce((s, d) => s + d.chiffreAffaires, 0) / filteredHistory.length
    : null;
  const avgInvendu = hasHistory
    ? filteredHistory.reduce((s, d) => s + d.tauxInvendu, 0) / filteredHistory.length
    : null;
  const totalCA = hasHistory
    ? filteredHistory.reduce((s, d) => s + d.chiffreAffaires, 0)
    : 0;

  // Evolution CA
  const caEvolution = useMemo(() => {
    if (!hasEnoughTrend || filteredHistory.length < 4) return null;
    const half = Math.floor(filteredHistory.length / 2);
    const first = filteredHistory.slice(0, half).reduce((s, d) => s + d.chiffreAffaires, 0) / half;
    const second = filteredHistory.slice(half).reduce((s, d) => s + d.chiffreAffaires, 0) / (filteredHistory.length - half);
    if (!first) return null;
    return ((second - first) / first) * 100;
  }, [filteredHistory, hasEnoughTrend]);

  const caSparkData = filteredHistory.map(d => d.chiffreAffaires);
  const invenduSparkData = filteredHistory.map(d => d.tauxInvendu);

  // Product analysis
  const productWasteMap: Record<string, {
    name: string; emoji: string; totalUnsold: number; totalProduced: number;
  }> = {};

  filteredHistory.forEach(day => {
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

  const worstProduct = productWaste[0] ?? null;
  const bestProduct = productWaste[productWaste.length - 1] ?? null;

  const kpiColor = (rate: number | null) =>
    rate === null ? 'text-white/30' :
    rate < 5 ? '#3D9E6A' :
    rate < 10 ? '#D4891A' : '#E25555';

  const activeDefis = defisToday.filter(d => d.statut === 'actif');

  return (
    <div className="space-y-4">

      {/* ── Live Banner ── */}
      {isToday && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden border"
          style={{ background: 'rgba(193,154,107,0.05)', borderColor: 'rgba(193,154,107,0.18)' }}
        >
          <div className="flex items-center gap-2 px-4 py-2.5 border-b"
            style={{ borderColor: 'rgba(193,154,107,0.1)' }}>
            <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
            <p className="text-[#C19A6B] text-xs font-semibold">Aujourd'hui — en direct</p>
          </div>
          <div className="grid grid-cols-3 gap-0">
            {[
              { label: 'CA estimé', value: `${Math.round(revenueToday)}€`, color: '#C19A6B' },
              { label: 'Pièces', value: String(totalProducedToday), color: 'rgba(255,255,255,0.6)' },
              { label: 'Invendus', value: `${unsoldRateToday.toFixed(1)}%`, color: kpiColor(unsoldRateToday) },
            ].map((item) => (
              <div key={item.label}
                className="px-4 py-3 text-center border-r last:border-r-0"
                style={{ borderColor: 'rgba(193,154,107,0.1)' }}>
                <p className="font-bold text-base font-mono" style={{ color: item.color }}>
                  {item.value}
                </p>
                <p className="text-white/25 text-[9px] uppercase tracking-wider mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── No history ── */}
      {!hasHistory && (
        <div
          className="rounded-2xl px-4 py-5 flex items-start gap-3 border"
          style={{ background: 'rgba(193,154,107,0.06)', borderColor: 'rgba(193,154,107,0.18)' }}
        >
          <Info size={15} className="text-[#C19A6B] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[#C19A6B] text-sm font-semibold mb-1">Aucune donnée historique</p>
            <p className="text-white/40 text-xs leading-relaxed">
              Clôturez votre première journée dans l'onglet <strong className="text-white/60">Soir</strong> pour
              alimenter les statistiques.
            </p>
          </div>
        </div>
      )}

      {/* ── Period selector + KPI Cards ── */}
      {hasHistory && (
        <>
          <div className="flex items-center justify-end">
            <div
              className="flex gap-1 p-1 rounded-xl"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              {([7, 14, 30] as const).map(d => (
                <button
                  key={d}
                  onClick={() => setPeriodDays(d)}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{
                    background: periodDays === d ? '#C19A6B' : 'transparent',
                    color: periodDays === d ? '#1A0F0A' : 'rgba(255,255,255,0.35)',
                  }}
                >
                  {d}j
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <KpiCard
              label="CA moyen / jour"
              value={avgCA !== null ? `${Math.round(avgCA)}` : '—'}
              unit="€"
              sub={`Total : ${Math.round(totalCA)}€ / ${periodDays}j`}
              evolution={caEvolution}
              sparkData={caSparkData}
              color="#C19A6B"
            />
            <KpiCard
              label="Invendu moyen"
              value={avgInvendu !== null ? `${avgInvendu.toFixed(1)}` : '—'}
              unit="%"
              sub={
                avgInvendu === null ? '—' :
                avgInvendu < 3  ? 'Excellent' :
                avgInvendu < 6  ? 'Correct' :
                avgInvendu < 10 ? 'À surveiller' : 'Trop élevé'
              }
              sparkData={invenduSparkData}
              color={kpiColor(avgInvendu)}
            />
          </div>
        </>
      )}

      {/* ── Recommandation : l'insight à retenir ── */}
      {hasHistory && avgInvendu !== null && worstProduct && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="rounded-2xl p-4 border"
          style={{ background: 'rgba(193,154,107,0.07)', borderColor: 'rgba(193,154,107,0.2)' }}
        >
          <div className="flex items-center gap-2 mb-2.5">
            <Flame size={13} className="text-[#C19A6B]" />
            <p className="text-[#C19A6B] text-[10px] font-bold uppercase tracking-wider">
              À retenir aujourd'hui
            </p>
          </div>
          <p className="text-white/70 text-sm leading-relaxed">
            {avgInvendu > 8
              ? `Taux d'invendu élevé (${avgInvendu.toFixed(1)}%). Réduisez la production de "${worstProduct.name}" de ~15%.`
              : avgInvendu < 3
                ? `Excellent ! Taux optimal (${avgInvendu.toFixed(1)}%). Augmentez légèrement les best-sellers.`
                : `Taux correct (${avgInvendu.toFixed(1)}%). Surveillez "${worstProduct.name}" (${worstProduct.rate.toFixed(0)}%).`
            }
          </p>
        </motion.div>
      )}

      {/* ── Défis actifs ── */}
      {activeDefis.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-1.5">
            <Target size={13} className="text-[#C19A6B]" />
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#C19A6B]/70">
              Défis du jour
            </p>
          </div>
          <div className="space-y-2">
            {activeDefis.slice(0, 3).map(defi => (
              <ChallengePreview key={defi.id} defi={defi} onClick={onNavigateDefis} />
            ))}
          </div>
        </div>
      )}

      {/* ── Toggle "Voir le détail" ── */}
      {hasHistory && (
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setDetailsOpen(v => !v)}
          className="w-full flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border transition-colors"
          style={{
            background: detailsOpen ? 'rgba(193,154,107,0.08)' : 'rgba(255,255,255,0.025)',
            borderColor: detailsOpen ? 'rgba(193,154,107,0.25)' : 'rgba(255,255,255,0.07)',
          }}
        >
          <div className="flex items-center gap-2">
            <Eye size={14} className="text-[#C19A6B]" />
            <span className="text-xs font-semibold" style={{ color: detailsOpen ? '#C19A6B' : 'rgba(255,255,255,0.6)' }}>
              {detailsOpen ? 'Masquer le détail' : 'Voir le détail · produits, graphique'}
            </span>
          </div>
          <motion.div animate={{ rotate: detailsOpen ? 180 : 0 }}>
            <ChevronDown size={14} style={{ color: detailsOpen ? '#C19A6B' : 'rgba(255,255,255,0.3)' }} />
          </motion.div>
        </motion.button>
      )}

      {/* ── Détails collapsibles ── */}
      <AnimatePresence initial={false}>
        {detailsOpen && hasHistory && (
          <motion.div
            key="details"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="overflow-hidden"
          >
            <div className="space-y-4 pt-1">

              {/* Spotlight Best/Worst */}
              {productWaste.length >= 2 && (
                <div className="grid grid-cols-2 gap-3">
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="rounded-2xl p-4 border"
                    style={{ background: 'rgba(61,158,106,0.07)', borderColor: 'rgba(61,158,106,0.2)' }}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <Award size={12} className="text-green-400" />
                      <p className="text-green-400 text-[9px] font-bold uppercase tracking-wider">Meilleur</p>
                    </div>
                    <p className="text-2xl mb-0.5">{bestProduct!.emoji}</p>
                    <p className="text-white font-semibold text-sm leading-tight">{bestProduct!.name}</p>
                    <p className="text-green-400 text-xs font-mono font-bold mt-1">
                      {bestProduct!.rate.toFixed(1)}%
                    </p>
                  </motion.div>
                  <motion.div
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="rounded-2xl p-4 border"
                    style={{
                      background: worstProduct!.rate > 8 ? 'rgba(226,85,85,0.07)' : 'rgba(212,137,26,0.06)',
                      borderColor: worstProduct!.rate > 8 ? 'rgba(226,85,85,0.2)' : 'rgba(212,137,26,0.2)',
                    }}
                  >
                    <div className="flex items-center gap-1.5 mb-2">
                      <AlertTriangle size={12} style={{ color: worstProduct!.rate > 8 ? '#E25555' : '#D4891A' }} />
                      <p className="text-[9px] font-bold uppercase tracking-wider"
                        style={{ color: worstProduct!.rate > 8 ? '#E25555' : '#D4891A' }}>
                        À réduire
                      </p>
                    </div>
                    <p className="text-2xl mb-0.5">{worstProduct!.emoji}</p>
                    <p className="text-white font-semibold text-sm leading-tight">{worstProduct!.name}</p>
                    <p className="text-xs font-mono font-bold mt-1"
                      style={{ color: worstProduct!.rate > 8 ? '#E25555' : '#D4891A' }}>
                      {worstProduct!.rate.toFixed(1)}%
                    </p>
                  </motion.div>
                </div>
              )}

              {/* Bar Chart */}
              <div
                className="rounded-2xl overflow-hidden border"
                style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.07)' }}
              >
                <div className="flex items-center justify-between px-4 py-3 border-b"
                  style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                  <p className="text-sm font-semibold"
                    style={{ fontFamily: 'Playfair Display, serif', color: '#C19A6B' }}>
                    {periodDays} derniers jours
                  </p>
                  <div className="flex gap-1 p-0.5 rounded-lg"
                    style={{ background: 'rgba(255,255,255,0.05)' }}>
                    {[
                      { id: 'ca' as const, label: 'CA' },
                      { id: 'invendu' as const, label: 'Invendu' },
                    ].map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setSelectedMetric(opt.id)}
                        className="px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all"
                        style={{
                          background: selectedMetric === opt.id
                            ? (opt.id === 'ca' ? 'rgba(193,154,107,0.2)' : 'rgba(226,85,85,0.15)')
                            : 'transparent',
                          color: selectedMetric === opt.id
                            ? (opt.id === 'ca' ? '#C19A6B' : '#E25555')
                            : 'rgba(255,255,255,0.3)',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-4 py-4">
                  <BarChart history={filteredHistory} metric={selectedMetric} />
                </div>
                <div className="px-4 pb-3 flex items-center gap-4 text-[9px] text-white/25">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-sm" style={{ background: '#C19A6B' }} />
                    Aujourd'hui
                  </div>
                  {selectedMetric === 'invendu' && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm" style={{ background: '#3D9E6A' }} />
                        {'< 5%'}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-sm" style={{ background: '#E25555' }} />
                        {'> 8%'}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Product Table */}
              {productWaste.length > 0 && (
                <div
                  className="rounded-2xl overflow-hidden border"
                  style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.07)' }}
                >
                  <button
                    onClick={() => setProductTableExpanded(!productTableExpanded)}
                    className="w-full flex items-center justify-between px-4 py-3 border-b"
                    style={{ borderColor: 'rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex items-center gap-2">
                      <BarChart2 size={13} className="text-[#C19A6B]" />
                      <p className="text-xs font-semibold"
                        style={{ fontFamily: 'Playfair Display, serif', color: 'rgba(255,255,255,0.65)' }}>
                        Performance produits · {filteredHistory.length}j
                      </p>
                    </div>
                    <motion.div animate={{ rotate: productTableExpanded ? 180 : 0 }}>
                      <ChevronDown size={14} className="text-white/25" />
                    </motion.div>
                  </button>
                  <ProductTable productWaste={productWaste} collapsed={!productTableExpanded} />
                  {!productTableExpanded && productWaste.length > 3 && (
                    <div className="px-4 py-2 text-center">
                      <p className="text-[10px] text-white/20">
                        + {productWaste.length - 3} produits · appuyez pour voir tout
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
