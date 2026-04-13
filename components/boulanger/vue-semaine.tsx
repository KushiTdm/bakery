'use client';
// components/boulanger/vue-semaine.tsx — Sauve Mie · Récapitulatif hebdomadaire
// ───────────────────────────────────────────────────────────────
// Affiche 7 cards (lundi→dimanche) avec CA moyen, taux invendu, valeur invendus.
// Au clic sur une card, affiche le détail complet du jour :
//   meilleur/pire CA, meilleures/pires ventes, commandes C&C, paniers anti-gaspi.

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  TrendingUp, TrendingDown, Trophy, AlertTriangle,
  ShoppingBag, Package, Recycle, ChevronDown, ChevronUp,
  Calendar, Loader2, Info, X, ArrowUp, ArrowDown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ProductStat {
  id: string;
  nom: string;
  emoji: string;
  totalProduction: number;
  totalVendu: number;
  totalInvendu: number;
  apparitions: number;
  avgVendu: number;
  avgInvendu: number;
  tauxInvendu: number;
}

interface PanierProduit {
  nom: string;
  emoji: string;
  count: number;
}

interface JourStats {
  jour_semaine: number;
  nom: string;
  count: number;
  avgCA: number;
  avgInvendu: number;
  avgValeurInvendus: number;
  bestCA: { montant: number; date: string };
  worstCA: { montant: number; date: string };
  meilleuresVentes: ProductStat[];
  piresVentes: ProductStat[];
  commandesTotal: number;
  commandesMoyennes: number;
  txClickCollect: number;
  txAntiGaspi: number;
  caMoyenClickCollect: number;
  txVentePaniers: number;
  compositionPaniers: PanierProduit[];
  totalPaniersProposés: number;
  totalPaniersVendus: number;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

const JOURS_COURTS = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

function formatDate(d: string): string {
  return new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function invenduColor(rate: number): string {
  return rate < 5 ? '#3D9E6A' : rate < 10 ? '#D4891A' : '#E25555';
}

function invenduBg(rate: number): string {
  return rate < 5 ? 'rgba(61,158,106,0.12)' : rate < 10 ? 'rgba(212,137,26,0.1)' : 'rgba(226,85,85,0.1)';
}

// ─────────────────────────────────────────────────────────────
// Stat Pill (petite stat inline)
// ─────────────────────────────────────────────────────────────

function StatPill({ label, value, color, icon: Icon }: {
  label: string;
  value: string;
  color: string;
  icon?: React.ElementType;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl"
      style={{ background: `${color}10`, border: `1px solid ${color}20` }}>
      {Icon && <Icon size={13} style={{ color }} />}
      <div>
        <p className="text-[9px] uppercase tracking-wider font-medium" style={{ color: `${color}99` }}>{label}</p>
        <p className="text-sm font-bold font-mono" style={{ color }}>{value}</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Product Row (dans le détail)
// ─────────────────────────────────────────────────────────────

function ProductRow({ p, rank, type }: {
  p: ProductStat;
  rank: number;
  type: 'best' | 'worst';
}) {
  const color = type === 'best' ? '#3D9E6A' : '#E25555';
  return (
    <motion.div
      initial={{ opacity: 0, x: type === 'best' ? -8 : 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.05 }}
      className="flex items-center gap-2.5 py-2"
    >
      <span className="text-[10px] font-bold w-4 text-center" style={{ color: `${color}80` }}>
        {rank + 1}
      </span>
      <span className="text-base flex-shrink-0">{p.emoji}</span>
      <div className="flex-1 min-w-0">
        <p className="text-white/70 text-xs font-medium truncate">{p.nom}</p>
        <p className="text-white/30 text-[10px]">
          {Math.round(p.avgVendu)} vendus/j moy.
        </p>
      </div>
      <span className="text-xs font-bold font-mono flex-shrink-0" style={{ color }}>
        {p.tauxInvendu.toFixed(1)}%
      </span>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// Day Card
// ─────────────────────────────────────────────────────────────

function DayCard({ jour, isSelected, onClick }: {
  jour: JourStats;
  isSelected: boolean;
  onClick: () => void;
}) {
  const invColor = invenduColor(jour.avgInvendu);

  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      className="w-full rounded-2xl p-3 sm:p-4 border text-left transition-all relative overflow-hidden"
      style={{
        background: isSelected
          ? 'rgba(193,154,107,0.1)'
          : 'rgba(255,255,255,0.025)',
        borderColor: isSelected
          ? 'rgba(193,154,107,0.35)'
          : 'rgba(255,255,255,0.07)',
      }}
    >
      {/* Accent bar top */}
      {isSelected && (
        <motion.div
          layoutId="day-indicator"
          className="absolute top-0 left-0 right-0 h-[2px]"
          style={{ background: '#C19A6B' }}
        />
      )}

      {/* Jour */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-xs sm:text-sm font-bold" style={{
            color: isSelected ? '#C19A6B' : 'rgba(255,255,255,0.8)',
            fontFamily: 'Playfair Display, serif',
          }}>
            {jour.nom}
          </p>
          <p className="text-[9px] text-white/25 mt-0.5">
            {jour.count} jour{jour.count > 1 ? 's' : ''} analysé{jour.count > 1 ? 's' : ''}
          </p>
        </div>
        <motion.div
          animate={{ rotate: isSelected ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={14} style={{ color: isSelected ? '#C19A6B' : 'rgba(255,255,255,0.2)' }} />
        </motion.div>
      </div>

      {/* KPIs */}
      <div className="space-y-2">
        {/* CA moyen */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/30 uppercase tracking-wider">CA moy.</span>
          <span className="text-sm font-bold font-mono text-[#C19A6B]">{jour.avgCA}€</span>
        </div>

        {/* Taux invendu */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/30 uppercase tracking-wider">Invendu</span>
          <div className="flex items-center gap-1.5">
            <div className="w-12 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <div className="h-full rounded-full transition-all" style={{
                width: `${Math.min(jour.avgInvendu * 5, 100)}%`,
                background: invColor,
              }} />
            </div>
            <span className="text-xs font-bold font-mono" style={{ color: invColor }}>
              {jour.avgInvendu}%
            </span>
          </div>
        </div>

        {/* Valeur invendus */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-white/30 uppercase tracking-wider">Perte moy.</span>
          <span className="text-xs font-semibold font-mono" style={{ color: jour.avgValeurInvendus > 30 ? '#E25555' : 'rgba(255,255,255,0.5)' }}>
            {jour.avgValeurInvendus}€
          </span>
        </div>
      </div>
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────
// Detail Panel (affiché au clic sur une card)
// ─────────────────────────────────────────────────────────────

function DayDetail({ jour, onClose }: { jour: JourStats; onClose: () => void }) {
  const invColor = invenduColor(jour.avgInvendu);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3, ease: 'easeInOut' }}
      className="overflow-hidden"
    >
      <div className="rounded-2xl border overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', borderColor: 'rgba(193,154,107,0.15)' }}>

        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-[#C19A6B]" />
            <p className="text-sm font-bold" style={{ fontFamily: 'Playfair Display, serif', color: '#C19A6B' }}>
              {jour.nom} — Détails
            </p>
          </div>
          <button onClick={onClose}
            className="w-6 h-6 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.05)' }}>
            <X size={12} className="text-white/40" />
          </button>
        </div>

        <div className="px-4 py-4 space-y-5">

          {/* ── Meilleur & Pire CA ── */}
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl p-3 border"
              style={{ background: 'rgba(61,158,106,0.06)', borderColor: 'rgba(61,158,106,0.15)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <Trophy size={11} className="text-green-400" />
                <p className="text-[9px] font-bold uppercase tracking-wider text-green-400">Meilleur CA</p>
              </div>
              <p className="text-lg font-bold font-mono text-green-400">{jour.bestCA.montant}€</p>
              <p className="text-[10px] text-white/30 mt-1">{formatDate(jour.bestCA.date)}</p>
            </div>

            <div className="rounded-xl p-3 border"
              style={{ background: 'rgba(226,85,85,0.06)', borderColor: 'rgba(226,85,85,0.15)' }}>
              <div className="flex items-center gap-1.5 mb-2">
                <ArrowDown size={11} className="text-red-400" />
                <p className="text-[9px] font-bold uppercase tracking-wider text-red-400">Pire CA</p>
              </div>
              <p className="text-lg font-bold font-mono text-red-400">{jour.worstCA.montant}€</p>
              <p className="text-[10px] text-white/30 mt-1">{formatDate(jour.worstCA.date)}</p>
            </div>
          </div>

          {/* ── Taux d'invendu ── */}
          <div className="rounded-xl p-3 border"
            style={{ background: invenduBg(jour.avgInvendu), borderColor: `${invColor}25` }}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Package size={13} style={{ color: invColor }} />
                <div>
                  <p className="text-[9px] font-bold uppercase tracking-wider" style={{ color: `${invColor}99` }}>
                    Taux d'invendu moyen
                  </p>
                  <p className="text-xl font-bold font-mono mt-0.5" style={{ color: invColor }}>
                    {jour.avgInvendu}%
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-[9px] text-white/30">Perte moy.</p>
                <p className="text-sm font-bold font-mono" style={{ color: invColor }}>{jour.avgValeurInvendus}€</p>
              </div>
            </div>
          </div>

          {/* ── Meilleures ventes ── */}
          {jour.meilleuresVentes.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <ArrowUp size={12} className="text-green-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-green-400/70">
                  Meilleures ventes en moy.
                </p>
              </div>
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                {jour.meilleuresVentes.map((p, i) => (
                  <ProductRow key={p.id} p={p} rank={i} type="best" />
                ))}
              </div>
            </div>
          )}

          {/* ── Pires ventes ── */}
          {jour.piresVentes.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-2.5">
                <ArrowDown size={12} className="text-red-400" />
                <p className="text-[10px] font-bold uppercase tracking-wider text-red-400/70">
                  Moins bonnes ventes
                </p>
              </div>
              <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
                {jour.piresVentes.map((p, i) => (
                  <ProductRow key={p.id} p={p} rank={i} type="worst" />
                ))}
              </div>
            </div>
          )}

          {/* ── Commandes Click & Collect ── */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <ShoppingBag size={12} className="text-blue-400" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400/70">
                Commandes en ligne
              </p>
            </div>

            {jour.commandesTotal === 0 ? (
              <p className="text-white/25 text-xs">Aucune commande enregistrée ce jour.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <StatPill
                  label="Moy. / jour"
                  value={`${jour.commandesMoyennes}`}
                  color="#6FA8EA"
                  icon={ShoppingBag}
                />
                <StatPill
                  label="Click & Collect"
                  value={`${jour.txClickCollect}%`}
                  color="#6FA8EA"
                />
                <StatPill
                  label="Anti-gaspi"
                  value={`${jour.txAntiGaspi}%`}
                  color="#EAC43A"
                  icon={Recycle}
                />
              </div>
            )}
          </div>

          {/* ── Paniers anti-gaspi ── */}
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <Recycle size={12} className="text-yellow-400" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-yellow-400/70">
                Paniers anti-gaspi
              </p>
            </div>

            {jour.totalPaniersProposés === 0 ? (
              <p className="text-white/25 text-xs">Aucun panier flash proposé ce jour.</p>
            ) : (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <StatPill
                    label="Taux de vente"
                    value={`${jour.txVentePaniers}%`}
                    color={jour.txVentePaniers > 70 ? '#3D9E6A' : '#D4891A'}
                    icon={Recycle}
                  />
                  <StatPill
                    label="Vendus / proposés"
                    value={`${jour.totalPaniersVendus} / ${jour.totalPaniersProposés}`}
                    color="rgba(255,255,255,0.5)"
                    icon={Package}
                  />
                </div>

                {/* Composition */}
                {jour.compositionPaniers.length > 0 && (
                  <div>
                    <p className="text-[9px] text-white/25 uppercase tracking-wider mb-2">Produits les plus flashés</p>
                    <div className="flex flex-wrap gap-1.5">
                      {jour.compositionPaniers.map((p) => (
                        <span key={p.nom}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium"
                          style={{ background: 'rgba(234,196,58,0.08)', border: '1px solid rgba(234,196,58,0.15)', color: 'rgba(234,196,58,0.8)' }}>
                          {p.emoji} {p.nom}
                          <span className="text-[9px] opacity-60">x{p.count}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────
// Composant principal VueSemaine
// ─────────────────────────────────────────────────────────────

export default function VueSemaine() {
  const [data, setData] = useState<JourStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const loadStats = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Non authentifié');
        return;
      }

      const res = await fetch('/api/boulanger/stats-semaine', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });

      if (!res.ok) {
        setError('Erreur de chargement');
        return;
      }

      const json = await res.json();
      setData(json.jours ?? []);
    } catch {
      setError('Erreur réseau');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);

  const selectedJour = data.find(j => j.jour_semaine === selectedDay) ?? null;

  // ── Loading ──
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin" />
      </div>
    );
  }

  // ── Pas de données ──
  if (error || data.length === 0) {
    return (
      <div className="rounded-2xl px-4 py-5 flex items-start gap-3 border"
        style={{ background: 'rgba(193,154,107,0.06)', borderColor: 'rgba(193,154,107,0.18)' }}>
        <Info size={15} className="text-[#C19A6B] flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-[#C19A6B] text-sm font-semibold mb-1">
            {error ?? 'Données insuffisantes'}
          </p>
          <p className="text-white/40 text-xs leading-relaxed">
            Clôturez plusieurs journées pour alimenter les statistiques hebdomadaires.
            L'analyse s'améliore avec le temps.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar size={14} className="text-[#C19A6B]" />
          <p className="text-sm font-semibold"
            style={{ fontFamily: 'Playfair Display, serif', color: 'rgba(255,255,255,0.65)' }}>
            Récapitulatif par jour
          </p>
        </div>
        <p className="text-[10px] text-white/25">
          {data.reduce((s, j) => s + j.count, 0)} jours analysés
        </p>
      </div>

      {/* Cards Grid */}
      {/* Mobile : scroll horizontal 2 rangées | Tablette : 4 cols | Desktop : 7 cols */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 sm:gap-3">
        {data.map((jour) => (
          <DayCard
            key={jour.jour_semaine}
            jour={jour}
            isSelected={selectedDay === jour.jour_semaine}
            onClick={() => setSelectedDay(
              selectedDay === jour.jour_semaine ? null : jour.jour_semaine
            )}
          />
        ))}
      </div>

      {/* Détail du jour sélectionné */}
      <AnimatePresence mode="wait">
        {selectedJour && (
          <DayDetail
            key={selectedJour.jour_semaine}
            jour={selectedJour}
            onClose={() => setSelectedDay(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
