'use client';

import {
  createContext, useContext, useEffect, useState,
  useCallback, useMemo, useRef, ReactNode,
} from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { DbJournee, DbStockJournalier } from '@/lib/supabase';

// 🆕 'parametres' ajouté
export type ViewType = 'matin' | 'snapshot' | 'soir' | 'catalogue' | 'dashboard' | 'parametres';
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

function mapDbStockToEntry(s: DbStockJournalier): StockEntry {
  return {
    id:              s.produit_id,
    name:            s.produit_nom,
    emoji:           s.produit_emoji ?? '🥖',
    category:        (s.categorie ?? 'boulangerie') as StockEntry['category'],
    prixVente:       s.prix_vente,
    coutProduction:  s.cout_production,
    production:      s.production,
    // ✅ Si non validé, repart de 0 — la vendeuse saisit ce qui reste
    snapshot10h:     s.snapshot_10h_done ? s.snapshot_10h : 0,
    snapshot10hDone: s.snapshot_10h_done,
    snapshot14h:     s.snapshot_14h_done ? s.snapshot_14h : 0,
    snapshot14hDone: s.snapshot_14h_done,
    stockFinal:      s.stock_final,
  };
}

interface ProduitDb {
  id: string;
  nom: string;
  emoji: string;
  categorie: 'boulangerie' | 'viennoiserie' | 'patisserie';
  prix_vente: number;
  cout_production: number;
}

function produitToStockEntry(p: ProduitDb): StockEntry {
  return {
    id:              p.id,
    name:            p.nom,
    emoji:           p.emoji ?? '🥖',
    category:        p.categorie,
    prixVente:       p.prix_vente,
    coutProduction:  p.cout_production,
    production:      0,
    // ✅ Snapshot démarre à 0 — la vendeuse saisit ce qui reste, pas une copie de la production
    snapshot10h:     0,
    snapshot10hDone: false,
    snapshot14h:     0,
    snapshot14hDone: false,
    stockFinal:      0,
  };
}

function mapDbJourneeToHistory(j: DbJournee): HistoryEntry {
  return {
    date:            j.date,
    chiffreAffaires: j.ca_estime ?? 0,
    tauxInvendu:     j.taux_invendu ?? 0,
    commandesOnline: j.commandes_online ?? 0,
    stocks:          (j.stocks_journaliers ?? []).map(mapDbStockToEntry),
  };
}

export interface ProductionSuggestion {
  id:            string;
  name:          string;
  emoji:         string;
  avgProduction: number;
  suggestedQty:  number;
  dataPoints:    number;
  changePercent: number;
  confidence:    'high' | 'medium' | 'low';
}

function computeProductionSuggestions(
  history: HistoryEntry[],
  todayStocks: StockEntry[],
  targetDayOfWeek: number
): ProductionSuggestion[] {
  if (history.length === 0) return todayStocks.map(s => ({
    id: s.id, name: s.name, emoji: s.emoji,
    avgProduction: s.production, suggestedQty: s.production,
    dataPoints: 0, changePercent: 0, confidence: 'low' as const,
  }));

  const sameDayHistory = history.filter(
    d => new Date(d.date + 'T12:00:00').getDay() === targetDayOfWeek
  );

  return todayStocks.map(stock => {
    const relevant = sameDayHistory.length >= 1 ? sameDayHistory : history;
    const dataPoints = relevant.length;
    const productions = relevant
      .map(d => d.stocks.find(s => s.id === stock.id)?.production ?? 0)
      .filter(v => v > 0);

    if (productions.length === 0) {
      return {
        id: stock.id, name: stock.name, emoji: stock.emoji,
        avgProduction: stock.production, suggestedQty: stock.production,
        dataPoints: 0, changePercent: 0, confidence: 'low' as const,
      };
    }

    const avg = productions.reduce((s, v) => s + v, 0) / productions.length;
    const suggestedQty = Math.max(1, Math.round(avg / 5) * 5);
    const changePercent = stock.production > 0
      ? Math.round(((suggestedQty - stock.production) / stock.production) * 100)
      : 0;
    const confidence: ProductionSuggestion['confidence'] =
      productions.length >= 4 ? 'high' :
      productions.length >= 2 ? 'medium' : 'low';

    return {
      id: stock.id, name: stock.name, emoji: stock.emoji,
      avgProduction: Math.round(avg), suggestedQty,
      dataPoints, changePercent, confidence,
    };
  });
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
  productionSuggestions: ProductionSuggestion[];
}

const BoulangerContext = createContext<BoulangerContextType | null>(null);

export function BoulangerProvider({ children }: { children: ReactNode }) {
  const [session, setSession]         = useState<Session | null>(null);
  const [user, setUser]               = useState<User | null>(null);
  const [boulangerie, setBoulangerie] = useState<Boulangerie | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeView, setActiveView]   = useState<ViewType>('matin');
  const [syncStatus, setSyncStatus]   = useState<SyncStatus>('idle');
  const [todayStocks, setTodayStocks] = useState<StockEntry[]>([]);
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
          setTodayStocks([]);
          setHistory([]);
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
      await Promise.all([loadTodayData(data.id), loadHistory()]);
    } catch (err) {
      console.error('[BoulangerContext]', err);
      setBoulangerie(null);
    } finally {
      setAuthLoading(false);
    }
  }

  async function loadTodayData(boulangerieId?: string) {
    try {
      const token = await getToken();
      if (!token) return;

      const res = await fetch('/api/boulanger/journee', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        await loadProduitsAsList(token);
        return;
      }
      const { journee } = await res.json() as { journee: DbJournee | null };

      if (journee?.stocks_journaliers?.length) {
        // Si la journée n'est pas clôturée, le stockFinal repart de 0 au chargement
        // (la vendeuse doit resaisir les invendus en fin de journée)
        const isClosed = journee.cloturee === true;
        const stocks = journee.stocks_journaliers.map(s => {
          const entry = mapDbStockToEntry(s);
          if (!isClosed) {
            entry.stockFinal = 0; // Repart de zéro — vendeuse saisit les restes
          }
          return entry;
        });
        setTodayStocks(stocks);
        _setCommandesOnline(journee.commandes_online ?? 0);
      } else {
        await loadProduitsAsList(token);
      }
    } catch (err) {
      console.warn('[BoulangerContext] loadTodayData:', err);
    }
  }

  async function loadProduitsAsList(token: string) {
    try {
      const res = await fetch('/api/boulanger/produits', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      });
      if (!res.ok) return;
      const { produits } = await res.json() as { produits: ProduitDb[] };
      if (produits?.length) {
        setTodayStocks(produits.map(produitToStockEntry));
      }
    } catch (err) {
      console.warn('[BoulangerContext] loadProduitsAsList:', err);
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
          // ✅ Snapshots restent à 0 — la vendeuse saisit les restes indépendamment
          ? { ...p, production: Math.max(0, val) }
          : p
      );
      triggerSave(next, commandesOnline);
      return next;
    });
  }, [commandesOnline, triggerSave]);

  const updateSnapshot = useCallback((id: string, val: number, slot: '10h' | '14h') => {
    setTodayStocks(prev => {
      const next = prev.map(p => {
        if (p.id !== id) return p;
        if (slot === '10h') {
          // Max = production
          return { ...p, snapshot10h: Math.max(0, Math.min(val, p.production)) };
        } else {
          // Max = snapshot10h si validé, sinon production (fallback si 10h pas fait)
          const max14h = p.snapshot10hDone && p.snapshot10h > 0 ? p.snapshot10h : p.production;
          return { ...p, snapshot14h: Math.max(0, Math.min(val, max14h)) };
        }
      });
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
      const next = prev.map(p => {
        if (p.id !== id) return p;
        // ✅ Plafond = dernier snapshot validé (14h > 10h > production)
        // Impossible de déclarer plus d'invendus que ce qui restait physiquement
        const maxFinal = p.snapshot14hDone && p.snapshot14h > 0
          ? p.snapshot14h
          : p.snapshot10hDone && p.snapshot10h > 0
            ? p.snapshot10h
            : p.production;
        return { ...p, stockFinal: Math.max(0, Math.min(val, maxFinal)) };
      });
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
    setTodayStocks([]);
    setHistory([]);
    _setCommandesOnline(0);
    setActiveView('matin');
    setBoulangerie(null);
  }, []);

  const totalProducedToday = useMemo(() => todayStocks.reduce((s, p) => s + p.production, 0), [todayStocks]);
  const unsoldToday        = useMemo(() => todayStocks.reduce((s, p) => s + p.stockFinal, 0), [todayStocks]);
  const unsoldValueToday   = useMemo(() => todayStocks.reduce((s, p) => s + p.stockFinal * p.coutProduction, 0), [todayStocks]);
  const revenueToday       = useMemo(() => todayStocks.reduce((s, p) => s + (p.production - p.stockFinal) * p.prixVente, 0), [todayStocks]);
  const unsoldRateToday    = useMemo(() => totalProducedToday > 0 ? (unsoldToday / totalProducedToday) * 100 : 0, [unsoldToday, totalProducedToday]);

  const productionSuggestions = useMemo(
    () => computeProductionSuggestions(history, todayStocks, new Date().getDay()),
    [history, todayStocks]
  );

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
      productionSuggestions,
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