'use client';
// app/boulanger/page.tsx — BakeryOS · UI/UX Pro Max
// ────────────────────────────────────────────────
// Améliorations vs version précédente :
//   ✦ Onglet "Accueil" avec vue d'ensemble temps réel
//   ✦ Badge commandes en attente sur la nav
//   ✦ Header enrichi : CA estimé + statut sync
//   ✦ Plus drawer redesigné avec icônes colorées
//   ✦ Barre de progression journée (Matin → Snapshot → Soir)
//   ✦ Alertes stock critique intégrées
//   ✦ Micro-animations sur toute la nav
//   ✦ Design system cohérent avec tokens CSS

import { useEffect, useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun, Camera, Moon, Zap, LogOut, Cloud, CloudOff,
  Check, Loader2, HelpCircle, MoreHorizontal, BookOpen,
  BarChart2, Settings, X, ChevronRight, ShoppingBag,
  Shield, Users, TrendingUp, TrendingDown, AlertTriangle,
  Clock, Package, Bell, Flame, Home, RefreshCw, ArrowRight,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BoulangerProvider, useBoulanger } from '@/context/boulanger-context';
import { supabase } from '@/lib/supabase';
import LoginForm    from '@/components/boulanger/login-form';
import VueMatin     from '@/components/boulanger/vue-matin';
import VueSnapshot  from '@/components/boulanger/vue-snapshot';
import VueSoir      from '@/components/boulanger/vue-soir';
import VueFlash     from '@/components/boulanger/vue-flash';
import Dashboard    from '@/components/boulanger/dashboard';
import Catalogue    from '@/components/boulanger/catalogue';
import Parametres   from '@/components/boulanger/parametres';
import EquipeManager from '@/components/boulanger/equipe-manager';
import TourWizard, { useTour } from '@/components/boulanger/tour-wizard';
import type { ViewType } from '@/context/boulanger-context';
import { ROLE_LABELS } from '@/lib/types';

// ─────────────────────────────────────────────────────────────
// Horloge live
// ─────────────────────────────────────────────────────────────

function LiveClock() {
  const [time, setTime] = useState('');
  useEffect(() => {
    const update = () =>
      setTime(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
    update();
    const t = setInterval(update, 10_000);
    return () => clearInterval(t);
  }, []);
  return <span className="text-white/30 text-xs font-mono tabular-nums">{time}</span>;
}

// ─────────────────────────────────────────────────────────────
// Indicateur de synchronisation (plus visuel)
// ─────────────────────────────────────────────────────────────

function SyncIndicator() {
  const { syncStatus } = useBoulanger();
  return (
    <AnimatePresence mode="wait">
      {syncStatus === 'saving' && (
        <motion.div
          key="saving"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#C19A6B]/10 border border-[#C19A6B]/20"
        >
          <Loader2 size={10} className="text-[#C19A6B] animate-spin" />
          <span className="text-[10px] text-[#C19A6B]/80 font-medium">Sync</span>
        </motion.div>
      )}
      {syncStatus === 'saved' && (
        <motion.div
          key="saved"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20"
        >
          <Check size={10} className="text-green-400" />
          <span className="text-[10px] text-green-400 font-medium">Sauvegardé</span>
        </motion.div>
      )}
      {syncStatus === 'error' && (
        <motion.div
          key="error"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/10 border border-red-500/20"
        >
          <CloudOff size={10} className="text-red-400" />
          <span className="text-[10px] text-red-400 font-medium">Hors ligne</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────
// Vue d'ensemble (Accueil) — nouveau composant
// ─────────────────────────────────────────────────────────────

interface PendingCommande {
  id: string;
  client_prenom: string;
  heure_retrait: string;
  montant_total: number;
  statut: string;
}

function VueAccueil({ onNavigate }: { onNavigate: (v: ViewType | 'commandes') => void }) {
  const {
    todayStocks, revenueToday, unsoldToday, unsoldRateToday,
    totalProducedToday, boulangerie, userRole,
  } = useBoulanger();

  const [pendingCount, setPendingCount]     = useState(0);
  const [pendingOrders, setPendingOrders]   = useState<PendingCommande[]>([]);
  const [loadingOrders, setLoadingOrders]   = useState(true);
  const [alertesStock, setAlertesStock]     = useState<string[]>([]);

  // Heure courante pour afficher la phase journée
  const hour = new Date().getHours();
  const phase =
    hour < 10 ? 'matin' :
    hour < 15 ? 'snapshot' :
    hour < 18 ? 'soir' : 'flash';

  const phaseLabel: Record<string, string> = {
    matin:    'Production du matin',
    snapshot: 'Stock étagère',
    soir:     'Clôture & bilan',
    flash:    'Flash anti-gaspi',
  };

  const phaseView: Record<string, ViewType> = {
    matin:    'matin',
    snapshot: 'snapshot',
    soir:     'soir',
    flash:    'flash',
  };

  // Charge les commandes en attente
  useEffect(() => {
    async function loadOrders() {
      setLoadingOrders(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;

        const today = new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/boulanger/commandes?date=${today}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (!res.ok) return;

        const { commandes } = await res.json() as { commandes: PendingCommande[] };
        const pending = (commandes ?? []).filter(c => c.statut === 'en_attente');
        setPendingCount(pending.length);
        setPendingOrders(pending.slice(0, 3));
      } catch { /* silent */ }
      finally { setLoadingOrders(false); }
    }
    loadOrders();
  }, []);

  // Détecte les alertes de stock
  useEffect(() => {
    const alertes = todayStocks
      .filter(s => s.production > 0 && s.stockFinal > 0 &&
        (s.stockFinal / s.production) > 0.4)
      .map(s => s.name);
    setAlertesStock(alertes);
  }, [todayStocks]);

  const hasProduction = totalProducedToday > 0;
  const kpiColor =
    unsoldRateToday < 5  ? 'text-green-400' :
    unsoldRateToday < 10 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="space-y-4 pb-4">

      {/* Titre + date */}
      <div className="pt-2">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium">
              Vue d'ensemble
            </p>
            <h1
              className="text-white text-2xl font-bold mt-1 leading-tight"
              style={{ fontFamily: 'Playfair Display, serif' }}
            >
              {new Date().toLocaleDateString('fr-FR', {
                weekday: 'long', day: 'numeric', month: 'long',
              })}
            </h1>
          </div>
          <div
            className="px-3 py-1.5 rounded-xl text-xs font-medium border"
            style={{ background: 'rgba(193,154,107,0.1)', borderColor: 'rgba(193,154,107,0.25)', color: '#C19A6B' }}
          >
            {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </div>
        </div>
      </div>

      {/* ── Phase du jour (call to action contextuel) ── */}
      <motion.button
        whileTap={{ scale: 0.97 }}
        onClick={() => onNavigate(phaseView[phase])}
        className="w-full relative overflow-hidden rounded-2xl text-left"
        style={{
          background: 'linear-gradient(135deg, rgba(193,154,107,0.18) 0%, rgba(193,154,107,0.06) 100%)',
          border: '1px solid rgba(193,154,107,0.28)',
        }}
      >
        <div className="flex items-center gap-4 px-4 py-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(193,154,107,0.15)' }}
          >
            {phase === 'matin'    && <Sun    size={22} className="text-[#C19A6B]" />}
            {phase === 'snapshot' && <Camera size={22} className="text-[#C19A6B]" />}
            {phase === 'soir'     && <Moon   size={22} className="text-[#C19A6B]" />}
            {phase === 'flash'    && <Zap    size={22} className="text-[#C19A6B] fill-[#C19A6B]" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/45 text-[10px] uppercase tracking-wider font-medium">
              En ce moment
            </p>
            <p className="text-[#C19A6B] font-bold text-base mt-0.5">
              {phaseLabel[phase]}
            </p>
            <p className="text-white/35 text-xs mt-0.5">
              Appuyez pour accéder →
            </p>
          </div>
          <ChevronRight size={16} className="text-[#C19A6B]/50 flex-shrink-0" />
        </div>
        {/* Barre de progression journée */}
        <div className="mx-4 mb-4">
          <div className="h-1 bg-white/8 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{
                width: phase === 'matin' ? '25%' :
                       phase === 'snapshot' ? '50%' :
                       phase === 'soir' ? '75%' : '100%',
              }}
              transition={{ duration: 0.8, ease: 'easeOut' }}
              className="h-full rounded-full"
              style={{ background: 'linear-gradient(90deg, #C19A6B, #E8C99A)' }}
            />
          </div>
          <div className="flex justify-between mt-1">
            {['Matin', 'Stock', 'Soir', 'Flash'].map((label, i) => {
              const phases = ['matin', 'snapshot', 'soir', 'flash'];
              const isActive = phase === phases[i];
              const isDone = ['matin','snapshot','soir','flash'].indexOf(phase) > i;
              return (
                <span key={label} className={`text-[9px] font-medium ${
                  isActive ? 'text-[#C19A6B]' : isDone ? 'text-white/40' : 'text-white/18'
                }`}>
                  {isDone ? '✓' : ''}{label}
                </span>
              );
            })}
          </div>
        </div>
      </motion.button>

      {/* ── Commandes en attente ── */}
      {!loadingOrders && pendingCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            onClick={() => onNavigate('commandes')}
            className="w-full text-left"
          >
            <div
              className="rounded-2xl overflow-hidden border"
              style={{ background: 'rgba(58,123,213,0.07)', borderColor: 'rgba(58,123,213,0.2)' }}
            >
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(58,123,213,0.12)' }}>
                <div className="flex items-center gap-2.5">
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(58,123,213,0.15)' }}
                  >
                    <ShoppingBag size={15} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-blue-300 font-semibold text-sm">
                      {pendingCount} commande{pendingCount > 1 ? 's' : ''} en attente
                    </p>
                    <p className="text-blue-400/50 text-[10px]">Appuyez pour gérer</p>
                  </div>
                </div>
                <span
                  className="text-blue-300 font-black text-lg w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ background: 'rgba(58,123,213,0.2)' }}
                >
                  {pendingCount}
                </span>
              </div>
              <div className="px-4 py-2 space-y-1.5">
                {pendingOrders.map(o => (
                  <div key={o.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-blue-400/20 flex items-center justify-center">
                        <span className="text-blue-300 text-[9px] font-bold">
                          {(o.client_prenom ?? 'C')[0]}
                        </span>
                      </div>
                      <span className="text-white/60 text-xs">{o.client_prenom}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/30 text-[10px] font-mono">
                        {String(o.heure_retrait ?? '').slice(0, 5)}
                      </span>
                      <span className="text-blue-300 text-xs font-mono font-bold">
                        {Number(o.montant_total).toFixed(2)}€
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </button>
        </motion.div>
      )}

      {/* ── KPIs du jour ── */}
      {hasProduction && (
        <div className="grid grid-cols-3 gap-2.5">
          {[
            {
              label: 'CA estimé',
              value: `${Math.round(revenueToday)}€`,
              sub: 'aujourd\'hui',
              color: 'text-[#C19A6B]',
              bg: 'rgba(193,154,107,0.08)',
              border: 'rgba(193,154,107,0.18)',
              icon: TrendingUp,
            },
            {
              label: 'Produit',
              value: String(totalProducedToday),
              sub: 'pièces',
              color: 'text-white',
              bg: 'rgba(255,255,255,0.04)',
              border: 'rgba(255,255,255,0.08)',
              icon: Package,
            },
            {
              label: 'Invendu',
              value: `${unsoldRateToday.toFixed(0)}%`,
              sub: `${unsoldToday} pcs`,
              color: kpiColor,
              bg: unsoldRateToday < 5
                ? 'rgba(61,158,106,0.08)'
                : unsoldRateToday < 10
                  ? 'rgba(212,137,26,0.08)'
                  : 'rgba(196,75,75,0.08)',
              border: unsoldRateToday < 5
                ? 'rgba(61,158,106,0.2)'
                : unsoldRateToday < 10
                  ? 'rgba(212,137,26,0.2)'
                  : 'rgba(196,75,75,0.2)',
              icon: unsoldRateToday < 5 ? TrendingDown : AlertTriangle,
            },
          ].map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <motion.div
                key={kpi.label}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="rounded-2xl p-3 border"
                style={{ background: kpi.bg, borderColor: kpi.border }}
              >
                <Icon size={13} className={`${kpi.color} mb-2 opacity-70`} />
                <p className={`font-bold text-xl font-mono leading-none ${kpi.color}`}>
                  {kpi.value}
                </p>
                <p className="text-white/30 text-[10px] mt-1 uppercase tracking-wide">{kpi.label}</p>
                <p className="text-white/20 text-[9px]">{kpi.sub}</p>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* ── Alerte stock ── */}
      {alertesStock.length > 0 && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex items-start gap-3 rounded-2xl border px-4 py-3"
          style={{ background: 'rgba(212,137,26,0.07)', borderColor: 'rgba(212,137,26,0.22)' }}
        >
          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 text-xs font-semibold">
              Risque invendu sur {alertesStock.length} produit{alertesStock.length > 1 ? 's' : ''}
            </p>
            <p className="text-amber-400/55 text-[10px] mt-0.5">
              {alertesStock.join(' · ')}
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Sans production ── */}
      {!hasProduction && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <Sun size={28} className="text-white/20" />
          </div>
          <p className="text-white/50 font-medium text-sm">Production non saisie</p>
          <p className="text-white/25 text-xs mt-1 leading-relaxed max-w-xs">
            Commencez par saisir la production du matin pour voir vos métriques ici.
          </p>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => onNavigate('matin')}
            className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{
              background: 'rgba(193,154,107,0.15)',
              border: '1px solid rgba(193,154,107,0.3)',
              color: '#C19A6B',
            }}
          >
            <Sun size={15} />
            Saisir la production →
          </motion.button>
        </div>
      )}

      {/* ── Accès rapides ── */}
      <div>
        <p className="text-white/30 text-[10px] uppercase tracking-widest mb-2.5 px-0.5 font-medium">
          Accès rapides
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Commandes', icon: ShoppingBag, view: 'commandes' as const, accent: 'rgba(58,123,213,0.12)', border: 'rgba(58,123,213,0.2)', color: '#6FA8EA', badge: pendingCount > 0 ? pendingCount : undefined },
            { label: 'Flash du soir', icon: Zap, view: 'flash' as const, accent: 'rgba(193,154,107,0.1)', border: 'rgba(193,154,107,0.2)', color: '#C19A6B' },
            { label: 'Statistiques', icon: BarChart2, view: 'dashboard' as const, accent: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' },
            { label: 'Catalogue', icon: BookOpen, view: 'catalogue' as const, accent: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.5)' },
          ].map(item => {
            const Icon = item.icon;
            return (
              <motion.button
                key={item.label}
                whileTap={{ scale: 0.97 }}
                onClick={() => onNavigate(item.view)}
                className="relative flex items-center gap-2.5 px-3.5 py-3 rounded-xl border text-left"
                style={{ background: item.accent, borderColor: item.border }}
              >
                <Icon size={16} style={{ color: item.color }} />
                <span className="text-white/70 text-xs font-medium">{item.label}</span>
                {item.badge !== undefined && item.badge > 0 && (
                  <span
                    className="absolute top-2 right-2 text-white font-bold text-[9px] min-w-[16px] h-4 flex items-center justify-center rounded-full px-1"
                    style={{ background: '#3A7BD5' }}
                  >
                    {item.badge}
                  </span>
                )}
              </motion.button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Drawer "Plus" — redesigné
// ─────────────────────────────────────────────────────────────

type DrawerItemId = 'commandes' | 'catalogue' | 'dashboard' | 'equipe' | 'parametres';

interface DrawerItem {
  id:         DrawerItemId;
  label:      string;
  icon:       React.ElementType;
  desc:       string;
  href?:      string;
  view?:      ViewType;
  accent:     string;
  color:      string;
  permission: string | null;
}

const DRAWER_ITEMS: DrawerItem[] = [
  {
    id: 'commandes', label: 'Commandes', icon: ShoppingBag,
    desc: 'Click & collect et anti-gaspi du jour',
    href: '/boulanger/commandes',
    accent: 'rgba(58,123,213,0.12)', color: '#6FA8EA',
    permission: 'commandes',
  },
  {
    id: 'catalogue', label: 'Produits', icon: BookOpen,
    desc: 'Gérer votre catalogue & photos',
    view: 'catalogue',
    accent: 'rgba(61,158,106,0.1)', color: '#5CC994',
    permission: 'catalogue',
  },
  {
    id: 'dashboard', label: 'Statistiques', icon: BarChart2,
    desc: 'Historique & analyse performance',
    view: 'dashboard',
    accent: 'rgba(193,154,107,0.1)', color: '#C19A6B',
    permission: 'dashboard',
  },
  {
    id: 'equipe', label: 'Équipe', icon: Users,
    desc: 'Membres, invitations, rôles',
    view: 'equipe',
    accent: 'rgba(184,130,214,0.1)', color: '#B882D6',
    permission: 'equipe',
  },
  {
    id: 'parametres', label: 'Paramètres', icon: Settings,
    desc: 'Flash, créneaux, adresse, plan',
    view: 'parametres',
    accent: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)',
    permission: 'parametres',
  },
];

function PlusDrawer({
  open, onClose, onNavigate, activeView, pendingOrders,
}: {
  open:          boolean;
  onClose:       () => void;
  onNavigate:    (v: ViewType) => void;
  activeView:    ViewType;
  pendingOrders: number;
}) {
  const router = useRouter();
  const { canRead } = useBoulanger();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto"
          >
            <div
              className="border rounded-t-3xl overflow-hidden shadow-2xl"
              style={{
                background: '#130B06',
                borderColor: 'rgba(193,154,107,0.12)',
              }}
            >
              {/* Poignée */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-white/15 rounded-full" />
              </div>

              {/* Header drawer */}
              <div className="flex items-center justify-between px-5 py-2.5">
                <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold">
                  Navigation
                </p>
                <button
                  onClick={onClose}
                  className="w-7 h-7 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)' }}
                >
                  <X size={13} />
                </button>
              </div>

              {/* Items */}
              <div className="px-4 pb-8 space-y-2">
                {DRAWER_ITEMS.map(item => {
                  if (item.permission && !canRead(item.permission as any)) return null;
                  const Icon     = item.icon;
                  const isActive = item.view ? activeView === item.view : false;
                  const isCmds   = item.id === 'commandes';

                  return (
                    <motion.button
                      key={item.id}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        if (item.href) router.push(item.href);
                        else if (item.view) onNavigate(item.view);
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all select-none"
                      style={{
                        background: isActive ? `rgba(193,154,107,0.12)` : item.accent,
                        borderColor: isActive
                          ? 'rgba(193,154,107,0.3)'
                          : isCmds
                            ? 'rgba(58,123,213,0.25)'
                            : 'rgba(255,255,255,0.06)',
                      }}
                    >
                      {/* Icône colorée */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 relative"
                        style={{ background: item.accent, border: `1px solid ${item.color}22` }}
                      >
                        <Icon size={18} style={{ color: item.color }} strokeWidth={1.8} />
                        {isCmds && pendingOrders > 0 && (
                          <span
                            className="absolute -top-1 -right-1 text-white font-black text-[9px] min-w-[16px] h-4 flex items-center justify-center rounded-full px-1"
                            style={{ background: '#3A7BD5' }}
                          >
                            {pendingOrders}
                          </span>
                        )}
                      </div>

                      {/* Texte */}
                      <div className="flex-1 min-w-0">
                        <p
                          className="font-semibold text-sm"
                          style={{ color: isActive ? '#C19A6B' : item.id === 'commandes' ? '#6FA8EA' : 'white' }}
                        >
                          {item.label}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>
                          {item.desc}
                        </p>
                      </div>

                      <ChevronRight size={14} style={{ color: isActive ? '#C19A6B' : 'rgba(255,255,255,0.18)' }} />
                    </motion.button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────
// Vue bloquée (permission insuffisante)
// ─────────────────────────────────────────────────────────────

function ViewBlocked() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <Shield size={32} className="text-white/15 mb-4" />
      <p className="text-white/40 text-sm font-medium">Vue non accessible</p>
      <p className="text-white/20 text-xs mt-1">Votre rôle n'autorise pas cette section.</p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Configuration de la barre de navigation inférieure
// ─────────────────────────────────────────────────────────────

type LocalView = 'accueil' | ViewType;

const ALL_NAV_ITEMS: {
  id: LocalView;
  label: string;
  icon: React.ElementType;
  flash?: boolean;
  permission?: string;
}[] = [
  { id: 'accueil',   label: 'Accueil', icon: Home },
  { id: 'matin',     label: 'Matin',   icon: Sun,    permission: 'matin' },
  { id: 'snapshot',  label: 'Stock',   icon: Camera, permission: 'snapshot' },
  { id: 'soir',      label: 'Soir',    icon: Moon,   permission: 'soir' },
  { id: 'flash',     label: 'Flash',   icon: Zap, flash: true, permission: 'flash' },
];

// ─────────────────────────────────────────────────────────────
// Shell principal
// ─────────────────────────────────────────────────────────────

function AppShell() {
  const {
    isAuthenticated, authLoading,
    activeView, setActiveView,
    logout, boulangerie, userRole, canRead,
  } = useBoulanger();

  const { startTour, tourCompleted, resetTour, loading: tourLoading } = useTour();
  const router = useRouter();

  const [drawerOpen,    setDrawerOpen]    = useState(false);
  const [localView,     setLocalView]     = useState<LocalView>('accueil');
  const [pendingCount,  setPendingCount]  = useState(0);
  const pendingRef = useRef(0);

  // Détermine si une vue secondaire est active (via "Plus")
  const isSecondaryActive = (['catalogue', 'dashboard', 'parametres', 'equipe'] as ViewType[])
    .includes(activeView);

  // Charge le compte de commandes en attente pour le badge
  useEffect(() => {
    if (!isAuthenticated) return;
    async function loadCount() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const today = new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/boulanger/commandes?date=${today}`, {
          headers: { Authorization: `Bearer ${session.access_token}` },
          cache: 'no-store',
        });
        if (!res.ok) return;
        const { commandes } = await res.json() as { commandes: { statut: string }[] };
        const count = (commandes ?? []).filter(c => c.statut === 'en_attente').length;
        setPendingCount(count);
        pendingRef.current = count;
      } catch { /* silent */ }
    }
    loadCount();
    const interval = setInterval(loadCount, 60_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // Navigation locale (gère 'accueil' + ViewType)
  const handleNavClick = useCallback((v: LocalView) => {
    if (v === 'accueil') {
      setLocalView('accueil');
    } else {
      setLocalView(v);
      setActiveView(v as ViewType);
    }
  }, [setActiveView]);

  // Navigation depuis la vue accueil ou drawer
  const handleDeepNavigate = useCallback((v: ViewType | 'commandes') => {
    if (v === 'commandes') {
      router.push('/boulanger/commandes');
    } else {
      setLocalView(v);
      setActiveView(v);
    }
  }, [setActiveView, router]);

  // ── Loading ────────────────────────────────────────────────
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center"
        style={{ background: '#1A0F0A' }}>
        <div className="text-center">
          <span className="text-4xl block mb-4">🥖</span>
          <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  // ── Non authentifié ────────────────────────────────────────
  if (!isAuthenticated) return <LoginForm />;

  // ── Blocage client sans rôle boulanger (S0) ───────────────
  if (!boulangerie || !userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4"
        style={{ background: '#1A0F0A' }}>
        <div className="text-center">
          <Shield size={40} className="text-white/20 mx-auto mb-4" />
          <p className="text-white/70 text-lg font-semibold"
            style={{ fontFamily: 'Playfair Display, serif' }}>
            Accès non autorisé
          </p>
          <p className="text-white/40 text-sm mt-2 max-w-xs mx-auto leading-relaxed">
            Cet espace est réservé aux boulangers inscrits sur BakeryOS.
          </p>
          <button onClick={() => router.push('/')}
            className="mt-6 px-6 py-3 rounded-xl font-semibold text-sm transition-colors"
            style={{ background: '#C19A6B', color: '#1A0F0A' }}>
            Retour à la vitrine
          </button>
          <button onClick={logout}
            className="block mx-auto mt-3 text-white/25 text-xs hover:text-white/50">
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  // Filtre les items de nav selon les permissions (max 4 + accueil)
  const navItems = ALL_NAV_ITEMS.filter(n =>
    n.id === 'accueil' || !n.permission || canRead(n.permission as any)
  ).slice(0, 5);

  // ── Interface principale ───────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#1A0F0A' }}>

      {/* Texture grain */}
      <div
        className="fixed inset-0 opacity-[0.022] pointer-events-none z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ── Header ────────────────────────────────────────── */}
      <header
        className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
        style={{
          background: 'rgba(18,10,6,0.92)',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}
      >
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">

          {/* Logo + boulangerie */}
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
              style={{ background: 'rgba(193,154,107,0.15)', border: '1px solid rgba(193,154,107,0.2)' }}
            >
              🥖
            </div>
            <div className="min-w-0">
              <p
                className="text-white text-sm font-bold leading-none truncate"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
                {boulangerie.nom}
              </p>
              <p
                className="text-[10px] tracking-widest uppercase leading-none mt-0.5"
                style={{
                  color: userRole === 'owner'  ? 'rgba(193,154,107,0.6)' :
                         userRole === 'gerant' ? 'rgba(106,168,234,0.7)' :
                         'rgba(255,255,255,0.3)',
                }}
              >
                {userRole === 'owner' ? 'Espace boulanger' : ROLE_LABELS[userRole]}
              </p>
            </div>
          </div>

          {/* Actions droite */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <SyncIndicator />
            <LiveClock />
            {!tourLoading && userRole === 'owner' && (
              <button
                onClick={tourCompleted ? resetTour : startTour}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  color: 'rgba(255,255,255,0.25)',
                }}
              >
                <HelpCircle size={14} />
              </button>
            )}
            <button
              onClick={logout}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
              style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.25)',
              }}
            >
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Contenu principal ────────────────────────────── */}
      <main className="relative z-10 max-w-lg mx-auto px-4 pt-20 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={localView}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {/* Vue accueil (nouvelle) */}
            {localView === 'accueil' && (
              <VueAccueil onNavigate={handleDeepNavigate} />
            )}

            {/* Vues existantes */}
            {localView === 'matin'      && (canRead('matin')      ? <VueMatin />    : <ViewBlocked />)}
            {localView === 'snapshot'   && (canRead('snapshot')   ? <VueSnapshot /> : <ViewBlocked />)}
            {localView === 'soir'       && (canRead('soir')       ? <VueSoir />     : <ViewBlocked />)}
            {localView === 'flash'      && (canRead('flash')      ? <VueFlash />    : <ViewBlocked />)}
            {localView === 'catalogue'  && (canRead('catalogue')  ? <Catalogue />   : <ViewBlocked />)}
            {localView === 'dashboard'  && (canRead('dashboard')  ? <Dashboard />   : <ViewBlocked />)}
            {localView === 'parametres' && (canRead('parametres') ? <Parametres />  : <ViewBlocked />)}
            {localView === 'equipe'     && (canRead('equipe')     ? <EquipeManager /> : <ViewBlocked />)}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Bottom Nav ───────────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md"
        style={{
          background: 'rgba(18,10,6,0.97)',
          borderTop: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div
          className="grid w-full max-w-lg mx-auto"
          style={{
            gridTemplateColumns: `repeat(${navItems.length + 1}, 1fr)`,
            height: '72px',
          }}
        >
          {navItems.map(item => {
            const Icon     = item.icon;
            const isActive = localView === item.id;
            const isAccueil = item.id === 'accueil';

            return (
              <motion.button
                key={item.id}
                onClick={() => handleNavClick(item.id as LocalView)}
                whileTap={{ scale: 0.86 }}
                className="flex flex-col items-center justify-center gap-1.5 touch-manipulation select-none"
              >
                <motion.div
                  className="relative flex flex-col items-center gap-1 px-2.5 py-2 rounded-2xl"
                  animate={{
                    background: isActive
                      ? item.flash
                        ? 'rgba(234,196,58,0.15)'
                        : isAccueil
                          ? 'rgba(255,255,255,0.07)'
                          : 'rgba(193,154,107,0.15)'
                      : 'transparent',
                  }}
                >
                  <Icon
                    size={21}
                    strokeWidth={isActive ? 2.3 : 1.6}
                    style={{
                      color: isActive
                        ? item.flash
                          ? '#EAC43A'
                          : isAccueil
                            ? 'rgba(255,255,255,0.8)'
                            : '#C19A6B'
                        : 'rgba(255,255,255,0.4)',
                    }}
                  />
                  <span
                    className="text-[9px] font-bold leading-none"
                    style={{
                      color: isActive
                        ? item.flash
                          ? '#EAC43A'
                          : isAccueil
                            ? 'rgba(255,255,255,0.8)'
                            : '#C19A6B'
                        : 'rgba(255,255,255,0.4)',
                    }}
                  >
                    {item.label}
                  </span>
                </motion.div>
              </motion.button>
            );
          })}

          {/* Bouton "Plus" */}
          <motion.button
            onClick={() => setDrawerOpen(true)}
            whileTap={{ scale: 0.86 }}
            className="flex flex-col items-center justify-center gap-1.5 touch-manipulation select-none"
          >
            <div
              className="relative flex flex-col items-center gap-1 px-2.5 py-2 rounded-2xl"
              style={{ background: isSecondaryActive ? 'rgba(193,154,107,0.15)' : 'transparent' }}
            >
              {/* Icône contextuelle si vue secondaire active */}
              {isSecondaryActive ? (
                <>
                  {activeView === 'catalogue'  && <BookOpen  size={21} strokeWidth={2.3} style={{ color: '#C19A6B' }} />}
                  {activeView === 'dashboard'  && <BarChart2 size={21} strokeWidth={2.3} style={{ color: '#C19A6B' }} />}
                  {activeView === 'parametres' && <Settings  size={21} strokeWidth={2.3} style={{ color: '#C19A6B' }} />}
                  {activeView === 'equipe'     && <Users     size={21} strokeWidth={2.3} style={{ color: '#C19A6B' }} />}
                  <span className="text-[9px] font-bold leading-none" style={{ color: '#C19A6B' }}>
                    {activeView === 'catalogue' ? 'Produits' :
                     activeView === 'dashboard' ? 'Stats' :
                     activeView === 'equipe'    ? 'Équipe' : 'Config'}
                  </span>
                </>
              ) : (
                <>
                  {/* Badge commandes en attente sur "Plus" */}
                  {pendingCount > 0 && (
                    <span
                      className="absolute top-1 right-1 text-white font-black text-[9px] min-w-[15px] h-[15px] flex items-center justify-center rounded-full"
                      style={{ background: '#3A7BD5' }}
                    >
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                  <MoreHorizontal size={21} strokeWidth={1.6} style={{ color: 'rgba(255,255,255,0.4)' }} />
                  <span className="text-[9px] font-bold leading-none" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Plus
                  </span>
                </>
              )}
            </div>
          </motion.button>
        </div>
      </nav>

      {/* ── Drawer Plus ───────────────────────────────── */}
      <PlusDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={v => { setLocalView(v); setActiveView(v); }}
        activeView={activeView}
        pendingOrders={pendingCount}
      />

      {/* ── Tour guidé (owner uniquement) ─────────────── */}
      {userRole === 'owner' && (
        <TourWizard onNavigateToView={view => { setLocalView(view); setActiveView(view); }} />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Export
// ─────────────────────────────────────────────────────────────

export default function BoulangerPage() {
  return (
    <BoulangerProvider>
      <AppShell />
    </BoulangerProvider>
  );
}