'use client';

import {
  createContext, useContext, useEffect, useState,
  useCallback, useMemo, useRef, ReactNode,
} from 'react';
import type { AuthChangeEvent, Session } from '@supabase/supabase-js';
import { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { DbJournee, DbStockJournalier } from '@/lib/supabase';
// I2 : types partagés dans lib/types.ts (importable côté serveur aussi)
import type {
  ViewType, SyncStatus,
  StockEntry, HistoryEntry, ProductionSuggestion,
  BoulangerRole, PermissionsMap, PermissionKey,
} from '@/lib/types';
import {
  DEFAULT_PERMISSIONS, mergePermissions, permissionSatisfies,
} from '@/lib/types';

export type { ViewType, SyncStatus, StockEntry, HistoryEntry, ProductionSuggestion };

interface Boulangerie {
  id:    string;
  nom:   string;
  slug:  string;
  plan:  'starter' | 'pro' | 'multi';
  actif: boolean;
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
    snapshot10h:     s.snapshot_10h_done ? s.snapshot_10h : 0,
    snapshot10hDone: s.snapshot_10h_done,
    snapshot14h:     s.snapshot_14h_done ? s.snapshot_14h : 0,
    snapshot14hDone: s.snapshot_14h_done,
    stockFinal:      s.stock_final,
  };
}

interface ProduitDb {
  id:              string;
  nom:             string;
  emoji:           string;
  categorie:       'boulangerie' | 'viennoiserie' | 'patisserie';
  prix_vente:      number;
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
    const relevant    = sameDayHistory.length >= 1 ? sameDayHistory : history;
    const dataPoints  = relevant.length;
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

    const avg           = productions.reduce((s, v) => s + v, 0) / productions.length;
    const suggestedQty  = Math.max(1, Math.round(avg / 5) * 5);
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
  session:             Session | null;
  user:                User | null;
  boulangerie:         Boulangerie | null;
  isAuthenticated:     boolean;
  authLoading:         boolean;
  logout:              () => Promise<void>;

  // ── Multi-user : rôle & permissions ──────────────────────────
  userRole:    BoulangerRole | null;
  memberId:    string | null;   // undefined pour le owner
  permissions: PermissionsMap;
  canRead:     (feature: PermissionKey) => boolean;
  canWrite:    (feature: PermissionKey) => boolean;

  activeView:          ViewType;
  setActiveView:       (v: ViewType) => void;
  syncStatus:          SyncStatus;
  todayStocks:         StockEntry[];
  updateProduction:    (id: string, val: number) => void;
  updateSnapshot:      (id: string, val: number, slot: '10h' | '14h') => void;
  validateSnapshot:    (slot: '10h' | '14h') => void;
  updateStockFinal:    (id: string, val: number) => void;
  commandesOnline:     number;
  setCommandesOnline:  (n: number) => void;
  revenueToday:        number;
  unsoldToday:         number;
  unsoldValueToday:    number;
  unsoldRateToday:     number;
  totalProducedToday:  number;
  history:             HistoryEntry[];
  closeDayAndSave:     (commandesOnline: number) => Promise<void>;
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

  // ── Multi-user state ─────────────────────────────────────────
  const [userRole, setUserRole]       = useState<BoulangerRole | null>(null);
  const [memberId, setMemberId]       = useState<string | null>(null);
  const [permissions, setPermissions] = useState<PermissionsMap>(DEFAULT_PERMISSIONS.owner);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Helpers permissions ───────────────────────────────────────
  const canRead  = useCallback((feature: PermissionKey) =>
    permissionSatisfies(permissions[feature], 'read'), [permissions]);
  const canWrite = useCallback((feature: PermissionKey) =>
    permissionSatisfies(permissions[feature], 'write'), [permissions]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        loadAll();
      } else {
        setAuthLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: AuthChangeEvent, session: Session | null) => {
        setSession(session);
        setUser(session?.user ?? null);
        if (session?.user) {
          loadAll();
        } else {
          resetState();
          setAuthLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function resetState() {
    setBoulangerie(null);
    setUserRole(null);
    setMemberId(null);
    setPermissions(DEFAULT_PERMISSIONS.owner);
    setTodayStocks([]);
    setHistory([]);
    _setCommandesOnline(0);
    setActiveView('matin');
  }

  async function getToken(): Promise<string | null> {
    const { data: { session } }: { data: { session: Session | null } } =
      await supabase.auth.getSession();
    return session?.access_token ?? null;
  }

  // ── loadAll — utilise get_current_user_access() pour owner ET employés ──
  // Fallback : si le RPC n'existe pas encore (migration non exécutée),
  // on retombe sur la requête directe à boulangeries (comportement v1).
  async function loadAll() {
    setAuthLoading(true);
    try {
      // Tentative via RPC multi-user (migration-multiuser.sql)
      const { data: rpcData, error: rpcError } = await supabase.rpc('get_current_user_access');

      if (!rpcError && rpcData && rpcData.length > 0) {
        const row = rpcData[0];
        setBoulangerie({
          id:    row.boulangerie_id,
          nom:   row.boulangerie_nom,
          slug:  row.boulangerie_slug,
          plan:  row.boulangerie_plan,
          actif: row.boulangerie_actif,
        });
        const role = row.user_role as BoulangerRole;
        setUserRole(role);
        setMemberId(row.membre_id ?? null);
        setPermissions(mergePermissions(role, (row.custom_permissions ?? {}) as Partial<PermissionsMap>));
        await Promise.all([loadTodayData(), loadHistory()]);
        return;
      }

      // Fallback v1 : requête directe (migration multiuser pas encore exécutée)
      const { data: { user: currentUser } } = await supabase.auth.getUser();
      if (!currentUser) { setBoulangerie(null); return; }

      const { data, error } = await supabase
        .from('boulangeries')
        .select('id, nom, slug, plan, actif')
        .eq('user_id', currentUser.id)
        .single();

      if (error || !data) { setBoulangerie(null); setUserRole(null); return; }

      setBoulangerie(data as Boulangerie);
      setUserRole('owner');
      setMemberId(null);
      setPermissions(DEFAULT_PERMISSIONS.owner);
      await Promise.all([loadTodayData(), loadHistory()]);

    } catch (err) {
      console.error('[BoulangerContext]', err);
      setBoulangerie(null);
      setUserRole(null);
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
      if (!res.ok) { await loadProduitsAsList(token); return; }
      const { journee } = await res.json() as { journee: DbJournee | null };

      if (journee?.stocks_journaliers?.length) {
        const isClosed = journee.cloturee === true;
        const stocks = journee.stocks_journaliers.map(s => {
          const entry = mapDbStockToEntry(s);
          if (!isClosed) entry.stockFinal = 0;
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
      if (produits?.length) setTodayStocks(produits.map(produitToStockEntry));
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
      const next = prev.map(p => p.id === id ? { ...p, production: Math.max(0, val) } : p);
      triggerSave(next, commandesOnline);
      return next;
    });
  }, [commandesOnline, triggerSave]);

  const updateSnapshot = useCallback((id: string, val: number, slot: '10h' | '14h') => {
    setTodayStocks(prev => {
      const next = prev.map(p => {
        if (p.id !== id) return p;
        if (slot === '10h') {
          return { ...p, snapshot10h: Math.max(0, Math.min(val, p.production)) };
        } else {
          // FIX : max14h basé sur snapshot10hDone uniquement (pas snapshot10h > 0)
          // Si snapshot10hDone=true et snapshot10h=0 → max=0 (tout vendu à 10h)
          // Si snapshot10hDone=false → max=production (pas encore de snapshot 10h)
          const max14h = p.snapshot10hDone ? p.snapshot10h : p.production;
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
    // P1-2 : Révoque TOUS les tokens (access + refresh) sur tous les appareils
    // Un employé révoqué ne peut plus utiliser son refresh_token
    await supabase.auth.signOut({ scope: 'global' });
    resetState();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const totalProducedToday = useMemo(() => todayStocks.reduce((s, p) => s + p.production, 0),   [todayStocks]);
  const unsoldToday        = useMemo(() => todayStocks.reduce((s, p) => s + p.stockFinal, 0),    [todayStocks]);
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
      userRole, memberId, permissions, canRead, canWrite,
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