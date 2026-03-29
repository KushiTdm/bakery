'use client';
// app/boulanger/page.tsx — BakeryOS · Workflow Journée v2
// ─────────────────────────────────────────────────────────────
// Modifications vs v1 :
//   ✦ Workflow chronologique strict : Matin → Stock → Flash → Soir
//   ✦ Compte à rebours jusqu'à minuit (fin de journée)
//   ✦ Blocage des onglets non encore accessibles
//   ✦ DayCountdown intégré dans la vue Accueil
//   ✦ WorkflowGuard sur chaque vue protégée
//   ✦ Vue 'ia' accessible depuis le Drawer "Plus"

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun, Camera, Moon, Zap, LogOut, CloudOff,
  Check, Loader2, HelpCircle, MoreHorizontal, BookOpen,
  BarChart2, Settings, X, ChevronRight, ShoppingBag,
  Shield, Users, TrendingUp, TrendingDown, AlertTriangle,
  Package, Home, Lock, Sparkles,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { BoulangerProvider, useBoulanger } from '@/context/boulanger-context';
import { supabase } from '@/lib/supabase';
import LoginForm     from '@/components/boulanger/login-form';
import VueMatin      from '@/components/boulanger/vue-matin';
import VueSnapshot   from '@/components/boulanger/vue-snapshot';
import VueSoir       from '@/components/boulanger/vue-soir';
import VueFlash      from '@/components/boulanger/vue-flash';
import VueRapportIA  from '@/components/boulanger/vue-rapport-ia';
import Dashboard     from '@/components/boulanger/dashboard';
import DashboardSupervision from '@/components/boulanger/dashboard-supervision';
import Catalogue     from '@/components/boulanger/catalogue';
import { isOwner as checkIsOwner } from '@/lib/auth-boulanger';
import Parametres    from '@/components/boulanger/parametres';
import EquipeManager from '@/components/boulanger/equipe-manager';
import TourWizard, { useTour } from '@/components/boulanger/tour-wizard';
import WorkflowGuard from '@/components/boulanger/workflow-guard';
import DayCountdown  from '@/components/boulanger/day-countdown';
import { useWorkflowJournee } from '@/hooks/use-workflow-journee';
import type { ViewType } from '@/lib/types';
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
// Indicateur de synchronisation
// ─────────────────────────────────────────────────────────────

function SyncIndicator() {
  const { syncStatus } = useBoulanger();
  return (
    <AnimatePresence mode="wait">
      {syncStatus === 'saving' && (
        <motion.div key="saving" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-[#C19A6B]/10 border border-[#C19A6B]/20">
          <Loader2 size={10} className="text-[#C19A6B] animate-spin" />
          <span className="text-[10px] text-[#C19A6B]/80 font-medium">Sync</span>
        </motion.div>
      )}
      {syncStatus === 'saved' && (
        <motion.div key="saved" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-green-500/10 border border-green-500/20">
          <Check size={10} className="text-green-400" />
          <span className="text-[10px] text-green-400 font-medium">Sauvegardé</span>
        </motion.div>
      )}
      {syncStatus === 'error' && (
        <motion.div key="error" initial={{ opacity: 0, scale: 0.8 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }}
          className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-500/10 border border-red-500/20">
          <CloudOff size={10} className="text-red-400" />
          <span className="text-[10px] text-red-400 font-medium">Hors ligne</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ─────────────────────────────────────────────────────────────
// Vue d'ensemble (Accueil)
// ─────────────────────────────────────────────────────────────

interface PendingCommande {
  id: string;
  client_prenom: string;
  heure_retrait: string;
  montant_total: number;
  statut: string;
}

function VueAccueil({
  onNavigate,
  workflow,
}: {
  onNavigate: (v: ViewType | 'commandes') => void;
  workflow: ReturnType<typeof useWorkflowJournee>;
}) {
  const {
    todayStocks, revenueToday, unsoldToday, unsoldRateToday,
    totalProducedToday,
  } = useBoulanger();

  const [pendingCount, setPendingCount]   = useState(0);
  const [pendingOrders, setPendingOrders] = useState<PendingCommande[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [alertesStock, setAlertesStock]   = useState<string[]>([]);

  const {
    canAccessSnapshot, canAccessFlash, canAccessSoir,
    currentSuggestedStep, currentStepLabel,
  } = workflow;

  const phase = currentSuggestedStep;
  const phaseView: Record<string, ViewType> = {
    matin: 'matin', snapshot: 'snapshot', soir: 'soir', flash: 'flash',
  };

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

  useEffect(() => {
    const alertes = todayStocks
      .filter(s => s.production > 0 && s.stockFinal > 0 && (s.stockFinal / s.production) > 0.4)
      .map(s => s.name);
    setAlertesStock(alertes);
  }, [todayStocks]);

  const hasProduction = totalProducedToday > 0;
  const kpiColor = unsoldRateToday < 5 ? 'text-green-400' : unsoldRateToday < 10 ? 'text-amber-400' : 'text-red-400';

  return (
    <div className="space-y-4 pb-4">
      <div className="pt-2">
        <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium">Vue d'ensemble</p>
        <h1 className="text-white text-2xl font-bold mt-1 leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h1>
      </div>

      <DayCountdown workflow={workflow} onNavigate={(step) => onNavigate(phaseView[step] as ViewType)} />

      {/* CTA phase du jour */}
      <motion.button whileTap={{ scale: 0.97 }}
        onClick={() => onNavigate(phaseView[phase] as ViewType)}
        className="w-full relative overflow-hidden rounded-2xl text-left"
        style={{ background: 'linear-gradient(135deg, rgba(193,154,107,0.18) 0%, rgba(193,154,107,0.06) 100%)', border: '1px solid rgba(193,154,107,0.28)' }}>
        <div className="flex items-center gap-4 px-4 py-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(193,154,107,0.15)' }}>
            {phase === 'matin'    && <Sun    size={22} className="text-[#C19A6B]" />}
            {phase === 'snapshot' && <Camera size={22} className="text-[#C19A6B]" />}
            {phase === 'soir'     && <Moon   size={22} className="text-[#C19A6B]" />}
            {phase === 'flash'    && <Zap    size={22} className="text-[#C19A6B] fill-[#C19A6B]" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/45 text-[10px] uppercase tracking-wider font-medium">En ce moment</p>
            <p className="text-[#C19A6B] font-bold text-base mt-0.5">{currentStepLabel}</p>
            <p className="text-white/35 text-xs mt-0.5">Appuyez pour accéder →</p>
          </div>
          <ChevronRight size={16} className="text-[#C19A6B]/50 flex-shrink-0" />
        </div>
      </motion.button>

      {/* Commandes en attente */}
      {!loadingOrders && pendingCount > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <button onClick={() => onNavigate('commandes')} className="w-full text-left">
            <div className="rounded-2xl overflow-hidden border" style={{ background: 'rgba(58,123,213,0.07)', borderColor: 'rgba(58,123,213,0.2)' }}>
              <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: 'rgba(58,123,213,0.12)' }}>
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'rgba(58,123,213,0.15)' }}>
                    <ShoppingBag size={15} className="text-blue-400" />
                  </div>
                  <div>
                    <p className="text-blue-300 font-semibold text-sm">{pendingCount} commande{pendingCount > 1 ? 's' : ''} en attente</p>
                    <p className="text-blue-400/50 text-[10px]">Appuyez pour gérer</p>
                  </div>
                </div>
                <span className="text-blue-300 font-black text-lg w-8 h-8 rounded-full flex items-center justify-center" style={{ background: 'rgba(58,123,213,0.2)' }}>
                  {pendingCount}
                </span>
              </div>
              <div className="px-4 py-2 space-y-1.5">
                {pendingOrders.map(o => (
                  <div key={o.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-5 h-5 rounded-full bg-blue-400/20 flex items-center justify-center">
                        <span className="text-blue-300 text-[9px] font-bold">{(o.client_prenom ?? 'C')[0]}</span>
                      </div>
                      <span className="text-white/60 text-xs">{o.client_prenom}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-white/30 text-[10px] font-mono">{String(o.heure_retrait ?? '').slice(0, 5)}</span>
                      <span className="text-blue-300 text-xs font-mono font-bold">{Number(o.montant_total).toFixed(2)}€</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </button>
        </motion.div>
      )}

      {/* KPIs */}
      {hasProduction && (
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { label: 'CA estimé', value: `${Math.round(revenueToday)}€`,       sub: 'aujourd\'hui', color: 'text-[#C19A6B]', bg: 'rgba(193,154,107,0.08)',  border: 'rgba(193,154,107,0.18)', icon: TrendingUp },
            { label: 'Produit',   value: String(totalProducedToday),             sub: 'pièces',       color: 'text-white',      bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)', icon: Package },
            { label: 'Invendu',   value: `${unsoldRateToday.toFixed(0)}%`,       sub: `${unsoldToday} pcs`, color: kpiColor,   bg: unsoldRateToday < 5 ? 'rgba(61,158,106,0.08)' : unsoldRateToday < 10 ? 'rgba(212,137,26,0.08)' : 'rgba(196,75,75,0.08)', border: unsoldRateToday < 5 ? 'rgba(61,158,106,0.2)' : unsoldRateToday < 10 ? 'rgba(212,137,26,0.2)' : 'rgba(196,75,75,0.2)', icon: unsoldRateToday < 5 ? TrendingDown : AlertTriangle },
          ].map((kpi, i) => {
            const Icon = kpi.icon;
            return (
              <motion.div key={kpi.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                className="rounded-2xl p-3 border" style={{ background: kpi.bg, borderColor: kpi.border }}>
                <Icon size={13} className={`${kpi.color} mb-2 opacity-70`} />
                <p className={`font-bold text-xl font-mono leading-none ${kpi.color}`}>{kpi.value}</p>
                <p className="text-white/30 text-[10px] mt-1 uppercase tracking-wide">{kpi.label}</p>
                <p className="text-white/20 text-[9px]">{kpi.sub}</p>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Alerte stock */}
      {alertesStock.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-start gap-3 rounded-2xl border px-4 py-3"
          style={{ background: 'rgba(212,137,26,0.07)', borderColor: 'rgba(212,137,26,0.22)' }}>
          <AlertTriangle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-400 text-xs font-semibold">
              Risque invendu sur {alertesStock.length} produit{alertesStock.length > 1 ? 's' : ''}
            </p>
            <p className="text-amber-400/55 text-[10px] mt-0.5">{alertesStock.join(' · ')}</p>
          </div>
        </motion.div>
      )}

      {/* Sans production */}
      {!hasProduction && (
        <div className="flex flex-col items-center justify-center py-10 text-center">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)' }}>
            <Sun size={28} className="text-white/20" />
          </div>
          <p className="text-white/50 font-medium text-sm">Production non saisie</p>
          <p className="text-white/25 text-xs mt-1 leading-relaxed max-w-xs">
            Commencez par saisir la production du matin pour voir vos métriques ici.
          </p>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => onNavigate('matin')}
            className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(193,154,107,0.15)', border: '1px solid rgba(193,154,107,0.3)', color: '#C19A6B' }}>
            <Sun size={15} />
            Saisir la production →
          </motion.button>
        </div>
      )}

      {/* Accès rapides */}
      <div>
        <p className="text-white/30 text-[10px] uppercase tracking-widest mb-2.5 px-0.5 font-medium">Accès rapides</p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Commandes',    icon: ShoppingBag, view: 'commandes' as const, accent: 'rgba(58,123,213,0.12)', border: 'rgba(58,123,213,0.2)',   color: '#6FA8EA', badge: pendingCount > 0 ? pendingCount : undefined, locked: false },
            { label: 'Flash du soir',icon: Zap,         view: 'flash' as const,     accent: 'rgba(193,154,107,0.1)', border: 'rgba(193,154,107,0.2)', color: '#C19A6B', locked: !canAccessFlash },
            { label: 'Statistiques', icon: BarChart2,   view: 'dashboard' as const, accent: 'rgba(255,255,255,0.04)',border: 'rgba(255,255,255,0.08)',color: 'rgba(255,255,255,0.5)', locked: false },
            { label: 'Catalogue',    icon: BookOpen,    view: 'catalogue' as const, accent: 'rgba(255,255,255,0.04)',border: 'rgba(255,255,255,0.08)',color: 'rgba(255,255,255,0.5)', locked: false },
          ].map(item => {
            const Icon = item.icon;
            return (
              <motion.button key={item.label} whileTap={{ scale: item.locked ? 1 : 0.97 }}
                onClick={() => !item.locked && onNavigate(item.view)}
                className={`relative flex items-center gap-2.5 px-3.5 py-3 rounded-xl border text-left transition-all ${item.locked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                style={{ background: item.accent, borderColor: item.border }}>
                <Icon size={16} style={{ color: item.color }} />
                <span className="text-white/70 text-xs font-medium">{item.label}</span>
                {item.locked && <Lock size={10} className="absolute top-2 right-2 text-white/20" />}
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="absolute top-2 right-2 text-white font-bold text-[9px] min-w-[16px] h-4 flex items-center justify-center rounded-full px-1" style={{ background: '#3A7BD5' }}>
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
// Drawer "Plus"
// ─────────────────────────────────────────────────────────────

// Type étendu pour inclure 'ia' et 'supervision' qui ne sont pas des ViewTypes classiques
type DrawerItemId = 'commandes' | 'catalogue' | 'dashboard' | 'equipe' | 'parametres' | 'ia' | 'supervision';

interface DrawerItem {
  id: DrawerItemId;
  label: string;
  icon: React.ElementType;
  desc: string;
  href?: string;
  view?: ViewType;
  accent: string;
  color: string;
  permission: string | null;
}

const DRAWER_AI_ITEM: DrawerItem = {
  id:         'ia',
  label:      'Rapport IA',
  icon:       Sparkles,
  desc:       'Analyse complète par Levain, votre assistant IA',
  view:       'ia',
  accent:     'rgba(168,85,247,0.12)',
  color:      '#A855F7',
  permission: null,
};

const DRAWER_ITEMS: DrawerItem[] = [
  { id: 'commandes',  label: 'Commandes',    icon: ShoppingBag, desc: 'Click & collect et anti-gaspi du jour',  href: '/boulanger/commandes', accent: 'rgba(58,123,213,0.12)',   color: '#6FA8EA',               permission: 'commandes'  },
  { id: 'catalogue',  label: 'Produits',     icon: BookOpen,    desc: 'Gérer votre catalogue & photos',         view: 'catalogue',            accent: 'rgba(61,158,106,0.1)',    color: '#5CC994',               permission: 'catalogue'  },
  { id: 'dashboard',  label: 'Statistiques', icon: BarChart2,   desc: 'Historique & analyse performance',       view: 'dashboard',            accent: 'rgba(193,154,107,0.1)',   color: '#C19A6B',               permission: 'dashboard'  },
  { id: 'equipe',     label: 'Équipe',       icon: Users,       desc: 'Membres, invitations, rôles',            view: 'equipe',               accent: 'rgba(184,130,214,0.1)',   color: '#B882D6',               permission: 'equipe'     },
  { id: 'parametres', label: 'Paramètres',   icon: Settings,    desc: 'Flash, créneaux, adresse, plan',         view: 'parametres',           accent: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', permission: 'parametres' },
];

// Item spécial pour le dashboard supervision (gérant/owner uniquement)
const DRAWER_SUPERVISION_ITEM: DrawerItem = {
  id:         'supervision',
  label:      'Supervision',
  icon:       Shield,
  desc:       'Suivi équipe, alertes, activité',
  view:       'supervision',
  accent:     'rgba(168,85,247,0.1)',
  color:      '#A855F7',
  permission: 'equipe',  // Nécessite accès équipe
};

function PlusDrawer({
  open, onClose, onNavigate, activeView, pendingOrders,
}: {
  open: boolean;
  onClose: () => void;
  onNavigate: (v: ViewType) => void;
  activeView: ViewType;
  pendingOrders: number;
}) {
  const router = useRouter();
  const { canRead } = useBoulanger();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40" onClick={onClose} />
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto">
            <div className="border rounded-t-3xl overflow-hidden shadow-2xl"
              style={{ background: '#130B06', borderColor: 'rgba(193,154,107,0.12)' }}>
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-white/15 rounded-full" />
              </div>
              <div className="flex items-center justify-between px-5 py-2.5">
                <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold">Navigation</p>
                <button onClick={onClose} className="w-7 h-7 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <X size={13} />
                </button>
              </div>

              <div className="px-4 pb-8 space-y-2">
                {/* Rapport IA — mis en avant */}
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { onNavigate('ia'); onClose(); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all select-none"
                  style={{
                    background:   activeView === 'ia' ? 'rgba(168,85,247,0.2)' : DRAWER_AI_ITEM.accent,
                    borderColor:  activeView === 'ia' ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.2)',
                  }}>
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{ background: DRAWER_AI_ITEM.accent, border: '1px solid rgba(168,85,247,0.2)' }}>
                    <Sparkles size={18} style={{ color: DRAWER_AI_ITEM.color }} strokeWidth={1.8} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: activeView === 'ia' ? '#A855F7' : 'white' }}>
                      {DRAWER_AI_ITEM.label}
                    </p>
                    <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{DRAWER_AI_ITEM.desc}</p>
                  </div>
                  <ChevronRight size={14} style={{ color: activeView === 'ia' ? '#A855F7' : 'rgba(255,255,255,0.18)' }} />
                </motion.button>

                <div className="h-px bg-white/5 my-2" />

                {/* Supervision — owner et gérant uniquement */}
                {canRead('equipe') && (
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { onNavigate('supervision'); onClose(); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all select-none mb-2"
                    style={{
                      background:   activeView === 'supervision' ? 'rgba(168,85,247,0.2)' : DRAWER_SUPERVISION_ITEM.accent,
                      borderColor:  activeView === 'supervision' ? 'rgba(168,85,247,0.4)' : 'rgba(168,85,247,0.2)',
                    }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: DRAWER_SUPERVISION_ITEM.accent, border: '1px solid rgba(168,85,247,0.2)' }}>
                      <Shield size={18} style={{ color: DRAWER_SUPERVISION_ITEM.color }} strokeWidth={1.8} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm" style={{ color: activeView === 'supervision' ? '#A855F7' : 'white' }}>
                        {DRAWER_SUPERVISION_ITEM.label}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{DRAWER_SUPERVISION_ITEM.desc}</p>
                    </div>
                    <ChevronRight size={14} style={{ color: activeView === 'supervision' ? '#A855F7' : 'rgba(255,255,255,0.18)' }} />
                  </motion.button>
                )}

                {/* Autres items */}
                {DRAWER_ITEMS.map(item => {
                  if (item.permission && !canRead(item.permission as Parameters<typeof canRead>[0])) return null;
                  const Icon = item.icon;
                  const isActive = item.view ? activeView === item.view : false;
                  const isCmds   = item.id === 'commandes';
                  return (
                    <motion.button key={item.id} whileTap={{ scale: 0.97 }}
                      onClick={() => {
                        if (item.href)      router.push(item.href);
                        else if (item.view) onNavigate(item.view);
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border text-left transition-all select-none"
                      style={{
                        background:  isActive ? 'rgba(193,154,107,0.12)' : item.accent,
                        borderColor: isActive ? 'rgba(193,154,107,0.3)' : isCmds ? 'rgba(58,123,213,0.25)' : 'rgba(255,255,255,0.06)',
                      }}>
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 relative"
                        style={{ background: item.accent, border: `1px solid ${item.color}22` }}>
                        <Icon size={18} style={{ color: item.color }} strokeWidth={1.8} />
                        {isCmds && pendingOrders > 0 && (
                          <span className="absolute -top-1 -right-1 text-white font-black text-[9px] min-w-[16px] h-4 flex items-center justify-center rounded-full px-1"
                            style={{ background: '#3A7BD5' }}>
                            {pendingOrders}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm"
                          style={{ color: isActive ? '#C19A6B' : isCmds ? '#6FA8EA' : 'white' }}>
                          {item.label}
                        </p>
                        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.desc}</p>
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
// Nav items (bottom bar)
// ─────────────────────────────────────────────────────────────

type LocalView = 'accueil' | ViewType;

const ALL_NAV_ITEMS: {
  id: LocalView; label: string; icon: React.ElementType; flash?: boolean; permission?: string;
}[] = [
  { id: 'accueil',  label: 'Accueil', icon: Home },
  { id: 'matin',    label: 'Matin',   icon: Sun,    permission: 'matin'    },
  { id: 'snapshot', label: 'Stock',   icon: Camera, permission: 'snapshot' },
  { id: 'soir',     label: 'Soir',    icon: Moon,   permission: 'soir'     },
  { id: 'flash',    label: 'Flash',   icon: Zap, flash: true, permission: 'flash' },
];

// ─────────────────────────────────────────────────────────────
// Shell principal
// ─────────────────────────────────────────────────────────────

// Vues secondaires — utilisées pour l'état du bouton "Plus"
const SECONDARY_VIEWS: ViewType[] = ['catalogue', 'dashboard', 'parametres', 'equipe', 'ia', 'supervision'];

function AppShell() {
  const {
    isAuthenticated, authLoading,
    activeView, setActiveView,
    logout, boulangerie, userRole, canRead,
    todayStocks,
  } = useBoulanger();

  const { startTour, tourCompleted, resetTour, loading: tourLoading } = useTour();
  const router = useRouter();

  const [drawerOpen,   setDrawerOpen]   = useState(false);
  const [localView,    setLocalView]    = useState<LocalView>('accueil');
  const [pendingCount, setPendingCount] = useState(0);
  const pendingRef = useRef(0);

  // ── État de la journée depuis les stocks ──────────────────
  const productionSaisie = useMemo(() => todayStocks.some(s => s.production > 0),      [todayStocks]);
  const snapshot10hFait  = useMemo(() => todayStocks.some(s => s.snapshot10hDone),     [todayStocks]);
  const snapshot14hFait  = useMemo(() => todayStocks.some(s => s.snapshot14hDone),     [todayStocks]);

  // ── Clôture de journée ────────────────────────────────────
  const [journeeCloturee, setJourneeCloturee] = useState(false);
  useEffect(() => {
    async function checkCloture() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const todayRes = await fetch('/api/boulanger/ai/today', {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
        });
        const todayData = todayRes.ok ? await todayRes.json() as { today: string } : { today: new Date().toISOString().split('T')[0] };
        const res = await fetch('/api/boulanger/journee', {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
        });
        if (!res.ok) return;
        const { journee } = await res.json() as { journee: { cloturee: boolean; date: string } | null };
        if (journee?.cloturee && journee.date === todayData.today) setJourneeCloturee(true);
      } catch { /* silent */ }
    }
    if (isAuthenticated) checkCloture();
  }, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/boulanger/journee', {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
        });
        if (!res.ok) return;
        const { journee } = await res.json() as { journee: { cloturee: boolean } | null };
        if (journee?.cloturee) setJourneeCloturee(true);
      } catch { /* silent */ }
    }, 30_000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  // ── Timezone ──────────────────────────────────────────────
  const [timezone, setTimezone] = useState('Europe/Paris');
  useEffect(() => {
    async function loadTimezone() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const res = await fetch('/api/boulanger/ai/today', {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
        });
        if (res.ok) {
          const data = await res.json() as { timezone?: string };
          if (data.timezone) setTimezone(data.timezone);
        }
      } catch { /* silent */ }
    }
    if (isAuthenticated) loadTimezone();
  }, [isAuthenticated]);

  // ── Workflow journée ──────────────────────────────────────
  const workflow = useWorkflowJournee({ productionSaisie, snapshot10hFait, snapshot14hFait, journeeCloturee, timezone });

  // Le bouton "Plus" est actif si on est sur une vue secondaire (y compris 'ia')
  const isSecondaryActive = SECONDARY_VIEWS.includes(activeView);

  // ── Compteur commandes en attente ─────────────────────────
  useEffect(() => {
    if (!isAuthenticated) return;
    async function loadCount() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const today = new Date().toISOString().split('T')[0];
        const res = await fetch(`/api/boulanger/commandes?date=${today}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store',
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

  const handleNavClick = useCallback((v: LocalView) => {
    setLocalView(v);
    if (v !== 'accueil') setActiveView(v as ViewType);
  }, [setActiveView]);

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
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#1A0F0A' }}>
        <div className="text-center">
          <span className="text-4xl block mb-4">🥖</span>
          <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginForm />;

  if (!boulangerie || !userRole) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: '#1A0F0A' }}>
        <div className="text-center">
          <Shield size={40} className="text-white/20 mx-auto mb-4" />
          <p className="text-white/70 text-lg font-semibold" style={{ fontFamily: 'Playfair Display, serif' }}>
            Accès non autorisé
          </p>
          <p className="text-white/40 text-sm mt-2 max-w-xs mx-auto leading-relaxed">
            Cet espace est réservé aux boulangers inscrits sur BakeryOS.
          </p>
          <button onClick={() => router.push('/')}
            className="mt-6 px-6 py-3 rounded-xl font-semibold text-sm"
            style={{ background: '#C19A6B', color: '#1A0F0A' }}>
            Retour à la vitrine
          </button>
          <button onClick={logout} className="block mx-auto mt-3 text-white/25 text-xs hover:text-white/50">
            Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  const navItems = ALL_NAV_ITEMS.filter(n =>
    n.id === 'accueil' || !n.permission || canRead(n.permission as Parameters<typeof canRead>[0])
  ).slice(0, 5);

  // ── Interface principale ───────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#1A0F0A' }}>
      {/* Texture grain */}
      <div className="fixed inset-0 opacity-[0.022] pointer-events-none z-0"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
        style={{ background: 'rgba(18,10,6,0.92)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
              style={{ background: 'rgba(193,154,107,0.15)', border: '1px solid rgba(193,154,107,0.2)' }}>
              🥖
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-bold leading-none truncate" style={{ fontFamily: 'Playfair Display, serif' }}>
                {boulangerie.nom}
              </p>
              <p className="text-[10px] tracking-widest uppercase leading-none mt-0.5"
                style={{ color: userRole === 'owner' ? 'rgba(193,154,107,0.6)' : userRole === 'gerant' ? 'rgba(106,168,234,0.7)' : 'rgba(255,255,255,0.3)' }}>
                {userRole === 'owner' ? 'Espace boulanger' : ROLE_LABELS[userRole]}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <SyncIndicator />
            <LiveClock />
            {!tourLoading && userRole === 'owner' && (
              <button onClick={tourCompleted ? resetTour : startTour}
                className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.25)' }}>
                <HelpCircle size={14} />
              </button>
            )}
            <button onClick={logout}
              className="w-8 h-8 rounded-xl flex items-center justify-center transition-all"
              style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)', color: 'rgba(255,255,255,0.25)' }}>
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="relative z-10 max-w-lg mx-auto px-4 pt-20 pb-32">
        <AnimatePresence mode="wait">
          <motion.div key={localView} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}>

            {localView === 'accueil' && (
              <VueAccueil onNavigate={handleDeepNavigate} workflow={workflow} />
            )}

            {localView === 'matin' && (
              canRead('matin') ? <VueMatin /> : <ViewBlocked />
            )}

            {localView === 'snapshot' && (
              !canRead('snapshot') ? <ViewBlocked /> :
              <WorkflowGuard step="snapshot" canAccess={workflow.canAccessSnapshot} blockReason={workflow.snapshotBlockReason}
                onNavigate={(step) => handleNavClick(step as LocalView)}>
                <VueSnapshot />
              </WorkflowGuard>
            )}

            {localView === 'soir' && (
              !canRead('soir') ? <ViewBlocked /> :
              <WorkflowGuard step="soir" canAccess={workflow.canAccessSoir} blockReason={workflow.soirBlockReason}
                onNavigate={(step) => handleNavClick(step as LocalView)}>
                <VueSoir />
              </WorkflowGuard>
            )}

            {localView === 'flash' && (
              !canRead('flash') ? <ViewBlocked /> :
              <WorkflowGuard step="flash" canAccess={workflow.canAccessFlash} blockReason={workflow.flashBlockReason}
                onNavigate={(step) => handleNavClick(step as LocalView)}>
                <VueFlash />
              </WorkflowGuard>
            )}

            {localView === 'catalogue'  && (canRead('catalogue')  ? <Catalogue />     : <ViewBlocked />)}
            {localView === 'dashboard'  && (canRead('dashboard')  ? <Dashboard />     : <ViewBlocked />)}
            {localView === 'parametres' && (canRead('parametres') ? <Parametres />    : <ViewBlocked />)}
            {localView === 'equipe'     && (canRead('equipe')     ? <EquipeManager /> : <ViewBlocked />)}

            {/* Vue Rapport IA — accessible à tous les rôles ayant accès au dashboard */}
            {localView === 'ia' && <VueRapportIA />}

            {/* Vue Supervision — owner et gérant uniquement */}
            {localView === 'supervision' && (
              canRead('equipe') ? (
                <DashboardSupervision isOwner={userRole === 'owner'} />
              ) : (
                <ViewBlocked />
              )
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md"
        style={{ background: 'rgba(18,10,6,0.97)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="grid w-full max-w-lg mx-auto"
          style={{ gridTemplateColumns: `repeat(${navItems.length + 1}, 1fr)`, height: '72px' }}>
          {navItems.map(item => {
            const Icon = item.icon;
            const isActive  = localView === item.id;
            const isAccueil = item.id === 'accueil';
            const isLocked  =
              (item.id === 'snapshot' && !workflow.canAccessSnapshot) ||
              (item.id === 'flash'    && !workflow.canAccessFlash)    ||
              (item.id === 'soir'     && !workflow.canAccessSoir);

            return (
              <motion.button key={item.id} onClick={() => handleNavClick(item.id as LocalView)}
                whileTap={{ scale: 0.86 }}
                className="flex flex-col items-center justify-center gap-1.5 touch-manipulation select-none relative">
                <motion.div className="relative flex flex-col items-center gap-1 px-2.5 py-2 rounded-2xl"
                  animate={{
                    background: isActive
                      ? item.flash ? 'rgba(234,196,58,0.15)' : isAccueil ? 'rgba(255,255,255,0.07)' : 'rgba(193,154,107,0.15)'
                      : 'transparent',
                  }}>
                  {isLocked && !isActive && (
                    <div className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-[#1A0F0A] flex items-center justify-center">
                      <Lock size={8} className="text-white/30" />
                    </div>
                  )}
                  <Icon size={21} strokeWidth={isActive ? 2.3 : 1.6}
                    style={{ color: isActive ? (item.flash ? '#EAC43A' : isAccueil ? 'rgba(255,255,255,0.8)' : '#C19A6B') : isLocked ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)' }} />
                  <span className="text-[9px] font-bold leading-none"
                    style={{ color: isActive ? (item.flash ? '#EAC43A' : isAccueil ? 'rgba(255,255,255,0.8)' : '#C19A6B') : isLocked ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)' }}>
                    {item.label}
                  </span>
                </motion.div>
              </motion.button>
            );
          })}

          {/* Bouton "Plus" — reflète aussi la vue 'ia' */}
          <motion.button onClick={() => setDrawerOpen(true)} whileTap={{ scale: 0.86 }}
            className="flex flex-col items-center justify-center gap-1.5 touch-manipulation select-none">
            <div className="relative flex flex-col items-center gap-1 px-2.5 py-2 rounded-2xl"
              style={{ background: isSecondaryActive ? 'rgba(193,154,107,0.15)' : 'transparent' }}>
              {isSecondaryActive ? (
                <>
                  {activeView === 'catalogue'  && <BookOpen  size={21} strokeWidth={2.3} style={{ color: '#C19A6B' }} />}
                  {activeView === 'dashboard'  && <BarChart2 size={21} strokeWidth={2.3} style={{ color: '#C19A6B' }} />}
                  {activeView === 'parametres' && <Settings  size={21} strokeWidth={2.3} style={{ color: '#C19A6B' }} />}
                  {activeView === 'equipe'     && <Users     size={21} strokeWidth={2.3} style={{ color: '#C19A6B' }} />}
                  {activeView === 'ia'         && <Sparkles  size={21} strokeWidth={2.3} style={{ color: '#A855F7' }} />}
                  <span className="text-[9px] font-bold leading-none"
                    style={{ color: activeView === 'ia' ? '#A855F7' : '#C19A6B' }}>
                    {activeView === 'catalogue' ? 'Produits' : activeView === 'dashboard' ? 'Stats' : activeView === 'equipe' ? 'Équipe' : activeView === 'ia' ? 'Levain' : 'Config'}
                  </span>
                </>
              ) : (
                <>
                  {pendingCount > 0 && (
                    <span className="absolute top-1 right-1 text-white font-black text-[9px] min-w-[15px] h-[15px] flex items-center justify-center rounded-full"
                      style={{ background: '#3A7BD5' }}>
                      {pendingCount > 9 ? '9+' : pendingCount}
                    </span>
                  )}
                  <MoreHorizontal size={21} strokeWidth={1.6} style={{ color: 'rgba(255,255,255,0.4)' }} />
                  <span className="text-[9px] font-bold leading-none" style={{ color: 'rgba(255,255,255,0.4)' }}>Plus</span>
                </>
              )}
            </div>
          </motion.button>
        </div>
      </nav>

      {/* Drawer Plus */}
      <PlusDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={v => { setLocalView(v); setActiveView(v); }}
        activeView={activeView}
        pendingOrders={pendingCount}
      />

      {/* Tour guidé */}
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