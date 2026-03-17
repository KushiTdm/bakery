'use client';
// app/boulanger/page.tsx — mise à jour avec onglet Flash dans la nav

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun, Camera, Moon, Zap,
  LogOut, Cloud, CloudOff, Check, Loader2,
  HelpCircle, MoreHorizontal, BookOpen, BarChart2,
  Settings, X, ChevronRight,
} from 'lucide-react';
import { BoulangerProvider, useBoulanger } from '@/context/boulanger-context';
import LoginForm    from '@/components/boulanger/login-form';
import VueMatin     from '@/components/boulanger/vue-matin';
import VueSnapshot  from '@/components/boulanger/vue-snapshot';
import VueSoir      from '@/components/boulanger/vue-soir';
import VueFlash     from '@/components/boulanger/vue-flash';
import Dashboard    from '@/components/boulanger/dashboard';
import Catalogue    from '@/components/boulanger/catalogue';
import Parametres   from '@/components/boulanger/parametres';
import TourWizard, { useTour } from '@/components/boulanger/tour-wizard';
import type { ViewType } from '@/context/boulanger-context';

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

function SyncIndicator() {
  const { syncStatus } = useBoulanger();
  const icons = {
    idle:   <Cloud size={13} className="text-white/20" />,
    saving: <Loader2 size={13} className="text-[#C19A6B]/70 animate-spin" />,
    saved:  <Check size={13} className="text-green-400" />,
    error:  <CloudOff size={13} className="text-red-400" />,
  };
  const labels: Record<string, string> = {
    idle: '', saving: 'Sync…', saved: 'Sauvegardé', error: 'Hors ligne',
  };
  return (
    <div className="flex items-center gap-1.5">
      {icons[syncStatus]}
      {labels[syncStatus] && (
        <span className={`text-[10px] font-medium ${
          syncStatus === 'saved' ? 'text-green-400' :
          syncStatus === 'error' ? 'text-red-400' : 'text-[#C19A6B]/70'
        }`}>
          {labels[syncStatus]}
        </span>
      )}
    </div>
  );
}

// ─── Drawer "Plus" ─────────────────────────────────────────────

const SECONDARY_ITEMS: { id: ViewType; label: string; icon: React.ElementType; desc: string }[] = [
  { id: 'catalogue',  label: 'Produits',     icon: BookOpen,  desc: 'Gérer votre catalogue' },
  { id: 'dashboard',  label: 'Statistiques', icon: BarChart2, desc: 'Historique & performance' },
  { id: 'parametres', label: 'Paramètres',   icon: Settings,  desc: 'Flash, créneaux, adresse' },
];

function PlusDrawer({
  open, onClose, onNavigate, activeView,
}: {
  open: boolean; onClose: () => void; onNavigate: (v: ViewType) => void; activeView: ViewType;
}) {
  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/65 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto"
          >
            <div className="bg-[#130B06] border border-white/10 rounded-t-3xl overflow-hidden shadow-2xl">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>
              <div className="flex items-center justify-between px-5 py-3">
                <p className="text-white/50 text-xs uppercase tracking-widest font-medium">
                  Gestion & paramètres
                </p>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-xl bg-white/5 flex items-center justify-center text-white/30 hover:text-white/60 transition-colors"
                >
                  <X size={15} />
                </button>
              </div>
              <div className="px-4 pb-8 space-y-2.5">
                {SECONDARY_ITEMS.map(item => {
                  const Icon     = item.icon;
                  const isActive = activeView === item.id;
                  return (
                    <motion.button
                      key={item.id}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => { onNavigate(item.id); onClose(); }}
                      className={`
                        w-full flex items-center gap-4 px-4 py-4 rounded-2xl border text-left
                        transition-all touch-manipulation select-none
                        ${isActive
                          ? 'bg-[#C19A6B]/15 border-[#C19A6B]/25'
                          : 'bg-white/4 border-white/8 active:bg-white/8'
                        }
                      `}
                    >
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-[#C19A6B]/20' : 'bg-white/8'}`}>
                        <Icon size={22} className={isActive ? 'text-[#C19A6B]' : 'text-white/60'} strokeWidth={isActive ? 2.2 : 1.8} />
                      </div>
                      <div className="flex-1">
                        <p className={`text-base font-semibold ${isActive ? 'text-[#C19A6B]' : 'text-white'}`}>
                          {item.label}
                        </p>
                        <p className="text-white/35 text-xs mt-0.5">{item.desc}</p>
                      </div>
                      <ChevronRight size={16} className={isActive ? 'text-[#C19A6B]/60' : 'text-white/20'} />
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

// ─── Navigation principale — 4 onglets + Plus ──────────────────

const MAIN_NAV: { id: ViewType; label: string; icon: React.ElementType; flash?: boolean }[] = [
  { id: 'matin',    label: 'Matin',  icon: Sun    },
  { id: 'snapshot', label: 'Stock',  icon: Camera },
  { id: 'soir',     label: 'Soir',   icon: Moon   },
  { id: 'flash',    label: 'Flash',  icon: Zap, flash: true },
];

// ─── Shell ─────────────────────────────────────────────────────

function AppShell() {
  const {
    isAuthenticated, authLoading,
    activeView, setActiveView,
    logout, boulangerie,
  } = useBoulanger();

  const { startTour, tourCompleted, resetTour, loading: tourLoading } = useTour();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const isSecondaryActive = ['catalogue', 'dashboard', 'parametres'].includes(activeView);

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#1A0F0A] flex items-center justify-center">
        <div className="text-center">
          <span className="text-4xl block mb-4">🥖</span>
          <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin mx-auto" />
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return <LoginForm />;

  return (
    <div className="min-h-screen bg-[#1A0F0A]">
      {/* Grain texture */}
      <div
        className="fixed inset-0 opacity-[0.025] pointer-events-none z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#120A06]/90 backdrop-blur-md border-b border-white/6">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🥖</span>
            <div>
              <p className="text-white text-sm font-bold leading-none" style={{ fontFamily: 'Playfair Display, serif' }}>
                {boulangerie?.nom ?? "L'Artisan Doré"}
              </p>
              <p className="text-[#C19A6B]/70 text-[10px] tracking-[0.2em] uppercase leading-none mt-0.5">
                Espace boulanger
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <SyncIndicator />
            <LiveClock />
            {!tourLoading && (
              <button
                data-tour="header-help-btn"
                onClick={tourCompleted ? resetTour : startTour}
                className="w-8 h-8 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/30 hover:text-[#C19A6B]/80 hover:bg-[#C19A6B]/10 hover:border-[#C19A6B]/20 transition-all"
              >
                <HelpCircle size={15} />
              </button>
            )}
            <button
              onClick={logout}
              className="w-8 h-8 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/10 transition-all"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* Contenu */}
      <main className="relative z-10 max-w-lg mx-auto px-4 pt-20 pb-32">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
          >
            {activeView === 'matin'      && <VueMatin />}
            {activeView === 'snapshot'   && <VueSnapshot />}
            {activeView === 'soir'       && <VueSoir />}
            {activeView === 'flash'      && <VueFlash />}
            {activeView === 'catalogue'  && <Catalogue />}
            {activeView === 'dashboard'  && <Dashboard />}
            {activeView === 'parametres' && <Parametres />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Bottom Nav — 4 onglets + Plus */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#120A06]/97 backdrop-blur-md border-t border-white/10">
        <div className="grid grid-cols-5 w-full max-w-lg mx-auto h-[76px]">

          {MAIN_NAV.map(item => {
            const Icon     = item.icon;
            const isActive = activeView === item.id;
            return (
              <motion.button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                whileTap={{ scale: 0.87 }}
                className="flex flex-col items-center justify-center gap-1.5 touch-manipulation select-none"
              >
                <div className={`
                  flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all
                  ${isActive
                    ? item.flash
                      ? 'bg-yellow-400/15'
                      : 'bg-[#C19A6B]/15'
                    : ''
                  }
                `}>
                  <Icon
                    size={22}
                    strokeWidth={isActive ? 2.2 : 1.6}
                    className={isActive
                      ? item.flash ? 'text-yellow-400 fill-yellow-400/30' : 'text-[#C19A6B]'
                      : 'text-white/50'
                    }
                  />
                  <span className={`text-[10px] font-bold leading-none ${
                    isActive
                      ? item.flash ? 'text-yellow-400' : 'text-[#C19A6B]'
                      : 'text-white/50'
                  }`}>
                    {item.label}
                  </span>
                </div>
              </motion.button>
            );
          })}

          {/* Bouton Plus */}
          <motion.button
            onClick={() => setDrawerOpen(true)}
            whileTap={{ scale: 0.87 }}
            className="flex flex-col items-center justify-center gap-1.5 touch-manipulation select-none"
          >
            <div className={`
              flex flex-col items-center gap-1 px-3 py-2 rounded-2xl transition-all
              ${isSecondaryActive ? 'bg-[#C19A6B]/15' : ''}
            `}>
              {isSecondaryActive ? (
                <>
                  {activeView === 'catalogue'  && <BookOpen  size={22} strokeWidth={2.2} className="text-[#C19A6B]" />}
                  {activeView === 'dashboard'  && <BarChart2 size={22} strokeWidth={2.2} className="text-[#C19A6B]" />}
                  {activeView === 'parametres' && <Settings  size={22} strokeWidth={2.2} className="text-[#C19A6B]" />}
                  <span className="text-[10px] font-bold leading-none text-[#C19A6B]">
                    {activeView === 'catalogue' ? 'Produits' : activeView === 'dashboard' ? 'Stats' : 'Config'}
                  </span>
                </>
              ) : (
                <>
                  <MoreHorizontal size={22} strokeWidth={1.6} className="text-white/50" />
                  <span className="text-[10px] font-bold leading-none text-white/50">Plus</span>
                </>
              )}
            </div>
          </motion.button>

        </div>
      </nav>

      {/* Drawer */}
      <PlusDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onNavigate={v => setActiveView(v)}
        activeView={activeView}
      />

      <TourWizard onNavigateToView={view => setActiveView(view)} />
    </div>
  );
}

export default function BoulangerPage() {
  return (
    <BoulangerProvider>
      <AppShell />
    </BoulangerProvider>
  );
}