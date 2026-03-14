'use client';

import {
  createContext, useContext, useEffect, useState,
  useCallback, useMemo, useRef, ReactNode,
} from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { DbJournee, DbStockJournalier } from '@/lib/supabase';

export type ViewType   = 'matin' | 'snapshot' | 'soir' | 'dashboard';
export type SyncStatus = 'idle' | 'saving' | 'saved' | 'error';

export interface StockEntry {
  id: string;
  name: string;
  emoji: string;
  category: 'boulangerie' | 'viennoiserie' | 'patisserie';
  prixVente: number;
  coutProduction: number;
  production: number;
  snapshot10h: number;
  snapshot10hDone: boolean;
  snapshot14h: number;
  snapshot14hDone: boolean;
  stockFinal: number;
}

export interface HistoryEntry {
  date: string;
  chiffreAffaires: number;
  tauxInvendu: number;
  commandesOnline: number;
  stocks: StockEntry[];
}

interface Boulangerie {
  id: string;
  nom: string;
  slug: string;
  plan: 'starter' | 'pro' | 'multi';
  actif: boolean;
  airtable_api_key: string | null;
  airtable_base_id: string | null;
}

const DEFAULT_STOCKS: StockEntry[] = [
  { id: 'b1', name: 'Baguette Tradition', emoji: '🥖', category: 'boulangerie', prixVente: 1.30, coutProduction: 0.35, production: 80, snapshot10h: 80, snapshot10hDone: false, snapshot14h: 80, snapshot14hDone: false, stockFinal: 0 },
  { id: 'b2', name: 'Pain au Levain',     emoji: '🍞', category: 'boulangerie', prixVente: 4.50, coutProduction: 1.20, production: 20, snapshot10h: 20, snapshot10hDone: false, snapshot14h: 20, snapshot14hDone: false, stockFinal: 0 },
  { id: 'b3', name: 'Pain aux Céréales',  emoji: '🌾', category: 'boulangerie', prixVente: 3.80, coutProduction: 1.00, production: 15, snapshot10h: 15, snapshot10hDone: false, snapshot14h: 15, snapshot14hDone: false, stockFinal: 0 },
  { id: 'v1', name: 'Croissant',          emoji: '🥐', category: 'viennoiserie', prixVente: 1.50, coutProduction: 0.45, production: 60, snapshot10h: 60, snapshot10hDone: false, snapshot14h: 60, snapshot14hDone: false, stockFinal: 0 },
  { id: 'v2', name: 'Pain au Chocolat',   emoji: '🍫', category: 'viennoiserie', prixVente: 1.60, coutProduction: 0.50, production: 40, snapshot10h: 40, snapshot10hDone: false, snapshot14h: 40, snapshot14hDone: false, stockFinal: 0 },
  { id: 'v3', name: 'Brioche',            emoji: '🧁', category: 'viennoiserie', prixVente: 3.20, coutProduction: 0.90, production: 10, snapshot10h: 10, snapshot10hDone: false, snapshot14h: 10, snapshot14hDone: false, stockFinal: 0 },
  { id: 'p1', name: 'Tarte au Citron',    emoji: '🍋', category: 'patisserie',   prixVente: 4.80, coutProduction: 1.50, production: 8,  snapshot10h: 8,  snapshot10hDone: false, snapshot14h: 8,  snapshot14hDone: false, stockFinal: 0 },
  { id: 'p2', name: 'Éclair au Café',     emoji: '☕', category: 'patisserie',   prixVente: 3.90, coutProduction: 1.20, production: 12, snapshot10h: 12, snapshot10hDone: false, snapshot14h: 12, snapshot14hDone: false, stockFinal: 0 },
  { id: 'p3', name: 'Millefeuille',       emoji: '🎂', category: 'patisserie',   prixVente: 4.50, coutProduction: 1.40, production: 6,  snapshot10h: 6,  snapshot10hDone: false, snapshot14h: 6,  snapshot14hDone: false, stockFinal: 0 },
];

// ── Helper : mappe un DbStockJournalier → StockEntry ──────────
function mapDbStockToEntry(s: DbStockJournalier): StockEntry {
  return {
    id:              s.produit_id,
    name:            s.produit_nom,
    emoji:           s.produit_emoji ?? '🥖',
    category:        (s.categorie ?? 'boulangerie') as StockEntry['category'],
    prixVente:       s.prix_vente,
    coutProduction:  s.cout_production,
    production:      s.production,
    snapshot10h:     s.snapshot_10h,
    snapshot10hDone: s.snapshot_10h_done,
    snapshot14h:     s.snapshot_14h,
    snapshot14hDone: s.snapshot_14h_done,
    stockFinal:      s.stock_final,
  };
}

// ── Helper : mappe une DbJournee → HistoryEntry ───────────────
function mapDbJourneeToHistory(j: DbJournee): HistoryEntry {
  return {
    date:            j.date,
    chiffreAffaires: j.ca_estime ?? 0,
    tauxInvendu:     j.taux_invendu ?? 0,
    commandesOnline: j.commandes_online ?? 0,
    stocks:          (j.stocks_journaliers ?? []).map(mapDbStockToEntry),
  };
}

interface BoulangerContextType {
  session: Session | null;
  user: User | null;
  boulangerie: Boulangerie | null;
  isAuthenticated: boolean;
  authLoading: boolean;
  logout: () => Promise<void>;
  activeView: ViewType;
  setActiveView: (v: ViewType) => void;
  syncStatus: SyncStatus;
  todayStocks: StockEntry[];
  updateProduction: (id: string, val: number) => void;
  updateSnapshot: (id: string, val: number, slot: '10h' | '14h') => void;
  validateSnapshot: (slot: '10h' | '14h') => void;
  updateStockFinal: (id: string, val: number) => void;
  commandesOnline: number;
  setCommandesOnline: (n: number) => void;
  revenueToday: number;
  unsoldToday: number;
  unsoldValueToday: number;
  unsoldRateToday: number;
  totalProducedToday: number;
  history: HistoryEntry[];
  closeDayAndSave: (commandesOnline: number) => Promise<void>;
}

const BoulangerContext = createContext<BoulangerContextType | null>(null);

export function BoulangerProvider({ children }: { children: ReactNode }) {
  const [session, setSession]         = useState<Session | null>(null);
  const [user, setUser]               = useState<User | null>(null);
  const [boulangerie, setBoulangerie] = useState<Boulangerie | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeView, setActiveView]   = useState<ViewType>('matin');
  const [syncStatus, setSyncStatus]   = useState<SyncStatus>('idle');
  const [todayStocks, setTodayStocks] = useState<StockEntry[]>(DEFAULT_STOCKS);
  const [commandesOnline, _setCommandesOnline] = useState(0);
  const [history, setHistory]         = useState<HistoryEntry[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadAll(session.user.id);
      } else {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          loadAll(session.user.id);
        } else {
          setBoulangerie(null);
          setAuthLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function getToken(): Promise<string | null> {
    const { data: { session } }: { data: { session: Session | null } } =
      await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  async function loadAll(userId: string) {
    setAuthLoading(true);
    try {
      const { data, error } = await supabase
        .from('boulangeries')
        .select('id, nom, slug, plan, actif, airtable_api_key, airtable_base_id')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      setBoulangerie(data as Boulangerie);

      await Promise.all([loadTodayData(), loadHistory()]);
    } catch (err) {
      console.error('[BoulangerContext]', err);
      setBoulangerie(null);
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadTodayData() {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/boulanger/journee', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { journee } = await res.json() as { journee: DbJournee | null };
      if (!journee?.stocks_journaliers?.length) return;
      setTodayStocks(journee.stocks_journaliers.map(mapDbStockToEntry));
      _setCommandesOnline(journee.commandes_online ?? 0);
    } catch (err) {
      console.warn('[BoulangerContext] loadTodayData:', err);
    }
  }

  async function loadHistory() {
    try {
      const token = await getToken();
      if (!token) return;
      const res = await fetch('/api/boulanger/historique?limit=30', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const { historique } = await res.json() as { historique: DbJournee[] };
      if (!historique?.length) return;
      setHistory(historique.map(mapDbJourneeToHistory));
    } catch (err) {
      console.warn('[BoulangerContext] loadHistory:', err);
    }
  }

  const triggerSave = useCallback((stocks: StockEntry[], online: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSyncStatus('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        const token = await getToken();
        if (!token) { setSyncStatus('error'); return; }
        const res = await fetch('/api/boulanger/journee', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ stocks, commandesOnline: online }),
        });
        setSyncStatus(res.ok ? 'saved' : 'error');
        setTimeout(() => setSyncStatus('idle'), 3000);
      } catch {
        setSyncStatus('error');
      }
    }, 2000);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateProduction = useCallback((id: string, val: number) => {
    setTodayStocks(prev => {
      const next = prev.map(p =>
        p.id === id
          ? { ...p, production: Math.max(0, val), snapshot10h: Math.max(0, val), snapshot14h: Math.max(0, val) }
          : p
      );
      triggerSave(next, commandesOnline);
      return next;
    });
  }, [commandesOnline, triggerSave]);

  const updateSnapshot = useCallback((id: string, val: number, slot: '10h' | '14h') => {
    setTodayStocks(prev => {
      const next = prev.map(p =>
        p.id === id
          ? slot === '10h'
            ? { ...p, snapshot10h: Math.max(0, Math.min(val, p.production)) }
            : { ...p, snapshot14h: Math.max(0, Math.min(val, p.snapshot10h)) }
          : p
      );
      triggerSave(next, commandesOnline);
      return next;
    });
  }, [commandesOnline, triggerSave]);

  const validateSnapshot = useCallback((slot: '10h' | '14h') => {
    setTodayStocks(prev => {
      const next = prev.map(p =>
        slot === '10h' ? { ...p, snapshot10hDone: true } : { ...p, snapshot14hDone: true }
      );
      triggerSave(next, commandesOnline);
      return next;
    });
  }, [commandesOnline, triggerSave]);

  const updateStockFinal = useCallback((id: string, val: number) => {
    setTodayStocks(prev => {
      const next = prev.map(p =>
        p.id === id ? { ...p, stockFinal: Math.max(0, val) } : p
      );
      triggerSave(next, commandesOnline);
      return next;
    });
  }, [commandesOnline, triggerSave]);

  const setCommandesOnline = useCallback((n: number) => {
    _setCommandesOnline(n);
    triggerSave(todayStocks, n);
  }, [todayStocks, triggerSave]);

  const closeDayAndSave = useCallback(async (online: number) => {
    setSyncStatus('saving');
    try {
      const token = await getToken();
      if (!token) { setSyncStatus('error'); return; }
      await fetch('/api/boulanger/journee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ stocks: todayStocks, commandesOnline: online }),
      });
      await fetch('/api/boulanger/journee', {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      });
      setSyncStatus('saved');
      setTimeout(() => setSyncStatus('idle'), 3000);
      await loadHistory();
    } catch {
      setSyncStatus('error');
    }
  }, [todayStocks]); // eslint-disable-line react-hooks/exhaustive-deps

  const logout = useCallback(async () => {
    await supabase.auth.signOut();
    setTodayStocks(DEFAULT_STOCKS);
    setHistory([]);
    _setCommandesOnline(0);
    setActiveView('matin');
  }, []);

  const totalProducedToday = useMemo(() => todayStocks.reduce((s, p) => s + p.production, 0), [todayStocks]);
  const unsoldToday        = useMemo(() => todayStocks.reduce((s, p) => s + p.stockFinal, 0), [todayStocks]);
  const unsoldValueToday   = useMemo(() => todayStocks.reduce((s, p) => s + p.stockFinal * p.coutProduction, 0), [todayStocks]);
  const revenueToday       = useMemo(() => todayStocks.reduce((s, p) => s + (p.production - p.stockFinal) * p.prixVente, 0), [todayStocks]);
  const unsoldRateToday    = useMemo(() => totalProducedToday > 0 ? (unsoldToday / totalProducedToday) * 100 : 0, [unsoldToday, totalProducedToday]);

  return (
    <BoulangerContext.Provider value={{
      session, user, boulangerie,
      isAuthenticated: !!session,
      authLoading, logout,
      activeView, setActiveView,
      syncStatus,
      todayStocks,
      updateProduction, updateSnapshot, validateSnapshot, updateStockFinal,
      commandesOnline, setCommandesOnline,
      revenueToday, unsoldToday, unsoldValueToday, unsoldRateToday, totalProducedToday,
      history,
      closeDayAndSave,
    }}>
      {children}
    </BoulangerContext.Provider>
  );
}

export function useBoulanger() {
  const ctx = useContext(BoulangerContext);
  if (!ctx) throw new Error('useBoulanger doit être utilisé dans <BoulangerProvider>');
  return ctx;
}