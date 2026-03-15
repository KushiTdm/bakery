// app/boulanger/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sun, Camera, Moon, BarChart2, BookOpen,
  LogOut, Cloud, CloudOff, Check, Loader2,
  HelpCircle,
} from 'lucide-react';
import { BoulangerProvider, useBoulanger } from '@/context/boulanger-context';
import LoginForm   from '@/components/boulanger/login-form';
import VueMatin    from '@/components/boulanger/vue-matin';
import VueSnapshot from '@/components/boulanger/vue-snapshot';
import VueSoir     from '@/components/boulanger/vue-soir';
import Dashboard   from '@/components/boulanger/dashboard';
import Catalogue   from '@/components/boulanger/catalogue';
import TourWizard, { useTour } from '@/components/boulanger/tour-wizard';
import type { ViewType } from '@/context/boulanger-context';

// ─── Horloge live ──────────────────────────────────────────────────────────

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

// ─── Indicateur de synchronisation ────────────────────────────────────────

function SyncIndicator() {
  const { syncStatus } = useBoulanger();

  const icons = {
    idle:   <Cloud size={13} className="text-white/20" />,
    saving: <Loader2 size={13} className="text-[#C19A6B]/70 animate-spin" />,
    saved:  <Check size={13} className="text-green-400" />,
    error:  <CloudOff size={13} className="text-red-400" />,
  };

  const labels: Record<string, string> = {
    idle:   '',
    saving: 'Sync...',
    saved:  'Sauvegardé',
    error:  'Hors ligne',
  };

  return (
    <div className="flex items-center gap-1.5">
      {icons[syncStatus]}
      {labels[syncStatus] && (
        <span className={`text-[10px] font-medium ${
          syncStatus === 'saved' ? 'text-green-400' :
          syncStatus === 'error' ? 'text-red-400'   :
          'text-[#C19A6B]/70'
        }`}>
          {labels[syncStatus]}
        </span>
      )}
    </div>
  );
}

// ─── Navigation ────────────────────────────────────────────────────────────

const NAV_ITEMS: { id: ViewType; shortLabel: string; icon: React.ElementType }[] = [
  { id: 'matin',     shortLabel: 'Matin',    icon: Sun       },
  { id: 'snapshot',  shortLabel: 'Stock',    icon: Camera    },
  { id: 'soir',      shortLabel: 'Soir',     icon: Moon      },
  { id: 'catalogue', shortLabel: 'Produits', icon: BookOpen  },
  { id: 'dashboard', shortLabel: 'Stats',    icon: BarChart2 },
];

// ─── Shell principal ───────────────────────────────────────────────────────

function AppShell() {
  const {
    isAuthenticated, authLoading,
    activeView, setActiveView,
    logout, boulangerie,
  } = useBoulanger();

  const { startTour, tourCompleted, resetTour, loading: tourLoading } = useTour();

  // ── Loading auth ──────────────────────────────────────────────────────────
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
      {/* Grain overlay */}
      <div
        className="fixed inset-0 opacity-[0.025] pointer-events-none z-0"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* ── Header ── */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-[#120A06]/90 backdrop-blur-md border-b border-white/6">
        <div className="max-w-lg mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🥖</span>
            <div>
              <p
                className="text-white text-sm font-bold leading-none"
                style={{ fontFamily: 'Playfair Display, serif' }}
              >
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

            {/* Bouton Aide — relance le tour */}
            {!tourLoading && (
              <button
                data-tour="header-help-btn"
                onClick={tourCompleted ? resetTour : startTour}
                title="Visite guidée"
                className="w-8 h-8 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/30 hover:text-[#C19A6B]/80 hover:bg-[#C19A6B]/10 hover:border-[#C19A6B]/20 transition-all"
              >
                <HelpCircle size={15} />
              </button>
            )}

            {/* Déconnexion */}
            <button
              onClick={logout}
              className="w-8 h-8 rounded-xl bg-white/5 border border-white/8 flex items-center justify-center text-white/25 hover:text-white/60 hover:bg-white/10 transition-all"
              title="Déconnexion"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </header>

      {/* ── Contenu ── */}
      <main className="relative z-10 max-w-lg mx-auto px-4 pt-20 pb-28">
        <AnimatePresence mode="wait">
          <motion.div
            key={activeView}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -14 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
          >
            {activeView === 'matin'     && <VueMatin />}
            {activeView === 'snapshot'  && <VueSnapshot />}
            {activeView === 'soir'      && <VueSoir />}
            {activeView === 'catalogue' && <Catalogue />}
            {activeView === 'dashboard' && <Dashboard />}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* ── Bottom Nav ── */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#120A06]/97 backdrop-blur-md border-t border-white/10">
        <div className="grid grid-cols-5 w-full px-1 h-[68px]">
          {NAV_ITEMS.map(item => {
            const Icon     = item.icon;
            const isActive = activeView === item.id;
            return (
              <motion.button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                whileTap={{ scale: 0.90 }}
                className="flex flex-col items-center justify-center gap-1.5 py-2 transition-all duration-200"
              >
                <div className={`relative flex flex-col items-center gap-1.5 px-2 py-1.5 rounded-xl w-full transition-all ${
                  isActive ? 'bg-[#C19A6B]/15' : ''
                }`}>
                  <Icon
                    size={19}
                    strokeWidth={isActive ? 2.2 : 1.6}
                    className={isActive ? 'text-[#C19A6B]' : 'text-white/60'}
                  />
                  <span className={`text-[10px] font-semibold leading-none ${
                    isActive ? 'text-[#C19A6B]' : 'text-white/60'
                  }`}>
                    {item.shortLabel}
                  </span>
                </div>
              </motion.button>
            );
          })}
        </div>
      </nav>

      {/* ── Tour Wizard (rendu dans un portal, z-index 9000+) ── */}
      <TourWizard onNavigateToView={(view) => setActiveView(view)} />
    </div>
  );
}

// ─── Page export ───────────────────────────────────────────────────────────

export default function BoulangerPage() {
  return (
    <BoulangerProvider>
      <AppShell />
    </BoulangerProvider>
  );
}