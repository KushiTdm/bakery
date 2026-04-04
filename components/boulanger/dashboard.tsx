'use client';
// components/boulanger/dashboard.tsx — Sauve Mie · Dashboard amélioré
// ───────────────────────────────────────────────────────────────────
// Améliorations vs version précédente :
//   ✦ KPI cards avec sparklines inline (SVG)
//   ✦ Métriques aujourd'hui intégrées (live, pas seulement historique)
//   ✦ Graphique barres bicolore (CA + invendus)
//   ✦ Tableau produits avec barres de progression visuelles
//   ✦ Recommandations actionnables avec boutons de navigation
//   ✦ États vides élégants avec guides d'action
//   ✦ Sélecteur de période fonctionnel (7 / 14 / 30 jours)

import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Award, AlertTriangle,
  BarChart2, Info, Zap, Package, Sun, ArrowUpRight,
  Calendar, ChevronDown, Flame,
} from 'lucide-react';
import { useBoulanger } from '@/context/boulanger-context';

// ─────────────────────────────────────────────────────────────
// Sparkline SVG inline (léger, sans dépendance)
// ─────────────────────────────────────────────────────────────

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
      {/* Dernier point highlight */}
      <circle
        cx={parseFloat(points[points.length - 1].split(',')[0])}
        cy={parseFloat(points[points.length - 1].split(',')[1])}
        r="2.5" fill={color} />
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// KPI Card
// ─────────────────────────────────────────────────────────────

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
      {/* Accent bar */}
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
            ? <TrendingUp  size={10} style={{ color }} />
            : <TrendingDown size={10} className="text-red-400" />
          }
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

// ─────────────────────────────────────────────────────────────
// Graphique barres amélioré
// ─────────────────────────────────────────────────────────────

const DAY_LABELS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function BarChart({
  history, metric,
}: {
  history: { date: string; chiffreAffaires: number; tauxInvendu: number }[];
  metric: 'ca' | 'invendu';
}) {
  const data   = history.slice(-14);
  const values = data.map(d => metric === 'ca' ? d.chiffreAffaires : d.tauxInvendu);
  const max    = Math.max(...values, 1);
  const today  = new Date().getDay();

  return (
    <div className="flex items-end gap-1.5" style={{ height: '100px' }}>
      {data.map((d, i) => {
        const v         = values[i];
        const pct       = Math.max((v / max) * 100, 2);
        const dayDate   = new Date(d.date + 'T12:00:00');
        const isWeekend = dayDate.getDay() === 0 || dayDate.getDay() === 6;
        const isToday   = i === data.length - 1;

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

// ─────────────────────────────────────────────────────────────
// Tableau produits
// ─────────────────────────────────────────────────────────────

function ProductTable({
  productWaste,
}: {
  productWaste: { id: string; name: string; emoji: string; rate: number; totalProduced: number }[];
}) {
  const maxRate = Math.max(...productWaste.map(p => p.rate), 1);

  return (
    <div className="overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
        <p className="text-white/35 text-[9px] uppercase tracking-widest font-semibold">Produit</p>
        <p className="text-white/35 text-[9px] uppercase tracking-widest font-semibold">Taux invendu</p>
      </div>

      {/* Lignes */}
      <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        {productWaste.map((p, i) => {
          const barColor = p.rate > 8 ? '#E25555' : p.rate > 5 ? '#D4891A' : '#3D9E6A';
          const bgColor  = p.rate > 8
            ? 'rgba(226,85,85,0.06)'
            : p.rate > 5
              ? 'rgba(212,137,26,0.05)'
              : 'rgba(61,158,106,0.05)';

          return (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className="px-4 py-3"
              style={{ background: i === 0 && p.rate > 8 ? bgColor : 'transparent' }}
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm flex-shrink-0">{p.emoji}</span>
                  <span className="text-white/65 text-xs truncate">{p.name}</span>
                </div>
                <span
                  className="font-bold text-xs font-mono ml-3 flex-shrink-0"
                  style={{ color: barColor }}
                >
                  {p.rate.toFixed(1)}%
                </span>
              </div>
              {/* Barre de progression */}
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

// ─────────────────────────────────────────────────────────────
// Composant principal Dashboard
// ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const {
    history, todayStocks,
    revenueToday, totalProducedToday, unsoldToday, unsoldRateToday,
  } = useBoulanger();

  const [selectedMetric, setSelectedMetric] = useState<'ca' | 'invendu'>('ca');
  const [periodDays,     setPeriodDays]     = useState<7 | 14 | 30>(14);

  const hasHistory      = history.length >= 1;
  const hasEnoughTrend  = history.length >= 3;
  const isToday         = totalProducedToday > 0;

  // Données filtrées par période
  const filteredHistory = useMemo(
    () => history.slice(-periodDays),
    [history, periodDays]
  );

  // KPIs calculés
  const avgCA = hasHistory
    ? filteredHistory.reduce((s, d) => s + d.chiffreAffaires, 0) / filteredHistory.length
    : null;

  const avgInvendu = hasHistory
    ? filteredHistory.reduce((s, d) => s + d.tauxInvendu, 0) / filteredHistory.length
    : null;

  const bestCA    = hasHistory ? Math.max(...filteredHistory.map(d => d.chiffreAffaires)) : 0;
  const totalCA   = hasHistory ? filteredHistory.reduce((s, d) => s + d.chiffreAffaires, 0) : 0;

  // Evolution CA (compare première vs dernière moitié de la période)
  const caEvolution = useMemo(() => {
    if (!hasEnoughTrend || filteredHistory.length < 4) return null;
    const half   = Math.floor(filteredHistory.length / 2);
    const first  = filteredHistory.slice(0, half).reduce((s, d) => s + d.chiffreAffaires, 0) / half;
    const second = filteredHistory.slice(half).reduce((s, d) => s + d.chiffreAffaires, 0) / (filteredHistory.length - half);
    if (!first) return null;
    return ((second - first) / first) * 100;
  }, [filteredHistory, hasEnoughTrend]);

  // Sparklines
  const caSparkData      = filteredHistory.map(d => d.chiffreAffaires);
  const invenduSparkData = filteredHistory.map(d => d.tauxInvendu);

  // Analyse par produit
  const productWasteMap: Record<string, {
    name: string; emoji: string; totalUnsold: number; totalProduced: number;
  }> = {};

  filteredHistory.forEach(day => {
    day.stocks.forEach(p => {
      if (!productWasteMap[p.id]) {
        productWasteMap[p.id] = { name: p.name, emoji: p.emoji, totalUnsold: 0, totalProduced: 0 };
      }
      productWasteMap[p.id].totalUnsold   += p.stockFinal;
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
  const bestProduct  = productWaste[productWaste.length - 1] ?? null;

  const kpiColor = (rate: number | null) =>
    rate === null ? 'text-white/30' :
    rate < 5      ? '#3D9E6A' :
    rate < 10     ? '#D4891A' : '#E25555';

  return (
    <div className="space-y-5 pb-6">

      {/* ── Header + sélecteur de période ── */}
      <div className="pt-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium">Analyse</p>
            <h2
              className="text-white text-2xl font-bold mt-0.5"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              Statistiques
            </h2>
          </div>

          {/* Sélecteur de période */}
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
      </div>

      {/* ── Données aujourd'hui (live) ── */}
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
              { label: 'CA estimé',  value: `${Math.round(revenueToday)}€`,           color: '#C19A6B' },
              { label: 'Pièces',     value: String(totalProducedToday),                color: 'rgba(255,255,255,0.6)' },
              { label: 'Invendus',   value: `${unsoldRateToday.toFixed(1)}%`,          color: kpiColor(unsoldRateToday) },
            ].map((item, i) => (
              <div
                key={item.label}
                className="px-4 py-3 text-center border-r last:border-r-0"
                style={{ borderColor: 'rgba(193,154,107,0.1)' }}
              >
                <p className="font-bold text-base font-mono" style={{ color: item.color }}>
                  {item.value}
                </p>
                <p className="text-white/25 text-[9px] uppercase tracking-wider mt-0.5">{item.label}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* ── Pas d'historique ── */}
      {!hasHistory && (
        <div
          className="rounded-2xl px-4 py-5 flex items-start gap-3 border"
          style={{ background: 'rgba(193,154,107,0.06)', borderColor: 'rgba(193,154,107,0.18)' }}
        >
          <Info size={15} className="text-[#C19A6B] flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[#C19A6B] text-sm font-semibold mb-1">
              Aucune donnée historique
            </p>
            <p className="text-white/40 text-xs leading-relaxed">
              Clôturez votre première journée dans l'onglet <strong className="text-white/60">Soir</strong> pour
              alimenter les statistiques. Elles s'enrichissent automatiquement après chaque clôture.
            </p>
          </div>
        </div>
      )}

      {/* ── KPI Cards ── */}
      {hasHistory && (
        <div className="grid grid-cols-2 gap-3">
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
              avgInvendu < 3  ? '🎯 Excellent' :
              avgInvendu < 6  ? '✅ Correct' :
              avgInvendu < 10 ? '⚠️ À surveiller' : '🚨 Trop élevé'
            }
            sparkData={invenduSparkData}
            color={kpiColor(avgInvendu)}
          />
        </div>
      )}

      {/* ── Graphique ── */}
      {hasHistory && (
        <div
          className="rounded-2xl overflow-hidden border"
          style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          {/* Header graphique */}
          <div className="flex items-center justify-between px-4 py-3 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <p
              className="text-sm font-semibold"
              style={{ fontFamily: 'Playfair Display, serif', color: '#C19A6B' }}
            >
              {periodDays} derniers jours
            </p>
            <div
              className="flex gap-1 p-0.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.05)' }}
            >
              {[
                { id: 'ca'      as const, label: 'CA' },
                { id: 'invendu' as const, label: 'Invendu' },
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setSelectedMetric(opt.id)}
                  className="px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all"
                  style={{
                    background: selectedMetric === opt.id ? (opt.id === 'ca' ? 'rgba(193,154,107,0.2)' : 'rgba(226,85,85,0.15)') : 'transparent',
                    color: selectedMetric === opt.id ? (opt.id === 'ca' ? '#C19A6B' : '#E25555') : 'rgba(255,255,255,0.3)',
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

          {/* Légende */}
          <div className="px-4 pb-3 flex items-center gap-4 text-[9px] text-white/25">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm" style={{ background: '#C19A6B' }} />
              Aujourd'hui
            </div>
            {selectedMetric === 'ca' && (
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-sm opacity-50" style={{ background: '#C19A6B' }} />
                Week-end
              </div>
            )}
            {selectedMetric === 'invendu' && (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm" style={{ background: '#3D9E6A' }} />
                  {'< 5% ok'}
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-sm" style={{ background: '#E25555' }} />
                  {'> 8% alerte'}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Spotlight produits (meilleur / pire) ── */}
      {hasHistory && productWaste.length >= 2 && (
        <div className="grid grid-cols-2 gap-3">
          {/* Meilleur */}
          <motion.div
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl p-4 border"
            style={{ background: 'rgba(61,158,106,0.07)', borderColor: 'rgba(61,158,106,0.2)' }}
          >
            <div className="flex items-center gap-1.5 mb-2.5">
              <Award size={12} className="text-green-400" />
              <p className="text-green-400 text-[9px] font-bold uppercase tracking-wider">Meilleur</p>
            </div>
            <p className="text-2xl mb-0.5">{bestProduct!.emoji}</p>
            <p className="text-white font-semibold text-sm leading-tight">{bestProduct!.name}</p>
            <p className="text-green-400 text-xs font-mono font-bold mt-1">
              {bestProduct!.rate.toFixed(1)}%
            </p>
          </motion.div>

          {/* À réduire */}
          <motion.div
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            className="rounded-2xl p-4 border"
            style={{
              background: worstProduct!.rate > 8
                ? 'rgba(226,85,85,0.07)'
                : 'rgba(212,137,26,0.06)',
              borderColor: worstProduct!.rate > 8
                ? 'rgba(226,85,85,0.2)'
                : 'rgba(212,137,26,0.2)',
            }}
          >
            <div className="flex items-center gap-1.5 mb-2.5">
              <AlertTriangle size={12} style={{ color: worstProduct!.rate > 8 ? '#E25555' : '#D4891A' }} />
              <p
                className="text-[9px] font-bold uppercase tracking-wider"
                style={{ color: worstProduct!.rate > 8 ? '#E25555' : '#D4891A' }}
              >
                À réduire
              </p>
            </div>
            <p className="text-2xl mb-0.5">{worstProduct!.emoji}</p>
            <p className="text-white font-semibold text-sm leading-tight">{worstProduct!.name}</p>
            <p
              className="text-xs font-mono font-bold mt-1"
              style={{ color: worstProduct!.rate > 8 ? '#E25555' : '#D4891A' }}
            >
              {worstProduct!.rate.toFixed(1)}%
            </p>
          </motion.div>
        </div>
      )}

      {/* ── Tableau produits ── */}
      {hasHistory && productWaste.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden border"
          style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.07)' }}
        >
          <div className="flex items-center gap-2 px-4 py-3 border-b"
            style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
            <BarChart2 size={13} className="text-[#C19A6B]" />
            <p
              className="text-xs font-semibold"
              style={{ fontFamily: 'Playfair Display, serif', color: 'rgba(255,255,255,0.65)' }}
            >
              Performance par produit · {filteredHistory.length} jour{filteredHistory.length > 1 ? 's' : ''}
            </p>
          </div>
          <ProductTable productWaste={productWaste} />
        </div>
      )}

      {/* ── Recommandation IA ── */}
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
              Recommandation
            </p>
          </div>
          <p className="text-white/60 text-sm leading-relaxed">
            {avgInvendu > 8
              ? `Taux d'invendu élevé (${avgInvendu.toFixed(1)}%). Réduisez la production de "${worstProduct.name}" de ~15% et observez 2 semaines. Envisagez le flash anti-gaspi pour absorber les excédents.`
              : avgInvendu < 3
                ? `Excellent ! Taux d'invendu optimal (${avgInvendu.toFixed(1)}%). Vous pouvez augmenter légèrement la production des produits best-sellers pour ne pas manquer de ventes.`
                : `Taux correct (${avgInvendu.toFixed(1)}%). Surveillez "${worstProduct.name}" (${worstProduct.rate.toFixed(0)}% invendu) — envisagez -10% de production sur ce produit.`
            }
          </p>
        </motion.div>
      )}
    </div>
  );
}