'use client';
// app/boulanger/page.tsx — Sauve Mie · Workflow Journée v2
// ─────────────────────────────────────────────────────────────
// Modifications vs v1 :
//   ✦ Workflow chronologique strict : Matin → Stock → Flash → Soir
//   ✦ Compte à rebours jusqu'à minuit (fin de journée)
//   ✦ Blocage des onglets non encore accessibles
//   ✦ DayCountdown intégré dans la vue Accueil
//   ✦ WorkflowGuard sur chaque vue protégée
//   ✦ Vue 'ia' accessible depuis le Drawer "Plus"
// Phase 4 (04/04) :
//   ✦ PlusDrawer restructuré : QUOTIDIEN / GESTION / ADMINISTRATION
//   ✦ Items du drawer compactés (py-3, icônes w-9 h-9)

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun, Camera, Moon, Zap, LogOut, CloudOff,
  Check, Loader2, HelpCircle, BookOpen,
  BarChart2, Settings, X, ChevronRight, ShoppingBag,
  Shield, Users, TrendingUp, TrendingDown, AlertTriangle,
  Package, Home, Lock, Sparkles, CalendarDays, Menu, Palette,
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
// isOwner supprimé — le rôle est désormais géré via BoulangerContext.userRole
import Parametres    from '@/components/boulanger/parametres';
import VitrinEditor  from '@/components/boulanger/vitrine-editor';
import EquipeManager from '@/components/boulanger/equipe-manager';
import TourWizard, { useTour } from '@/components/boulanger/tour-wizard';
import OnboardingWizard from '@/components/boulanger/onboarding-wizard';
import WorkflowGuard from '@/components/boulanger/workflow-guard';
import VueJournee, { STEP_CONFIG } from '@/components/boulanger/vue-journee';
import { useWorkflowJournee } from '@/hooks/use-workflow-journee';
import type { ViewType, PermissionKey } from '@/lib/types';
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
  onNavigate: (v: ViewType | 'commandes' | 'journee') => void;
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
    productionSaisie, snapshot14hFait,
    journeeCloturee, flashConfigured,
    canAccessSnapshot, canAccessFlash, canAccessSoir,
    currentSuggestedStep, currentStepLabel,
  } = workflow;

  const phase = currentSuggestedStep;

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

  const workflowDots: { id: string; icon: React.ElementType; label: string; done: boolean; active: boolean; locked: boolean; color: string }[] = [
    { id: 'matin',    icon: Sun,    label: 'Matin', done: productionSaisie, active: phase === 'matin' && !productionSaisie, locked: false,              color: '#C19A6B' },
    { id: 'snapshot', icon: Camera, label: 'Stock', done: snapshot14hFait,  active: phase === 'snapshot',                   locked: !canAccessSnapshot, color: '#5CC994' },
    { id: 'flash',    icon: Zap,    label: 'Flash', done: flashConfigured,  active: phase === 'flash',                      locked: !canAccessFlash,    color: '#EAC43A' },
    { id: 'soir',     icon: Moon,   label: 'Soir',  done: journeeCloturee,  active: phase === 'soir',                       locked: !canAccessSoir,     color: '#6FA8EA' },
  ];

  const stepConfig = STEP_CONFIG.find(s => s.id === phase);

  return (
    <div className="space-y-4 pb-4">
      {/* En-tête date */}
      <div className="pt-2">
        <h1 className="text-white text-2xl font-bold leading-tight" style={{ fontFamily: 'Playfair Display, serif' }}>
          {new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
        </h1>
      </div>

      {/* Carte hero */}
      <motion.button whileTap={{ scale: 0.97 }}
        onClick={() => onNavigate('journee')}
        className="w-full relative overflow-hidden rounded-2xl text-left"
        style={{
          background: `linear-gradient(135deg, ${stepConfig?.color ?? '#C19A6B'}22 0%, ${stepConfig?.color ?? '#C19A6B'}08 100%)`,
          border: `1px solid ${stepConfig?.color ?? '#C19A6B'}40`,
        }}>
        <div className="flex items-center gap-4 px-5 py-5">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${stepConfig?.color ?? '#C19A6B'}20` }}>
            {phase === 'matin'    && <Sun    size={26} style={{ color: stepConfig?.color }} />}
            {phase === 'snapshot' && <Camera size={26} style={{ color: stepConfig?.color }} />}
            {phase === 'soir'     && <Moon   size={26} style={{ color: stepConfig?.color }} />}
            {phase === 'flash'    && <Zap    size={26} style={{ color: stepConfig?.color }} />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white/50 text-[11px] uppercase tracking-wider font-medium">
              {journeeCloturee ? 'Journée terminée' : 'À faire maintenant'}
            </p>
            <p className="font-bold text-lg mt-0.5" style={{ color: stepConfig?.color ?? '#C19A6B' }}>
              {currentStepLabel}
            </p>
          </div>
          <ChevronRight size={18} style={{ color: `${stepConfig?.color ?? '#C19A6B'}80` }} className="flex-shrink-0" />
        </div>
      </motion.button>

      {/* Workflow dots */}
      <div className="flex items-center gap-1.5 px-1">
        {workflowDots.map((dot, i) => {
          const Icon = dot.icon;
          return (
            <React.Fragment key={dot.id}>
              {i > 0 && (
                <div className="flex-shrink-0 w-4 h-px" style={{
                  background: workflowDots[i - 1].done ? 'rgba(92,201,148,0.4)' : 'rgba(255,255,255,0.08)',
                }} />
              )}
              <div className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all ${dot.locked ? 'opacity-30' : ''}`}
                style={{ background: dot.done ? 'rgba(92,201,148,0.08)' : dot.active ? `${dot.color}12` : 'transparent' }}>
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{
                  background: dot.done ? 'rgba(92,201,148,0.2)' : dot.active ? `${dot.color}25` : 'rgba(255,255,255,0.06)',
                }}>
                  {dot.done   ? <Check size={11} className="text-green-400" />
                  : dot.locked ? <Lock  size={9}  className="text-white/20"  />
                  : <Icon size={11} style={{ color: dot.active ? dot.color : 'rgba(255,255,255,0.35)' }} />}
                </div>
                <span className={`text-[10px] font-semibold ${
                  dot.done ? 'text-green-400/70' : dot.active ? '' : dot.locked ? 'text-white/15' : 'text-white/30'
                }`} style={dot.active && !dot.done ? { color: dot.color } : undefined}>
                  {dot.label}
                </span>
                {dot.active && !dot.done && (
                  <motion.div animate={{ scale: [1, 1.4, 1] }} transition={{ duration: 1.5, repeat: Infinity }}
                    className="w-1.5 h-1.5 rounded-full" style={{ background: dot.color }} />
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* KPI inline */}
      {hasProduction && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center justify-between rounded-xl px-4 py-3 border"
          style={{ background: 'rgba(255,255,255,0.025)', borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-1.5">
            <TrendingUp size={14} className="text-[#C19A6B] opacity-70" />
            <span className="text-[#C19A6B] font-bold text-base font-mono">{Math.round(revenueToday)}€</span>
            <span className="text-white/25 text-[10px] ml-0.5">CA</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-1.5">
            <Package size={13} className="text-white/40" />
            <span className="text-white/70 font-bold text-sm font-mono">{totalProducedToday}</span>
            <span className="text-white/25 text-[10px]">pcs</span>
          </div>
          <div className="w-px h-4 bg-white/10" />
          <div className="flex items-center gap-1.5">
            {unsoldRateToday < 5
              ? <TrendingDown size={13} className="text-green-400 opacity-70" />
              : <AlertTriangle size={13} className={kpiColor + ' opacity-70'} />}
            <span className={`font-bold text-sm font-mono ${kpiColor}`}>{unsoldRateToday.toFixed(0)}%</span>
            <span className="text-white/25 text-[10px]">inv.</span>
          </div>
        </motion.div>
      )}

      {/* Commandes en attente */}
      {!loadingOrders && pendingCount > 0 && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <button onClick={() => onNavigate('commandes')} className="w-full text-left">
            <div className="rounded-2xl overflow-hidden border"
              style={{ background: 'rgba(58,123,213,0.07)', borderColor: 'rgba(58,123,213,0.2)' }}>
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                    style={{ background: 'rgba(58,123,213,0.15)' }}>
                    <ShoppingBag size={15} className="text-blue-400" />
                  </div>
                  <p className="text-blue-300 font-semibold text-sm">
                    {pendingCount} commande{pendingCount > 1 ? 's' : ''} en attente
                  </p>
                </div>
                <ChevronRight size={14} className="text-blue-400/40" />
              </div>
            </div>
          </button>
        </motion.div>
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
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <p className="text-white/25 text-xs leading-relaxed max-w-xs">
            Saisissez la production du matin pour voir vos métriques.
          </p>
          <motion.button whileTap={{ scale: 0.97 }} onClick={() => onNavigate('journee')}
            className="mt-4 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(193,154,107,0.15)', border: '1px solid rgba(193,154,107,0.3)', color: '#C19A6B' }}>
            <Sun size={15} />
            Commencer la journée
          </motion.button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Drawer "Plus" — Phase 4 : groupement QUOTIDIEN / GESTION / ADMINISTRATION
// ─────────────────────────────────────────────────────────────

type DrawerItemId = 'commandes' | 'catalogue' | 'dashboard' | 'equipe' | 'parametres' | 'ia' | 'supervision' | 'vitrine';

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
  id: 'ia', label: 'Rapport IA', icon: Sparkles,
  desc: 'Analyse complète par Levain, votre assistant IA',
  view: 'ia', accent: 'rgba(168,85,247,0.12)', color: '#A855F7', permission: null,
};

const DRAWER_ITEMS: DrawerItem[] = [
  { id: 'commandes',  label: 'Commandes',    icon: ShoppingBag, desc: 'Click & collect et anti-gaspi du jour',  href: '/boulanger/commandes', accent: 'rgba(58,123,213,0.12)',  color: '#6FA8EA',               permission: 'commandes'  },
  { id: 'catalogue',  label: 'Produits',     icon: BookOpen,    desc: 'Gérer votre catalogue & photos',         view: 'catalogue',            accent: 'rgba(61,158,106,0.1)',   color: '#5CC994',               permission: 'catalogue'  },
  { id: 'dashboard',  label: 'Statistiques', icon: BarChart2,   desc: 'Historique & analyse performance',       view: 'dashboard',            accent: 'rgba(193,154,107,0.1)',  color: '#C19A6B',               permission: 'dashboard'  },
  { id: 'vitrine',    label: 'Vitrine',      icon: Palette,     desc: 'Personnaliser votre page d\'accueil',    view: 'vitrine',              accent: 'rgba(236,149,81,0.1)',   color: '#EC9551',               permission: null         },
  { id: 'equipe',     label: 'Équipe',       icon: Users,       desc: 'Membres, invitations, rôles',            view: 'equipe',               accent: 'rgba(184,130,214,0.1)',  color: '#B882D6',               permission: 'equipe'     },
  { id: 'parametres', label: 'Paramètres',   icon: Settings,    desc: 'Flash, créneaux, adresse, plan',         view: 'parametres',           accent: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.5)', permission: 'parametres' },
];

const DRAWER_SUPERVISION_ITEM: DrawerItem = {
  id: 'supervision', label: 'Supervision', icon: Shield,
  desc: 'Suivi équipe, alertes, activité',
  view: 'supervision', accent: 'rgba(168,85,247,0.1)', color: '#A855F7', permission: 'equipe',
};

// Helper pour rendre un item du drawer
function DrawerItemButton({
  item, isActive, isCmds, pendingOrders, onClick, activeColor,
}: {
  item: DrawerItem;
  isActive: boolean;
  isCmds?: boolean;
  pendingOrders?: number;
  onClick: () => void;
  activeColor?: string; // couleur custom quand actif (ex: violet pour IA/Supervision)
}) {
  const Icon = item.icon;
  const accentColor = activeColor ?? '#C19A6B';
  return (
    <motion.button whileTap={{ scale: 0.97 }} onClick={onClick}
      className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl border text-left transition-all select-none"
      style={{
        background:  isActive ? `${accentColor}20` : item.accent,
        borderColor: isActive ? `${accentColor}40` : isCmds ? 'rgba(58,123,213,0.25)' : `${item.color}20`,
      }}>
      <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 relative"
        style={{ background: item.accent, border: `1px solid ${item.color}22` }}>
        <Icon size={16} style={{ color: item.color }} strokeWidth={1.8} />
        {isCmds && pendingOrders && pendingOrders > 0 && (
          <span className="absolute -top-1 -right-1 text-white font-black text-[9px] min-w-[15px] h-[15px] flex items-center justify-center rounded-full px-0.5"
            style={{ background: '#3A7BD5' }}>
            {pendingOrders}
          </span>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm" style={{ color: isActive ? accentColor : isCmds ? '#6FA8EA' : 'white' }}>
          {item.label}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: 'rgba(255,255,255,0.3)' }}>{item.desc}</p>
      </div>
      <ChevronRight size={13} style={{ color: isActive ? accentColor : 'rgba(255,255,255,0.18)' }} />
    </motion.button>
  );
}

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="px-1 pt-3 pb-1.5 text-[9px] font-bold uppercase tracking-widest"
      style={{ color: 'rgba(255,255,255,0.22)' }}>
      {label}
    </p>
  );
}

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
  const { canRead, userRole } = useBoulanger();

  const navigate = (item: DrawerItem) => {
    if (item.href)      router.push(item.href);
    else if (item.view) onNavigate(item.view);
    onClose();
  };

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

              {/* Handle + titre */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-white/15 rounded-full" />
              </div>
              <div className="flex items-center justify-between px-5 py-2">
                <p className="text-white/40 text-[10px] uppercase tracking-widest font-semibold">Navigation</p>
                <button onClick={onClose}
                  className="w-7 h-7 rounded-xl flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                  style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <X size={13} />
                </button>
              </div>

              <div className="px-4 pb-8">

                {/* ── QUOTIDIEN ────────────────────────────────── */}
                <SectionLabel label="Quotidien" />

                {/* Rapport IA */}
                <DrawerItemButton
                  item={DRAWER_AI_ITEM}
                  isActive={activeView === 'ia'}
                  activeColor="#A855F7"
                  onClick={() => { onNavigate('ia'); onClose(); }}
                />

                {/* Commandes */}
                {canRead('commandes') && (() => {
                  const item = DRAWER_ITEMS.find(d => d.id === 'commandes')!;
                  return (
                    <DrawerItemButton key="commandes" item={item}
                      isActive={false} isCmds pendingOrders={pendingOrders}
                      onClick={() => navigate(item)} />
                  );
                })()}

                {/* ── GESTION ──────────────────────────────────── */}
                <SectionLabel label="Gestion" />

                {(['catalogue', 'dashboard', 'vitrine'] as DrawerItemId[]).map(id => {
                  const item = DRAWER_ITEMS.find(d => d.id === id);
                  if (!item) return null;
                  if (item.permission && !canRead(item.permission as Parameters<typeof canRead>[0])) return null;
                  // Vitrine : owner uniquement
                  if (id === 'vitrine' && userRole !== 'owner') return null;
                  return (
                    <DrawerItemButton key={id} item={item}
                      isActive={item.view ? activeView === item.view : false}
                      onClick={() => navigate(item)} />
                  );
                })}

                {/* ── ADMINISTRATION ───────────────────────────── */}
                {(canRead('equipe') || canRead('parametres')) && (
                  <SectionLabel label="Administration" />
                )}

                {/* Équipe */}
                {canRead('equipe') && (() => {
                  const item = DRAWER_ITEMS.find(d => d.id === 'equipe')!;
                  return (
                    <DrawerItemButton key="equipe" item={item}
                      isActive={activeView === item.view}
                      onClick={() => navigate(item)} />
                  );
                })()}

                {/* Supervision */}
                {canRead('equipe') && (
                  <DrawerItemButton
                    item={DRAWER_SUPERVISION_ITEM}
                    isActive={activeView === 'supervision'}
                    activeColor="#A855F7"
                    onClick={() => { onNavigate('supervision'); onClose(); }}
                  />
                )}

                {/* Paramètres */}
                {canRead('parametres') && (() => {
                  const item = DRAWER_ITEMS.find(d => d.id === 'parametres')!;
                  return (
                    <DrawerItemButton key="parametres" item={item}
                      isActive={activeView === item.view}
                      onClick={() => navigate(item)} />
                  );
                })()}

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

type LocalView = 'accueil' | 'journee' | ViewType;

const ALL_NAV_ITEMS: { id: LocalView; label: string; icon: React.ElementType }[] = [
  { id: 'accueil', label: 'Accueil',    icon: Home },
  { id: 'journee', label: 'Ma Journée', icon: CalendarDays },
];

// Vues secondaires — accessible via le drawer Menu
const SECONDARY_VIEWS: ViewType[] = ['catalogue', 'dashboard', 'parametres', 'equipe', 'ia', 'supervision', 'vitrine'];

// ─────────────────────────────────────────────────────────────
// Shell principal
// ─────────────────────────────────────────────────────────────

function AppShell() {
  const {
    isAuthenticated, authLoading,
    activeView, setActiveView,
    logout, boulangerie, userRole, canRead,
    todayStocks, session,
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
        const todayData = todayRes.ok
          ? await todayRes.json() as { today: string }
          : { today: new Date().toISOString().split('T')[0] };
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
    if (v !== 'accueil' && v !== 'journee') setActiveView(v as ViewType);
  }, [setActiveView]);

  const handleDeepNavigate = useCallback((v: ViewType | 'commandes' | 'journee') => {
    if (v === 'commandes') {
      router.push('/boulanger/commandes');
    } else if (v === 'journee') {
      setLocalView('journee');
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
            Cet espace est réservé aux boulangers inscrits sur Sauve Mie.
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

  if (boulangerie && userRole === 'owner' && !boulangerie.onboarding_completed_at) {
    return (
      <OnboardingWizard
        boulangerie={boulangerie}
        token={session?.access_token || ''}
        onComplete={() => window.location.reload()}
      />
    );
  }

  // ── Interface principale ───────────────────────────────────
  return (
    <div className="min-h-screen" style={{ background: '#1A0F0A' }}>
      {/* Texture grain */}
      <div className="fixed inset-0 opacity-[0.022] pointer-events-none z-0"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")` }} />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 backdrop-blur-md"
        style={{ background: 'rgba(18,10,6,0.92)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto px-4 md:px-6 lg:px-8 h-14 flex items-center gap-3">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 text-base"
              style={{ background: 'rgba(193,154,107,0.15)', border: '1px solid rgba(193,154,107,0.2)' }}>
              🥖
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-bold leading-none truncate" style={{ fontFamily: 'Playfair Display, serif' }}>
                {boulangerie.nom}
              </p>
              <p className="text-[10px] tracking-widest uppercase leading-none mt-0.5" style={{
                color: userRole === 'owner'  ? 'rgba(193,154,107,0.6)'
                     : userRole === 'gerant' ? 'rgba(106,168,234,0.7)'
                     : 'rgba(255,255,255,0.3)',
              }}>
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
      <main className="relative z-10 max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto px-4 md:px-6 lg:px-8 pt-20 pb-32">
        <AnimatePresence mode="wait">
          <motion.div key={localView}
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}>

            {localView === 'accueil' && (
              <VueAccueil onNavigate={handleDeepNavigate} workflow={workflow} />
            )}

            {localView === 'journee' && (
              <VueJournee workflow={workflow} canRead={canRead}
                onNavigateStep={(step) => handleNavClick(step as LocalView)} />
            )}

            {/* Accès direct legacy (deep links) */}
            {localView === 'matin' && (canRead('matin') ? <VueMatin /> : <ViewBlocked />)}

            {localView === 'snapshot' && (
              !canRead('snapshot') ? <ViewBlocked /> :
              <WorkflowGuard step="snapshot" canAccess={workflow.canAccessSnapshot}
                blockReason={workflow.snapshotBlockReason}
                onNavigate={(step) => handleNavClick(step as LocalView)}>
                <VueSnapshot />
              </WorkflowGuard>
            )}

            {localView === 'soir' && (
              !canRead('soir') ? <ViewBlocked /> :
              <WorkflowGuard step="soir" canAccess={workflow.canAccessSoir}
                blockReason={workflow.soirBlockReason}
                onNavigate={(step) => handleNavClick(step as LocalView)}>
                <VueSoir />
              </WorkflowGuard>
            )}

            {localView === 'flash' && (
              !canRead('flash') ? <ViewBlocked /> :
              <WorkflowGuard step="flash" canAccess={workflow.canAccessFlash}
                blockReason={workflow.flashBlockReason}
                onNavigate={(step) => handleNavClick(step as LocalView)}>
                <VueFlash />
              </WorkflowGuard>
            )}

            {localView === 'catalogue'  && (canRead('catalogue')  ? <Catalogue />     : <ViewBlocked />)}
            {localView === 'dashboard'  && (canRead('dashboard')  ? <Dashboard />     : <ViewBlocked />)}
            {localView === 'parametres' && (canRead('parametres') ? <Parametres />    : <ViewBlocked />)}
            {localView === 'equipe'     && (canRead('equipe')     ? <EquipeManager /> : <ViewBlocked />)}
            {localView === 'vitrine'    && (userRole === 'owner' ? <VitrinEditor /> : <ViewBlocked />)}
            {localView === 'ia'         && <VueRapportIA />}
            {localView === 'supervision' && (
              canRead('equipe')
                ? <DashboardSupervision isOwner={userRole === 'owner'} />
                : <ViewBlocked />
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-md"
        style={{ background: 'rgba(18,10,6,0.97)', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <div className="grid w-full max-w-lg md:max-w-3xl lg:max-w-5xl mx-auto"
          style={{ gridTemplateColumns: 'repeat(3, 1fr)', height: '72px' }}>
          {ALL_NAV_ITEMS.map(item => {
            const Icon = item.icon;
            const isActive = localView === item.id;
            return (
              <motion.button key={item.id} onClick={() => handleNavClick(item.id as LocalView)}
                whileTap={{ scale: 0.86 }}
                className="flex flex-col items-center justify-center gap-1.5 touch-manipulation select-none">
                <motion.div className="flex flex-col items-center gap-1 px-3 py-2 rounded-2xl"
                  animate={{
                    background: isActive
                      ? item.id === 'accueil' ? 'rgba(255,255,255,0.07)' : 'rgba(193,154,107,0.15)'
                      : 'transparent',
                  }}>
                  <Icon size={22} strokeWidth={isActive ? 2.3 : 1.6}
                    style={{ color: isActive ? (item.id === 'accueil' ? 'rgba(255,255,255,0.85)' : '#C19A6B') : 'rgba(255,255,255,0.4)' }} />
                  <span className="text-[10px] font-bold leading-none"
                    style={{ color: isActive ? (item.id === 'accueil' ? 'rgba(255,255,255,0.85)' : '#C19A6B') : 'rgba(255,255,255,0.4)' }}>
                    {item.label}
                  </span>
                </motion.div>
              </motion.button>
            );
          })}

          {/* Bouton Menu */}
          <motion.button onClick={() => setDrawerOpen(true)} whileTap={{ scale: 0.86 }}
            className="flex flex-col items-center justify-center gap-1.5 touch-manipulation select-none">
            <div className="relative flex flex-col items-center gap-1 px-3 py-2 rounded-2xl"
              style={{ background: isSecondaryActive ? 'rgba(193,154,107,0.15)' : 'transparent' }}>
              {pendingCount > 0 && (
                <span className="absolute top-0.5 right-0.5 text-white font-black text-[9px] min-w-[16px] h-[16px] flex items-center justify-center rounded-full"
                  style={{ background: '#3A7BD5' }}>
                  {pendingCount > 9 ? '9+' : pendingCount}
                </span>
              )}
              <Menu size={22} strokeWidth={isSecondaryActive ? 2.3 : 1.6}
                style={{ color: isSecondaryActive ? '#C19A6B' : 'rgba(255,255,255,0.4)' }} />
              <span className="text-[10px] font-bold leading-none"
                style={{ color: isSecondaryActive ? '#C19A6B' : 'rgba(255,255,255,0.4)' }}>
                Menu
              </span>
            </div>
          </motion.button>
        </div>
      </nav>

      {/* Drawer */}
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