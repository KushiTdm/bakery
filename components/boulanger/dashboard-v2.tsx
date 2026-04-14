'use client';
// components/boulanger/dashboard-v2.tsx — Sauve Mie · Dashboard v2
// ───────────────────────────────────────────────────────────────
// Shell avec 3 onglets : Aujourd'hui | Semaine | Défis

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart2, Calendar, Flame, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Defi, GamificationProfil } from '@/lib/types';
import TabAujourdhui from './dashboard/tab-aujourdhui';
import TabSemaine from './dashboard/tab-semaine';
import TabDefis from './dashboard/tab-defis';

// ── Types ────────────────────────────────────────────────────

type DashboardTab = 'aujourdhui' | 'semaine' | 'defis';

interface DefisData {
  defisToday:  Defi[];
  defisRecent: Defi[];
  profil:      GamificationProfil | null;
}

const TABS: { id: DashboardTab; label: string; icon: React.ElementType }[] = [
  { id: 'aujourdhui', label: "Aujourd'hui", icon: BarChart2 },
  { id: 'semaine',    label: 'Semaine',     icon: Calendar },
  { id: 'defis',      label: 'Défis',       icon: Flame },
];

// ── Dashboard Shell ──────────────────────────────────────────

export default function DashboardV2() {
  const [activeTab, setActiveTab] = useState<DashboardTab>('aujourdhui');
  const [defisData, setDefisData] = useState<DefisData>({
    defisToday: [], defisRecent: [], profil: null,
  });
  const [defisLoading, setDefisLoading] = useState(true);

  const loadDefis = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const res = await fetch('/api/boulanger/defis', {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: 'no-store',
      });

      if (res.ok) {
        const json = await res.json();
        setDefisData({
          defisToday:  json.defisToday ?? [],
          defisRecent: json.defisRecent ?? [],
          profil:      json.profil ?? null,
        });
      }
    } catch {
      // silently fail
    } finally {
      setDefisLoading(false);
    }
  }, []);

  useEffect(() => { loadDefis(); }, [loadDefis]);

  const streakCount = defisData.profil?.streak_actuel ?? 0;

  return (
    <div className="space-y-4 pb-6">

      {/* ── Header ── */}
      <div className="pt-2">
        <p className="text-white/40 text-[11px] uppercase tracking-widest font-medium">Analyse</p>
        <h2
          className="text-white text-2xl font-bold mt-0.5"
          style={{ fontFamily: 'Playfair Display, serif' }}
        >
          Dashboard
        </h2>
      </div>

      {/* ── Tab Bar ── */}
      <div
        className="flex gap-1 p-1 rounded-2xl"
        style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.07)' }}
      >
        {TABS.map(tab => {
          const isActive = activeTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all relative"
              style={{
                background: isActive ? 'rgba(193,154,107,0.15)' : 'transparent',
                color: isActive ? '#C19A6B' : 'rgba(255,255,255,0.35)',
              }}
            >
              <Icon size={14} />
              <span className="hidden sm:inline">{tab.label}</span>
              {/* Streak badge on Défis tab */}
              {tab.id === 'defis' && streakCount > 0 && (
                <span
                  className="absolute -top-1 -right-0.5 min-w-[16px] h-4 px-1 rounded-full text-[9px] font-bold flex items-center justify-center"
                  style={{ background: '#E25555', color: 'white' }}
                >
                  {streakCount}
                </span>
              )}
              {isActive && (
                <motion.div
                  layoutId="dashboard-tab-indicator"
                  className="absolute bottom-0 left-2 right-2 h-[2px] rounded-full"
                  style={{ background: '#C19A6B' }}
                  transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* ── Tab Content ── */}
      <AnimatePresence mode="wait">
        {activeTab === 'aujourdhui' && (
          <motion.div
            key="aujourdhui"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
          >
            <TabAujourdhui
              defisToday={defisData.defisToday}
              onNavigateDefis={() => setActiveTab('defis')}
            />
          </motion.div>
        )}
        {activeTab === 'semaine' && (
          <motion.div
            key="semaine"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
          >
            <TabSemaine />
          </motion.div>
        )}
        {activeTab === 'defis' && (
          <motion.div
            key="defis"
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.2 }}
          >
            {defisLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 size={20} className="text-[#C19A6B]/50 animate-spin" />
              </div>
            ) : (
              <TabDefis
                defisToday={defisData.defisToday}
                defisRecent={defisData.defisRecent}
                profil={defisData.profil}
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
